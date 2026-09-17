-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('HACKERONE', 'BUGCROWD', 'INTIGRITI', 'YESWEHACK', 'SELF_HOSTED');

-- CreateEnum
CREATE TYPE "ScopeVerdict" AS ENUM ('IN_SCOPE', 'OUT_OF_SCOPE', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "ReconSource" AS ENUM ('CT_LOG', 'PASSIVE_DNS', 'PUBLIC_SOURCE', 'SECURITY_TXT', 'PROXIED_SELF', 'ACTIVE_SCAN');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('QUEUED', 'HELD_FOR_REVIEW', 'SUBMITTED', 'TRIAGED', 'RESOLVED', 'DUPLICATE', 'OUT_OF_SCOPE', 'INFORMATIVE');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policyRaw" TEXT NOT NULL,
    "parsedScope" JSONB NOT NULL,
    "parseConfidence" DOUBLE PRECISION NOT NULL,
    "ambiguityFlags" TEXT[],
    "maxBountyUsd" INTEGER,
    "score" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "verdict" "ScopeVerdict" NOT NULL DEFAULT 'OUT_OF_SCOPE',
    "verdictBy" TEXT NOT NULL,
    "source" "ReconSource" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allowlist" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "allowWildcard" BOOLEAN NOT NULL DEFAULT false,
    "addedBy" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allowlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanApproval" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "allowlistId" TEXT NOT NULL,
    "state" "ApprovalState" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "scanProfile" JSONB NOT NULL,
    "consumedRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vulnClass" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "dupRisk" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL,
    "chainOf" TEXT[],
    "humanConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "state" "SubmissionState" NOT NULL DEFAULT 'QUEUED',
    "platformRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "programId" TEXT,
    "target" TEXT,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_platform_handle_key" ON "Program"("platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_programId_value_key" ON "Asset"("programId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Allowlist_programId_pattern_key" ON "Allowlist"("programId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "Report_findingId_key" ON "Report"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_reportId_key" ON "Submission"("reportId");

-- CreateIndex
CREATE INDEX "AuditLog_programId_idx" ON "AuditLog"("programId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowlist" ADD CONSTRAINT "Allowlist_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanApproval" ADD CONSTRAINT "ScanApproval_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanApproval" ADD CONSTRAINT "ScanApproval_allowlistId_fkey" FOREIGN KEY ("allowlistId") REFERENCES "Allowlist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

