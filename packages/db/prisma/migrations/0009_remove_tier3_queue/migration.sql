-- Tier 3 is never delegated through Quarry: Infiltr refuses API tier-3 by
-- design, so the queue could never run. Manual Tier 3 lives in Infiltr's CLI.
-- The Finding.target column stays; it is useful on its own.
DROP TABLE IF EXISTS "Tier3Candidate";
