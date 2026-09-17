import type { SubmissionState } from '@quarry/db';

export type Outcome = 'PAID' | 'DUPLICATE' | 'OUT_OF_SCOPE' | 'INFORMATIVE' | 'PENDING';

export interface OutcomeStats {
  total: number;
  decided: number;
  paid: number;
  duplicate: number;
  oos: number;
  informative: number;
  pending: number;
  validRate: number; // paid / decided
  dupRate: number; // duplicate / decided
}

export function stateToOutcome(state: SubmissionState): Outcome {
  switch (state) {
    case 'RESOLVED': return 'PAID';
    case 'DUPLICATE': return 'DUPLICATE';
    case 'OUT_OF_SCOPE': return 'OUT_OF_SCOPE';
    case 'INFORMATIVE': return 'INFORMATIVE';
    default: return 'PENDING';
  }
}

export function computeOutcomeStats(states: SubmissionState[]): OutcomeStats {
  const s = { total: states.length, paid: 0, duplicate: 0, oos: 0, informative: 0, pending: 0 };
  for (const st of states) {
    const o = stateToOutcome(st);
    if (o === 'PAID') s.paid++;
    else if (o === 'DUPLICATE') s.duplicate++;
    else if (o === 'OUT_OF_SCOPE') s.oos++;
    else if (o === 'INFORMATIVE') s.informative++;
    else s.pending++;
  }
  const decided = s.paid + s.duplicate + s.oos + s.informative;
  return {
    ...s,
    decided,
    validRate: decided ? Number((s.paid / decided).toFixed(4)) : 0,
    dupRate: decided ? Number((s.duplicate / decided).toFixed(4)) : 0,
  };
}
