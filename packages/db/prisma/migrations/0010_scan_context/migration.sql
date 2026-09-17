-- Per-program scan context for Infiltr checks that need a second identity
-- (IDOR) or an out-of-band canary (SSRF). idorVictimHeaders is sensitive.
CREATE TABLE "ScanContext" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "idorVictimHeaders" JSONB,
    "idorVictimId" TEXT,
    "idorIdParam" TEXT,
    "ssrfCanaryHost" TEXT,
    "ssrfWait" INTEGER,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanContext_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScanContext_programId_key" ON "ScanContext"("programId");

ALTER TABLE "ScanContext" ADD CONSTRAINT "ScanContext_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
