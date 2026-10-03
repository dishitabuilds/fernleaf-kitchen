-- A timestamp can be shared by placement and immediate cutoff confirmation.
-- Sequence breaks ties by insertion order instead of random UUID order.
ALTER TABLE "OrderEvent" ADD COLUMN "sequence" SERIAL NOT NULL;
CREATE UNIQUE INDEX "OrderEvent_sequence_key" ON "OrderEvent"("sequence");
