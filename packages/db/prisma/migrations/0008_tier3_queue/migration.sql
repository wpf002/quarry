-- Finding: record which host/URL an active scan hit, so Tier-3 candidates can
-- be keyed to a verified target.
ALTER TABLE "Finding" ADD COLUMN "target" TEXT;

-- Tier-3 approval queue. The worker fills it from Tier 1/2 signals; nothing
-- runs until a human approves a batch, and each run still passes the gate.
CREATE TABLE "Tier3Candidate" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "assets" INTEGER,
    "findings" INTEGER,
    "error" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tier3Candidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Tier3Candidate_state_idx" ON "Tier3Candidate"("state");
CREATE UNIQUE INDEX "Tier3Candidate_programId_target_key" ON "Tier3Candidate"("programId", "target");

ALTER TABLE "Tier3Candidate" ADD CONSTRAINT "Tier3Candidate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
