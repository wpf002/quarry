-- Static form fields sent with the auto-login (e.g. a submit button "Login":"Login"
-- or hidden inputs some login forms require).
ALTER TABLE "ScanContext" ADD COLUMN "authExtraFields" JSONB;
