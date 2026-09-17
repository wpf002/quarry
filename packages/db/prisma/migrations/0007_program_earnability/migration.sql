-- Program fields that matter to the hunter: is it open, does it pay, how much.
ALTER TABLE "Program" ADD COLUMN "bountyCurrency" TEXT;
ALTER TABLE "Program" ADD COLUMN "offersBounty" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Program" ADD COLUMN "platformStatus" TEXT;
ALTER TABLE "Program" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Program" ADD COLUMN "scannableAssets" INTEGER NOT NULL DEFAULT 0;
