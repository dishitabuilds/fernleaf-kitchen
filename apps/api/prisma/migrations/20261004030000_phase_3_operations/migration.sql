ALTER TABLE "PrepUnit" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DeliveryDrop" ADD COLUMN "kitchenReadyAt" TIMESTAMPTZ(3);
ALTER TABLE "PrepUnit" ADD CONSTRAINT "PrepUnit_version_positive" CHECK ("version" > 0);

CREATE TABLE "DropEvent" (
  "id" UUID NOT NULL,
  "sequence" SERIAL NOT NULL,
  "dropId" UUID NOT NULL,
  "actionKey" VARCHAR(160) NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "actorId" UUID NOT NULL,
  "actorName" VARCHAR(150) NOT NULL,
  "reason" VARCHAR(2000),
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DropEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DropEvent_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "DeliveryDrop"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "DropEvent_sequence_key" ON "DropEvent"("sequence");
CREATE UNIQUE INDEX "DropEvent_dropId_actionKey_key" ON "DropEvent"("dropId", "actionKey");
CREATE INDEX "DropEvent_dropId_createdAt_idx" ON "DropEvent"("dropId", "createdAt");

CREATE TABLE "OperationalAction" (
  "id" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperationalAction_actorId_key_key" ON "OperationalAction"("actorId", "key");
