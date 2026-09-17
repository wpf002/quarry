// Earnability: the odds Quarry actually lands a PAID bug on this program.
// Deliberately hunter-facing, not a measure of how well we parsed anything.

export interface EarnabilityInput {
  /** false = VDP: reputation only, no money. */
  offersBounty: boolean;
  /** platform says submissions are open. */
  isOpen: boolean;
  /** real amount where the platform gives one; undefined = unknown. */
  maxBountyUsd?: number;
  /** assets Quarry can actually test (web hosts), not source repos or apps. */
  scannableAssets: number;
  /** older programs are more picked over. */
  programAgeDays?: number;
}

export interface EarnabilityScore {
  total: number; // 0..1
  payout: number;
  surface: number;
  freshness: number;
  reason: string;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export const EARNABILITY_WEIGHTS = { payout: 0.45, surface: 0.35, freshness: 0.2 } as const;

export function scoreEarnability(i: EarnabilityInput): EarnabilityScore {
  // Closed to submissions: you cannot earn, full stop.
  if (!i.isOpen) {
    return { total: 0, payout: 0, surface: 0, freshness: 0, reason: 'closed to submissions' };
  }

  const surface = clamp01(i.scannableAssets / 20);

  // No bounty on offer: reputation only. Capped low so these never outrank
  // paying programs, but not zero -- they still build account standing.
  if (!i.offersBounty) {
    return {
      total: Number((surface * 0.15).toFixed(4)),
      payout: 0,
      surface: Number(surface.toFixed(4)),
      freshness: 0,
      reason: 'VDP: no bounty offered',
    };
  }

  // Unknown amount is common on HackerOne; treat as a middling payout rather
  // than punishing the program for the platform's missing field.
  const payout = i.maxBountyUsd
    ? clamp01(Math.log10(i.maxBountyUsd + 1) / Math.log10(50001))
    : 0.45;

  const freshness = i.programAgeDays === undefined ? 0.5 : clamp01(1 - i.programAgeDays / 3650);

  const total = clamp01(
    payout * EARNABILITY_WEIGHTS.payout +
      surface * EARNABILITY_WEIGHTS.surface +
      freshness * EARNABILITY_WEIGHTS.freshness,
  );

  return {
    total: Number(total.toFixed(4)),
    payout: Number(payout.toFixed(4)),
    surface: Number(surface.toFixed(4)),
    freshness: Number(freshness.toFixed(4)),
    reason: i.maxBountyUsd ? `pays up to ${i.maxBountyUsd}` : 'pays bounties, amount unknown',
  };
}

/** Assets Quarry can actually point a scanner at. */
export function countScannableAssets(inScope: string[]): number {
  return inScope.filter((a) => {
    const v = a.toLowerCase();
    if (!v) return false;
    if (v.includes('github.com') || v.includes('gitlab.com')) return false; // source
    if (v.endsWith('.apk') || v.endsWith('.ipa')) return false; // mobile builds
    if (v.startsWith('com.') || v.includes('play.google.com') || v.includes('apps.apple.com')) return false;
    return /[a-z0-9.-]+\.[a-z]{2,}/.test(v) || /^\d{1,3}(\.\d{1,3}){3}/.test(v);
  }).length;
}
