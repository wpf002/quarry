-- L3: per-program auto-submit policy
CREATE TABLE "AutoSubmitPolicy" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "maxDupRisk" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "allowedVulnClasses" TEXT[],
    "dailyCap" INTEGER NOT NULL DEFAULT 3,
    "requireChain" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutoSubmitPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutoSubmitPolicy_programId_key" ON "AutoSubmitPolicy"("programId");
ALTER TABLE "AutoSubmitPolicy" ADD CONSTRAINT "AutoSubmitPolicy_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
