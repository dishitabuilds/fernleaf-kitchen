-- Each Order row has one nullable membership; many orders may share an invoice.
DROP INDEX "Order_invoiceId_key";
ALTER TABLE "Invoice" ADD COLUMN "companySnapshot" JSONB NOT NULL DEFAULT '{}';
UPDATE "Invoice" i SET "companySnapshot" = COALESCE(
  (SELECT o."companySnapshot" FROM "Order" o WHERE o."invoiceId" = i."id" ORDER BY o."number" LIMIT 1),
  (SELECT jsonb_build_object('id', c."id", 'name', c."name", 'billingName', c."billingName",
    'billingEmail', c."billingEmail", 'billingAddress', c."billingAddress", 'billingContactName', c."billingContactName",
    'phone', c."phone", 'deliveryMinutes', c."deliveryMinutes") FROM "Company" c WHERE c."id" = i."companyId")
);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_money_bounds" CHECK (
  "totalMinor" >= 0 AND "paidAmountMinor" >= 0 AND "paidAmountMinor" <= "totalMinor" AND
  ("paidAt" IS NOT NULL OR "paidAmountMinor" = 0)
);
ALTER TABLE "BillingCredit" ADD CONSTRAINT "BillingCredit_positive_reason" CHECK (
  "amountMinor" > 0 AND length(trim("reason")) > 0
);
CREATE FUNCTION "protect_invoice_history"() RETURNS trigger AS $$
BEGIN
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."companySnapshot" IS DISTINCT FROM OLD."companySnapshot"
    OR NEW."number" IS DISTINCT FROM OLD."number" OR NEW."totalMinor" IS DISTINCT FROM OLD."totalMinor"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" THEN
    RAISE EXCEPTION 'Issued invoice identity, billing snapshot and gross are immutable';
  END IF;
  IF OLD."paidAt" IS NOT NULL AND (NEW."paidAt" IS DISTINCT FROM OLD."paidAt" OR NEW."paidAmountMinor" IS DISTINCT FROM OLD."paidAmountMinor") THEN
    RAISE EXCEPTION 'Recorded invoice settlement is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Invoice_history_immutable" BEFORE UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION "protect_invoice_history"();
CREATE TRIGGER "BillingCredit_history_immutable" BEFORE UPDATE ON "BillingCredit"
  FOR EACH ROW EXECUTE FUNCTION "reject_order_history_update"();
CREATE FUNCTION "protect_invoice_membership"() RETURNS trigger AS $$
BEGIN
  IF OLD."invoiceId" IS NOT NULL AND NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" THEN
    RAISE EXCEPTION 'Issued invoice order membership is immutable';
  END IF;
  IF NEW."invoiceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Invoice" i WHERE i."id" = NEW."invoiceId" AND i."companyId" = NEW."companyId"
  ) THEN RAISE EXCEPTION 'Invoice and order billing company must match'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Order_invoice_membership_immutable" BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION "protect_invoice_membership"();
