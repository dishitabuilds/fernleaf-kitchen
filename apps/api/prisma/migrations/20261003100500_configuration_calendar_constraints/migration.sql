-- Prisma scalar lists are nullable at the SQL layer by default. Configuration
-- calendars must always be present, including an explicitly empty holiday list.
ALTER TABLE "KitchenSettings" ALTER COLUMN "workingDays" SET NOT NULL;
ALTER TABLE "KitchenSettings" ALTER COLUMN "holidays" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "workingDays" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "holidays" SET NOT NULL;
