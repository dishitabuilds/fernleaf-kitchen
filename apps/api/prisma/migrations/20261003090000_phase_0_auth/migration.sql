CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER');

CREATE TABLE "StaffUser" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "StaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffUser_email_normalized" CHECK ("email" = lower(btrim("email")))
);

CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_token_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "Session_expiry_after_creation" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
