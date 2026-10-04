import { Injectable } from '@nestjs/common';
import type { InvoicePage, InvoiceSummary, InvoiceDetail, InvoiceOrderSummary, BillingCreditResponse, UninvoicedOrderSummary, StaffIdentity, CompanyPurchaseSnapshot } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { MAX_MINOR } from '../../domain/money';
import { OperationsAction } from '../operations/operations.action';
import type { CreateInvoiceDto, PayInvoiceDto, CreateCreditDto, InvoiceQueryDto } from './billing.dto';

const invoiceInclude = {
  orders: { select: { id: true, number: true, employeeName: true, deliveryDate: true, totalMinor: true, status: true, companySnapshot: true }, orderBy: { number: 'asc' } },
  credits: { select: { id: true, invoiceId: true, orderId: true, amountMinor: true, reason: true, createdAt: true, order: { select: { number: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
} satisfies Prisma.InvoiceInclude;
type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly actions: OperationsAction, private readonly clock: Clock) {}

  async list(query: InvoiceQueryDto): Promise<InvoicePage> {
    const where = query.companyId ? { companyId: query.companyId } : {};
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: invoiceInclude }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: items.map((invoice) => this.summary(invoice)), total, page: query.page, pageSize: query.pageSize };
  }

  async read(id: string): Promise<InvoiceDetail> { return this.readInTransaction(this.prisma, id); }

  async uninvoicedOrders(companyId: string): Promise<UninvoicedOrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: { companyId, invoiceId: null, status: { in: ['CONFIRMED', 'DELIVERED'] }, totalMinor: { not: null } },
      select: { id: true, number: true, employeeName: true, deliveryDate: true, totalMinor: true, status: true }, orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
    });
    return orders.map((order) => ({ ...order, totalMinor: order.totalMinor! }));
  }

  async createInvoice(dto: CreateInvoiceDto, actor: StaffIdentity): Promise<InvoiceDetail> {
    const orderIds = [...dto.orderIds].sort();
    if (!orderIds.length) throw new ApiError(400, 'NO_ORDERS', 'Select at least one order.');
    if (new Set(orderIds).size !== orderIds.length) throw new ApiError(400, 'DUPLICATE_ORDER', 'Select each order only once.');
    return this.actions.run(actor, dto.actionId, { action: 'invoice-create', companyId: dto.companyId, orderIds }, async (tx) => {
      const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, orderBy: { number: 'asc' }, select: { id: true, companyId: true, status: true, totalMinor: true, invoiceId: true, companySnapshot: true } });
      if (orders.length !== orderIds.length) throw new ApiError(404, 'ORDER_NOT_FOUND', 'One or more selected orders do not exist.');
      for (const order of orders) {
        if (order.companyId !== dto.companyId) throw new ApiError(400, 'COMPANY_MISMATCH', 'All orders must belong to the selected company.');
        if (order.invoiceId !== null) throw new ApiError(409, 'ORDER_ALREADY_INVOICED', 'An order is already on an invoice. Refresh and try again.');
        if (!['CONFIRMED', 'DELIVERED'].includes(order.status)) throw new ApiError(400, 'ORDER_NOT_BILLABLE', 'Only confirmed or delivered orders can be invoiced.');
        if (order.totalMinor === null) throw new ApiError(400, 'ORDER_MISSING_TOTAL', 'Order has no recorded total.');
      }
      const total = orders.reduce((sum, order) => sum + BigInt(order.totalMinor!), 0n);
      if (total > BigInt(MAX_MINOR)) throw new ApiError(400, 'INVOICE_TOTAL_OVERFLOW', 'Invoice total exceeds the supported range. Select fewer orders.');
      const invoice = await tx.invoice.create({ data: { companyId: dto.companyId, companySnapshot: orders[0].companySnapshot as Prisma.InputJsonValue, totalMinor: Number(total), issuedAt: this.clock.now() } });
      const claimed = await tx.order.updateMany({ where: { id: { in: orderIds }, invoiceId: null, companyId: dto.companyId, status: { in: ['CONFIRMED', 'DELIVERED'] } }, data: { invoiceId: invoice.id } });
      if (claimed.count !== orderIds.length) throw new ApiError(409, 'INVOICE_RACE', 'An order changed during invoice creation. Refresh and try again.');
      for (const order of orders) await tx.orderEvent.create({ data: { orderId: order.id, actionKey: `invoice:${actor.id}:${dto.actionId}`, type: 'INVOICED', actorId: actor.id, actorName: actor.displayName, details: { invoiceId: invoice.id, invoiceNumber: invoice.number }, createdAt: this.clock.now() } });
      return this.readInTransaction(tx, invoice.id);
    });
  }

  async payInvoice(id: string, dto: PayInvoiceDto, actor: StaffIdentity): Promise<InvoiceDetail> {
    return this.actions.run(actor, dto.actionId, { action: 'invoice-pay', id, amountMinor: dto.amountMinor }, async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: invoiceInclude });
      if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found.');
      if (invoice.paidAt) throw new ApiError(409, 'ALREADY_PAID', 'This invoice has already been marked paid.');
      const due = this.summary(invoice).netDueMinor;
      if (due < 0 || dto.amountMinor !== due) throw new ApiError(409, 'PAYMENT_AMOUNT_CHANGED', 'Record exactly the current outstanding amount. Refresh the invoice before marking paid.');
      await tx.invoice.update({ where: { id }, data: { paidAmountMinor: invoice.paidAmountMinor + due, paidAt: this.clock.now() } });
      for (const order of invoice.orders) await tx.orderEvent.create({ data: { orderId: order.id, actionKey: `payment:${actor.id}:${dto.actionId}`, type: 'INVOICE_PAID', actorId: actor.id, actorName: actor.displayName, details: { invoiceId: id, amountMinor: due }, createdAt: this.clock.now() } });
      return this.readInTransaction(tx, id);
    });
  }

  async createCredit(invoiceId: string, dto: CreateCreditDto, actor: StaffIdentity): Promise<InvoiceDetail> {
    return this.actions.run(actor, dto.actionId, { action: 'invoice-credit', invoiceId, orderId: dto.orderId, amountMinor: dto.amountMinor, reason: dto.reason }, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: dto.orderId, invoiceId }, select: { id: true, totalMinor: true, status: true } });
      if (!order) throw new ApiError(400, 'ORDER_NOT_ON_INVOICE', 'This order is not on this invoice.');
      if (order.status !== 'DELIVERED') throw new ApiError(409, 'SHORTAGE_REQUIRES_DELIVERY', 'Partial shortage credits apply to delivered orders. Cancel a confirmed order with an Admin reason for a full remaining credit.');
      const current = await tx.billingCredit.aggregate({ where: { orderId: dto.orderId }, _sum: { amountMinor: true } });
      if (BigInt(current._sum.amountMinor ?? 0) + BigInt(dto.amountMinor) > BigInt(order.totalMinor!)) throw new ApiError(400, 'CREDIT_EXCEEDS_ORDER', 'Total credits cannot exceed this order’s original invoiced amount.');
      await tx.billingCredit.create({ data: { invoiceId, orderId: dto.orderId, amountMinor: dto.amountMinor, reason: dto.reason, actionKey: `credit:${actor.id}:${dto.actionId}`, createdAt: this.clock.now() } });
      await tx.orderEvent.create({ data: { orderId: dto.orderId, actionKey: `credit:${actor.id}:${dto.actionId}`, type: 'BILLING_CREDIT_CREATED', actorId: actor.id, actorName: actor.displayName, reason: dto.reason, details: { invoiceId, amountMinor: dto.amountMinor, policy: 'DELIVERED_SHORTAGE' }, createdAt: this.clock.now() } });
      return this.readInTransaction(tx, invoiceId);
    });
  }

  private summary(invoice: InvoiceRecord): InvoiceSummary {
    const creditTotalMinor = invoice.credits.reduce((sum, credit) => sum + credit.amountMinor, 0);
    return { id: invoice.id, number: invoice.number, companyId: invoice.companyId, companyName: (invoice.companySnapshot as unknown as CompanyPurchaseSnapshot).name ?? 'Recorded company', totalMinor: invoice.totalMinor, paidAmountMinor: invoice.paidAmountMinor, creditTotalMinor, netDueMinor: invoice.totalMinor - creditTotalMinor - invoice.paidAmountMinor, issuedAt: invoice.issuedAt.toISOString(), paidAt: invoice.paidAt?.toISOString() ?? null, orderCount: invoice.orders.length };
  }

  private async readInTransaction(tx: Prisma.TransactionClient, id: string): Promise<InvoiceDetail> {
    const invoice = await tx.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Invoice not found.');
    return { ...this.summary(invoice), company: invoice.companySnapshot as unknown as CompanyPurchaseSnapshot,
      orders: invoice.orders.map((order): InvoiceOrderSummary => ({ id: order.id, number: order.number, employeeName: order.employeeName, deliveryDate: order.deliveryDate, totalMinor: order.totalMinor!, status: order.status, company: order.companySnapshot as unknown as CompanyPurchaseSnapshot })),
      credits: invoice.credits.map((credit): BillingCreditResponse => ({ id: credit.id, invoiceId: credit.invoiceId, orderId: credit.orderId, orderNumber: credit.order.number, amountMinor: credit.amountMinor, reason: credit.reason, createdAt: credit.createdAt.toISOString() })),
    };
  }
}
