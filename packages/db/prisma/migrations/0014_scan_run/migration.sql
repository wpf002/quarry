-- One ScanRun per active scan; findings link to it so the list shows a result
-- per scan instead of thousands of loose rows.
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "assetsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScanRun_programId_idx" ON "ScanRun"("programId");
CREATE INDEX "ScanRun_createdAt_idx" ON "ScanRun"("createdAt");
ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Finding" ADD COLUMN "scanRunId" TEXT;
CREATE INDEX "Finding_scanRunId_idx" ON "Finding"("scanRunId");
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
