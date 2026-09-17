// Circuit breaker for the autonomous scheduler. Any trip revokes the standing
// authorization; it does not just pause. Fails toward stopping.

export interface BreakerMetrics {
  oosHits: number; // out-of-scope / gate refusals this run
  scansThisMinute: number;
  spentUsdToday: number;
  policyChanged: boolean; // program re-parse narrowed scope
}

export interface BreakerLimits {
  rateLimitPerMin: number;
  dailyBudgetUsd: number;
}

export interface BreakerVerdict {
  trip: boolean;
  reason?: string;
}

export function evaluateBreaker(m: BreakerMetrics, l: BreakerLimits): BreakerVerdict {
  if (m.oosHits > 0) return { trip: true, reason: `${m.oosHits} out-of-scope/refused target(s)` };
  if (m.policyChanged) return { trip: true, reason: 'program policy changed (scope narrowed)' };
  if (m.scansThisMinute > l.rateLimitPerMin) {
    return { trip: true, reason: `rate ${m.scansThisMinute}/min over limit ${l.rateLimitPerMin}` };
  }
  if (m.spentUsdToday > l.dailyBudgetUsd) {
    return { trip: true, reason: `spend $${m.spentUsdToday} over daily budget $${l.dailyBudgetUsd}` };
  }
  return { trip: false };
}
