import type { PrismaClient } from '../src/generated/prisma/client';
import { SEED_IDS } from './seed-configuration';

// Stable IDs for demo billing data
const INVOICE_IDS = {
  paid: '90000000-0000-4000-8000-000000000001',
  unpaid: '90000000-0000-4000-8000-000000000002',
};

/**
 * Seed realistic demo data for Phase 4:
 * - Creates orders across multiple statuses for the demo company
 * - Creates invoices (one paid, one unpaid) with orders
 * - Adds a billing credit to the paid invoice
 *
 * This seed is additive and idempotent — it skips if invoice data already exists.
 */
export async function seedBilling(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Skip if billing data already exists
    const existingInvoice = await tx.invoice.findFirst();
    if (existingInvoice) return;

    // Get confirmed/delivered orders for the demo company
    const orders = await tx.order.findMany({
      where: { companyId: SEED_IDS.company, status: { in: ['CONFIRMED', 'DELIVERED'] }, totalMinor: { not: null }, invoiceId: null },
      select: { id: true, totalMinor: true },
      orderBy: { number: 'asc' },
      take: 10,
    });

    if (orders.length === 0) {
      console.log('  No confirmed/delivered orders to invoice. Skipping billing seed.');
      return;
    }

    // Split orders: first half for paid invoice, rest for unpaid
    const half = Math.max(1, Math.floor(orders.length / 2));
    const paidOrders = orders.slice(0, half);
    const unpaidOrders = orders.slice(half);

    // Create paid invoice
    if (paidOrders.length > 0) {
      const paidTotal = paidOrders.reduce((s, o) => s + (o.totalMinor ?? 0), 0);
      await tx.invoice.create({
        data: {
          id: INVOICE_IDS.paid,
          companyId: SEED_IDS.company,
          totalMinor: paidTotal,
          paidAmountMinor: paidTotal,
          paidAt: new Date(),
        },
      });
      await tx.order.updateMany({
        where: { id: { in: paidOrders.map((o) => o.id) } },
        data: { invoiceId: INVOICE_IDS.paid },
      });

      // Add a small credit to the paid invoice on the first order
      const creditAmount = Math.min(200, paidOrders[0].totalMinor ?? 0);
      if (creditAmount > 0) {
        await tx.billingCredit.create({
          data: {
            invoiceId: INVOICE_IDS.paid,
            orderId: paidOrders[0].id,
            amountMinor: creditAmount,
            reason: 'Demo credit — packaging substitution',
            actionKey: 'seed-credit-001',
          },
        });
      }
    }

    // Create unpaid invoice
    if (unpaidOrders.length > 0) {
      const unpaidTotal = unpaidOrders.reduce((s, o) => s + (o.totalMinor ?? 0), 0);
      await tx.invoice.create({
        data: {
          id: INVOICE_IDS.unpaid,
          companyId: SEED_IDS.company,
          totalMinor: unpaidTotal,
        },
      });
      await tx.order.updateMany({
        where: { id: { in: unpaidOrders.map((o) => o.id) } },
        data: { invoiceId: INVOICE_IDS.unpaid },
      });
    }

    console.log(`  Created ${paidOrders.length > 0 ? 1 : 0} paid + ${unpaidOrders.length > 0 ? 1 : 0} unpaid invoices across ${orders.length} orders.`);
  });
}
