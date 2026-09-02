// Autonomous loop. Everything scheduled here is unattended and passive-safe.
// Active scanning is NOT scheduled here; it only runs from an approved gate.
async function tick() {
  // discovery.pollPlatforms()  -> new/updated programs
  // discovery.parsePolicies()  -> parsedScope + ambiguityFlags
  // discovery.score()          -> rank
  // reconPassive.enrich()      -> public-only assets
  // analyzer.triage()          -> findings from passive signals
  // reporter.draft()           -> queued reports, HELD_FOR_REVIEW
}
setInterval(() => { void tick(); }, 60_000);
console.log('quarry worker up (passive/autonomous only)');
