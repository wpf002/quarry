import type { ScanProfile, Tier } from './types.js';

// Tier permission. Tier 1 is allowed under any approval. Tier 2 needs the
// profile to grant it. Tier 3 is NEVER batch-automated — each action needs its
// own confirmation, checked separately in active.ts.
export function tierPermitted(profile: ScanProfile, tier: Tier): boolean {
  if (tier === 1) return true;
  return profile.tiers.includes(tier);
}

export class TierRefusal extends Error {}

export function assertTierRunnable(
  tier: Tier,
  profile: ScanProfile,
  perActionConfirmed: boolean,
): void {
  if (!tierPermitted(profile, tier)) {
    throw new TierRefusal(`tier ${tier} not permitted by the scan profile`);
  }
  if (tier === 3 && !perActionConfirmed) {
    throw new TierRefusal('tier 3 requires per-action human confirmation');
  }
}
