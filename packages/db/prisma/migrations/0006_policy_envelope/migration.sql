-- L5: policy envelope (autopilot)
CREATE TABLE "PolicyEnvelope" (
    "id" TEXT NOT NULL,
    "signedBy" TEXT NOT NULL,
    "programIds" TEXT[],
    "tiers" INTEGER[],
    "maxTargetsPerDay" INTEGER NOT NULL DEFAULT 25,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 20,
    "dailyBudgetUsd" INTEGER NOT NULL DEFAULT 5,
    "autoSubmit" BOOLEAN NOT NULL DEFAULT false,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "maxDupRisk" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "dailyCap" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyEnvelope_pkey" PRIMARY KEY ("id")
);
