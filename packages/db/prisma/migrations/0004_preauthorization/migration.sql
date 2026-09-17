-- L2: standing authorizations + scope provenance flags
ALTER TABLE "Allowlist" ADD COLUMN "ownershipVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Allowlist" ADD COLUMN "ownershipMethod" TEXT;

CREATE TABLE "PreAuthorization" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "signedBy" TEXT NOT NULL,
    "tiers" INTEGER[],
    "maxTargetsPerDay" INTEGER NOT NULL DEFAULT 25,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 20,
    "dailyBudgetUsd" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreAuthorization_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PreAuthorization_programId_idx" ON "PreAuthorization"("programId");
ALTER TABLE "PreAuthorization" ADD CONSTRAINT "PreAuthorization_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
