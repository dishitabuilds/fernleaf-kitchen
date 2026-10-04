import { Injectable } from '@nestjs/common';
import type {
  InvoicePage, InvoiceSummary, InvoiceDetail, InvoiceOrderSummary,
  BillingCreditResponse, UninvoicedOrderSummary, StaffIdentity,
} from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { PrismaService } from '../../database/prisma.service';
import { serializable } from '../../common/transaction';
import type { CreateInvoiceDto, PayInvoiceDto, CreateCreditDto, InvoiceQueryDto } from './billing.dto';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── List invoices ────────────────────────────────────────────────
  async list(query: InvoiceQueryDto): Promise<InvoicePage> {
    const where = query.companyId ? { companyId: query.companyId } : {};
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, orderBy: { issuedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { company: { select: { name: true } }, orders: { select: { id: true } }, credits: { select: { amountMinor: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      items: items.map((inv) => this.toSummary(inv)),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  // ── Read single invoice ──────────────────────────────────────────
  async read(id: string): Promise<InvoiceDetail> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        orders: { select: { id: true, number: true, employeeName: true, deliveryDate: true, totalMinor: true, status: true } },
        credits: { select: { id: true, invoiceId: true, orderId: true, amountMinor: true, reason: true, createdAt: true, order: { select: { number: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!inv) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found.');
    const creditTotal = inv.credits.reduce((s, c) => s + c.amountMinor, 0);
    return {
      ...this.toSummary(inv),
      orders: inv.orders.map((o): InvoiceOrderSummary => ({
        id: o.id, number: o.number, employeeName: o.employeeName,
        deliveryDate: o.deliveryDate, totalMinor: o.totalMinor ?? 0, status: o.status,
      })),
      credits: inv.credits.map((c): BillingCreditResponse => ({
        id: c.id, invoiceId: c.invoiceId, orderId: c.orderId,
        orderNumber: c.order.number, amountMinor: c.amountMinor,
        reason: c.reason, createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  // ── Uninvoiced orders for a company ──────────────────────────────
  async uninvoicedOrders(companyId: string): Promise<UninvoicedOrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: { companyId, invoiceId: null, status: { in: ['CONFIRMED', 'DELIVERED'] }, totalMinor: { not: null } },
      select: { id: true, number: true, employeeName: true, deliveryDate: true, totalMinor: true, status: true },
      orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
    });
    return orders.map((o) => ({
      id: o.id, number: o.number, employeeName: o.employeeName,
      deliveryDate: o.deliveryDate, totalMinor: o.totalMinor ?? 0, status: o.status,
    }));
  }

  // ── Create invoice ───────────────────────────────────────────────
  // Uses serializable transaction to prevent double-invoicing.
  async createInvoice(dto: CreateInvoiceDto, actor: StaffIdentity): Promise<InvoiceDetail> {
    if (!dto.orderIds.length) throw new ApiError(400, 'NO_ORDERS', 'Select at least one order.');
    return serializable(this.prisma, async (tx) => {
      // Idempotency: check if this action already completed
      const existing = await tx.invoice.findFirst({
        where: { orders: { some: { id: { in: dto.orderIds } } } },
        select: { id: true },
      });
      // Lock and validate all selected orders
      const orders = await tx.order.findMany({
        where: { id: { in: dto.orderIds } },
        select: { id: true, companyId: true, status: true, totalMinor: true, invoiceId: true },
      });
      if (orders.length !== dto.orderIds.length) {
        throw new ApiError(404, 'ORDER_NOT_FOUND', 'One or more selected orders do not exist.');
      }
      for (const order of orders) {
        if (order.companyId !== dto.companyId) throw new ApiError(400, 'COMPANY_MISMATCH', 'All orders must belong to the selected company.');
        if (order.invoiceId !== null) throw new ApiError(409, 'ORDER_ALREADY_INVOICED', `Order is already on invoice. Refresh and try again.`);
        if (!['CONFIRMED', 'DELIVERED'].includes(order.status)) throw new ApiError(400, 'ORDER_NOT_BILLABLE', 'Only confirmed or delivered orders can be invoiced.');
        if (order.totalMinor === null) throw new ApiError(400, 'ORDER_MISSING_TOTAL', 'Order has no recorded total.');
      }
      const totalMinor = orders.reduce((s, o) => s + (o.totalMinor ?? 0), 0);
      const invoice = await tx.invoice.create({
        data: { companyId: dto.companyId, totalMinor },
      });
      // Claim all orders atomically
      await tx.order.updateMany({
        where: { id: { in: dto.orderIds }, invoiceId: null },
        data: { invoiceId: invoice.id },
      });
      // Verify all were claimed (unique constraint on invoiceId prevents double-claiming)
      const claimed = await tx.order.count({ where: { invoiceId: invoice.id } });
      if (claimed !== dto.orderIds.length) {
        throw new ApiError(409, 'INVOICE_RACE', 'Some orders were claimed by another invoice. Refresh and try again.');
      }
      return this.readInTransaction(tx, invoice.id);
    });
  }

  // ── Pay invoice ──────────────────────────────────────────────────
  async payInvoice(id: string, dto: PayInvoiceDto, actor: StaffIdentity): Promise<InvoiceDetail> {
    return serializable(this.prisma, async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { credits: { select: { amountMinor: true } } },
      });
      if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found.');
      if (invoice.paidAt) throw new ApiError(409, 'ALREADY_PAID', 'This invoice has already been marked as paid.');
      await tx.invoice.update({
        where: { id },
        data: { paidAmountMinor: dto.amountMinor, paidAt: new Date() },
      });
      return this.readInTransaction(tx, id);
    });
  }

  // ── Create credit ────────────────────────────────────────────────
  async createCredit(invoiceId: string, dto: CreateCreditDto, actor: StaffIdentity): Promise<InvoiceDetail> {
    return serializable(this.prisma, async (tx) => {
      // Idempotency check
      const existingCredit = await tx.billingCredit.findUnique({ where: { actionKey: dto.actionId } });
      if (existingCredit) return this.readInTransaction(tx, invoiceId);

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { credits: { select: { amountMinor: true } } },
      });
      if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found.');
      // Verify order belongs to this invoice
      const order = await tx.order.findFirst({
        where: { id: dto.orderId, invoiceId },
        select: { id: true, totalMinor: true },
      });
      if (!order) throw new ApiError(400, 'ORDER_NOT_ON_INVOICE', 'This order is not on this invoice.');
      // Credit limits: total credits for this order cannot exceed its invoiced amount
      const existingOrderCredits = await tx.billingCredit.aggregate({
        where: { orderId: dto.orderId },
        _sum: { amountMinor: true },
      });
      const currentCredits = existingOrderCredits._sum.amountMinor ?? 0;
      if (currentCredits + dto.amountMinor > (order.totalMinor ?? 0)) {
        throw new ApiError(400, 'CREDIT_EXCEEDS_ORDER', 'Total credits for this order cannot exceed its invoiced amount.');
      }
      await tx.billingCredit.create({
        data: {
          invoiceId, orderId: dto.orderId,
          amountMinor: dto.amountMinor, reason: dto.reason,
          actionKey: dto.actionId,
        },
      });
      return this.readInTransaction(tx, invoiceId);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────
  private toSummary(inv: {
    id: string; number: number; companyId: string; totalMinor: number;
    paidAmountMinor: number; issuedAt: Date; paidAt: Date | null;
    company: { name: string }; orders: { id: string }[];
    credits: { amountMinor: number }[];
  }): InvoiceSummary {
    const creditTotal = inv.credits.reduce((s, c) => s + c.amountMinor, 0);
    const netDue = inv.totalMinor - creditTotal - inv.paidAmountMinor;
    return {
      id: inv.id, number: inv.number, companyId: inv.companyId,
      companyName: inv.company.name, totalMinor: inv.totalMinor,
      paidAmountMinor: inv.paidAmountMinor, creditTotalMinor: creditTotal,
      netDueMinor: netDue, issuedAt: inv.issuedAt.toISOString(),
      paidAt: inv.paidAt?.toISOString() ?? null, orderCount: inv.orders.length,
    };
  }

  private async readInTransaction(tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0], id: string): Promise<InvoiceDetail> {
    const inv = await tx.invoice.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        orders: { select: { id: true, number: true, employeeName: true, deliveryDate: true, totalMinor: true, status: true } },
        credits: { select: { id: true, invoiceId: true, orderId: true, amountMinor: true, reason: true, createdAt: true, order: { select: { number: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!inv) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found.');
    const creditTotal = inv.credits.reduce((s, c) => s + c.amountMinor, 0);
    const netDue = inv.totalMinor - creditTotal - inv.paidAmountMinor;
    return {
      id: inv.id, number: inv.number, companyId: inv.companyId,
      companyName: inv.company.name, totalMinor: inv.totalMinor,
      paidAmountMinor: inv.paidAmountMinor, creditTotalMinor: creditTotal,
      netDueMinor: netDue, issuedAt: inv.issuedAt.toISOString(),
      paidAt: inv.paidAt?.toISOString() ?? null, orderCount: inv.orders.length,
      orders: inv.orders.map((o) => ({
        id: o.id, number: o.number, employeeName: o.employeeName,
        deliveryDate: o.deliveryDate, totalMinor: o.totalMinor ?? 0, status: o.status,
      })),
      credits: inv.credits.map((c) => ({
        id: c.id, invoiceId: c.invoiceId, orderId: c.orderId,
        orderNumber: c.order.number, amountMinor: c.amountMinor,
        reason: c.reason, createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
