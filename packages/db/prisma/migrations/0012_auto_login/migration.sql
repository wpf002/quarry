-- Credentialed auto-login config on ScanContext. authPassword is sensitive;
-- stored locally, used only to obtain a session that is sent to Infiltr.
ALTER TABLE "ScanContext" ADD COLUMN "authLoginUrl" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authUsername" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authPassword" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authUserField" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authPassField" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authCsrfField" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authTokenPath" TEXT;
ALTER TABLE "ScanContext" ADD COLUMN "authJson" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScanContext" ADD COLUMN "authCachedAt" TIMESTAMP(3);
