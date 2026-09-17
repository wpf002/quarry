-- AlterTable: outcome/payout tracking for the feedback loop
ALTER TABLE "Submission" ADD COLUMN "payoutUsd" INTEGER;
ALTER TABLE "Submission" ADD COLUMN "resolvedAt" TIMESTAMP(3);
