-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrepStatus" AS ENUM ('PENDING', 'STARTED', 'DONE');

-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('AWAITING_KITCHEN', 'KITCHEN_READY', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateTable
CREATE TABLE "DeliveryDateCutoff" (
    "deliveryDate" VARCHAR(10) NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "settingsVersion" INTEGER NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ(3),
    "lastProcessedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeliveryDateCutoff_pkey" PRIMARY KEY ("deliveryDate")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "employeeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeName" VARCHAR(150) NOT NULL,
    "companyName" VARCHAR(150) NOT NULL,
    "employeeSnapshot" JSONB NOT NULL,
    "companySnapshot" JSONB NOT NULL,
    "deliveryDate" VARCHAR(10) NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "addressKey" CHAR(64) NOT NULL,
    "deliverySnapshot" JSONB NOT NULL,
    "plannedDispatchReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedKitchenReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "input" JSONB NOT NULL,
    "purchaseSnapshot" JSONB,
    "totalMinor" INTEGER,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "dropId" UUID,
    "placedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "kitchenStartedAt" TIMESTAMPTZ(3),
    "kitchenReadyAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "basePriceMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "dishSnapshot" JSONB NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCombination" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "canonicalKey" CHAR(64) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,

    CONSTRAINT "OrderCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionSnapshot" (
    "id" UUID NOT NULL,
    "combinationId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "groupName" VARCHAR(150) NOT NULL,
    "optionId" UUID NOT NULL,
    "optionName" VARCHAR(150) NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "priceSource" VARCHAR(20) NOT NULL,
    "tierId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "allergens" JSONB NOT NULL,
    "dietaryTags" JSONB NOT NULL,

    CONSTRAINT "SelectionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRevision" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actionKey" VARCHAR(160) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "actorId" UUID,
    "actorName" VARCHAR(150) NOT NULL,
    "reason" VARCHAR(2000),
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAction" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "orderId" UUID NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepUnit" (
    "id" UUID NOT NULL,
    "combinationId" UUID NOT NULL,
    "stationId" UUID,
    "stationName" VARCHAR(254),
    "status" "PrepStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),

    CONSTRAINT "PrepUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryDrop" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "deliveryDate" VARCHAR(10) NOT NULL,
    "deliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "addressKey" CHAR(64) NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "driverInstructions" VARCHAR(2000) NOT NULL,
    "driverId" UUID,
    "status" "DropStatus" NOT NULL DEFAULT 'AWAITING_KITCHEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "dispatchReadyAt" TIMESTAMPTZ(3),
    "departedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "targetAtDeparture" TIMESTAMPTZ(3),
    "onTime" BOOLEAN,
    "note" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryDrop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryDateCutoff_cutoffAt_processedAt_idx" ON "DeliveryDateCutoff"("cutoffAt", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_status_companyId_idx" ON "Order"("deliveryDate", "status", "companyId");

-- CreateIndex
CREATE INDEX "Order_status_cutoffAt_idx" ON "Order"("status", "cutoffAt");

-- CreateIndex
CREATE INDEX "Order_companyId_status_idx" ON "Order"("companyId", "status");

-- CreateIndex
CREATE INDEX "Order_employeeId_idx" ON "Order"("employeeId");

-- CreateIndex
CREATE INDEX "Order_dropId_idx" ON "Order"("dropId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_sortOrder_idx" ON "OrderLine"("orderId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_dishId_key" ON "OrderLine"("orderId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCombination_lineId_canonicalKey_key" ON "OrderCombination"("lineId", "canonicalKey");

-- CreateIndex
CREATE INDEX "SelectionSnapshot_combinationId_sortOrder_idx" ON "SelectionSnapshot"("combinationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRevision_orderId_version_key" ON "OrderRevision"("orderId", "version");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderEvent_orderId_actionKey_key" ON "OrderEvent"("orderId", "actionKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAction_actorId_key_key" ON "OrderAction"("actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PrepUnit_combinationId_key" ON "PrepUnit"("combinationId");

-- CreateIndex
CREATE INDEX "PrepUnit_stationId_status_idx" ON "PrepUnit"("stationId", "status");

-- CreateIndex
CREATE INDEX "DeliveryDrop_driverId_deliveryDate_status_idx" ON "DeliveryDrop"("driverId", "deliveryDate", "status");

-- CreateIndex
CREATE INDEX "DeliveryDrop_deliveryDate_status_idx" ON "DeliveryDrop"("deliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryDrop_companyId_addressKey_deliveryAt_key" ON "DeliveryDrop"("companyId", "addressKey", "deliveryAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryDrop_id_companyId_key" ON "DeliveryDrop"("id", "companyId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryDate_fkey" FOREIGN KEY ("deliveryDate") REFERENCES "DeliveryDateCutoff"("deliveryDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dropId_companyId_fkey" FOREIGN KEY ("dropId", "companyId") REFERENCES "DeliveryDrop"("id", "companyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCombination" ADD CONSTRAINT "OrderCombination_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionSnapshot" ADD CONSTRAINT "SelectionSnapshot_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "OrderCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAction" ADD CONSTRAINT "OrderAction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepUnit" ADD CONSTRAINT "PrepUnit_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "OrderCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryDrop" ADD CONSTRAINT "DeliveryDrop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryDrop" ADD CONSTRAINT "DeliveryDrop_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money/quantity/status bounds remain valid even for direct database writes.
ALTER TABLE "DeliveryDateCutoff" ADD CONSTRAINT "Cutoff_policy_bounds" CHECK (
  "settingsVersion" > 0 AND "deliveryDate" ~ '^\d{4}-\d{2}-\d{2}$'
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_version_bounds" CHECK (
  "version" > 0 AND ("totalMinor" IS NULL OR "totalMinor" >= 0)
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_committed_purchase_required" CHECK (
  "status" NOT IN ('PLACED', 'CONFIRMED', 'DELIVERED') OR
  ("purchaseSnapshot" IS NOT NULL AND "totalMinor" IS NOT NULL AND "placedAt" IS NOT NULL)
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_lifecycle_timestamp_required" CHECK (
  ("status" NOT IN ('CONFIRMED', 'DELIVERED') OR "confirmedAt" IS NOT NULL) AND
  ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL) AND
  ("status" <> 'REJECTED' OR "rejectedAt" IS NOT NULL)
);
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_quantity_money_bounds" CHECK (
  "quantity" > 0 AND "sortOrder" >= 0 AND "basePriceMinor" >= 0 AND "totalMinor" >= 0
);
ALTER TABLE "OrderCombination" ADD CONSTRAINT "Combination_quantity_money_bounds" CHECK (
  "quantity" > 0 AND "unitPriceMinor" >= 0 AND
  "totalMinor"::bigint = "quantity"::bigint * "unitPriceMinor"::bigint
);
ALTER TABLE "SelectionSnapshot" ADD CONSTRAINT "Selection_price_bounds" CHECK (
  "priceMinor" >= 0 AND "sortOrder" >= 0 AND "priceSource" IN ('EXPLICIT', 'COST', 'REFERENCE')
);
ALTER TABLE "OrderRevision" ADD CONSTRAINT "Revision_version_positive" CHECK ("version" > 0);
ALTER TABLE "DeliveryDrop" ADD CONSTRAINT "Drop_version_positive" CHECK ("version" > 0);

-- Revisions and timeline entries are append-only. Catalogue edits and a new
-- accepted revision cannot overwrite the evidence of an earlier purchase.
CREATE FUNCTION "reject_order_history_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Order purchase revisions and events are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "OrderRevision_immutable" BEFORE UPDATE ON "OrderRevision"
  FOR EACH ROW EXECUTE FUNCTION "reject_order_history_update"();
CREATE TRIGGER "OrderEvent_immutable" BEFORE UPDATE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_order_history_update"();
