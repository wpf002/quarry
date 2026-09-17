-- Scan-wide session for authenticated testing (applied to every Infiltr module).
-- Sensitive: holds a logged-in session. Stored locally, sent only to Infiltr.
ALTER TABLE "ScanContext" ADD COLUMN "scanAuthHeaders" JSONB;
