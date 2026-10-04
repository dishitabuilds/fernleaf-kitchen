-- Phase 4: Billing - Invoice and BillingCredit models

-- Invoice table
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "companyId" UUID NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "paidAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- BillingCredit table
CREATE TABLE "BillingCredit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "actionKey" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCredit_pkey" PRIMARY KEY ("id")
);

-- Add invoiceId to Order
ALTER TABLE "Order" ADD COLUMN "invoiceId" UUID;

-- Unique constraints
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE UNIQUE INDEX "Order_invoiceId_key" ON "Order"("invoiceId");
CREATE UNIQUE INDEX "BillingCredit_actionKey_key" ON "BillingCredit"("actionKey");

-- Performance indexes
CREATE INDEX "Invoice_companyId_issuedAt_idx" ON "Invoice"("companyId", "issuedAt");
CREATE INDEX "BillingCredit_invoiceId_idx" ON "BillingCredit"("invoiceId");
CREATE INDEX "BillingCredit_orderId_idx" ON "BillingCredit"("orderId");
CREATE INDEX "Order_invoiceId_idx" ON "Order"("invoiceId");

-- Foreign keys
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCredit" ADD CONSTRAINT "BillingCredit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCredit" ADD CONSTRAINT "BillingCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
