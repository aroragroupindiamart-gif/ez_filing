import type { IMSAction } from './models.js';

export function validateImsDecision(
  action: IMSAction,
  newDecision: string
): { valid: boolean; error?: string } {
  if (!['accept', 'reject', 'pending'].includes(newDecision)) {
    return { valid: false, error: `Invalid decision: ${newDecision}` };
  }
  if (action.note_type === 'credit' && newDecision === 'pending') {
    return { valid: false, error: 'Pending decision is not allowed for credit notes per GSTN rules.' };
  }
  return { valid: true };
}

export function computeReversal(action: IMSAction): number {
  if (action.decision !== 'accept') return 0;
  return Math.round((action.igst + action.cgst + action.sgst + action.cess) * 100) / 100;
}
