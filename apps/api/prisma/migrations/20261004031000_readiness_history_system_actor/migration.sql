-- Readiness can change during automatic cutoff processing without a staff actor.
ALTER TABLE "DropEvent" ALTER COLUMN "actorId" DROP NOT NULL;
