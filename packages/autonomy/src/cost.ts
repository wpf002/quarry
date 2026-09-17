// L4 cost governor. Activates once the AI seam (Flint) reports real spend; until
// then it is a pure forward-looking check. Bulk classification belongs on the
// cheap model, scope/report generation on the strong one.
export function costPerFinding(totalCostUsd: number, findings: number): number {
  if (findings <= 0) return 0;
  return Number((totalCostUsd / findings).toFixed(4));
}

export interface CostVerdict {
  overBudget: boolean;
  costPerFinding: number;
  ceiling: number;
}

export function checkCost(totalCostUsd: number, findings: number, ceilingUsd: number): CostVerdict {
  const cpf = costPerFinding(totalCostUsd, findings);
  return { overBudget: cpf > ceilingUsd, costPerFinding: cpf, ceiling: ceilingUsd };
}
