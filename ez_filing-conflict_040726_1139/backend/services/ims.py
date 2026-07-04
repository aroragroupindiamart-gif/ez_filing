"""IMS (Invoice Management System) rules engine.

Rules encoded per GSTN circulars effective Oct 2025 tax period:
- Actions: Accept / Reject / Pending / No action.
- Pending allowed for only ONE tax period → deemed accepted after that.
- 2-month accept/reject window (soft check, we surface warning after that).
- Pending DISALLOWED for original credit notes and specified amendment cases.
- ITC impact:
    * Accepted CN → reversal in Table 4B(2), amount = min(taxable*rate, itc_previously_claimed)
    * Rejected CN → no ITC change, supplier gets the credit-note dispute
    * Pending / No action → no reversal yet, but flagged
- Ineligible ITC (u/s 17(5)) is surfaced separately in Table 4B(1),
  never rejected in IMS.

The engine is pure — no DB access — so it's trivially testable.
"""
from typing import Tuple

from models import IMSAction


def validate_decision(action: IMSAction, decision: str) -> Tuple[bool, str]:
    """Return (is_allowed, reason)."""
    if decision not in {"accept", "reject", "pending", "no_action"}:
        return False, f"Unknown decision '{decision}'"
    if decision == "pending":
        if action.is_original_cn:
            return False, "Pending is not allowed for original credit notes."
        if action.is_amendment:
            return False, "Pending is disallowed for specified amendment cases."
    return True, ""


def compute_reversal(action: IMSAction, decision: str) -> float:
    """Return ITC reversal amount (₹) for Table 4B(2) based on decision."""
    if not action.itc_previously_claimed:
        return 0.0
    if decision == "accept":
        return round(action.tax_amount, 2)
    return 0.0


def apply_decision(action: IMSAction, decision: str, now_iso: str) -> IMSAction:
    """Return a NEW IMSAction with decision applied (rules validated by caller)."""
    reversal = compute_reversal(action, decision)
    return action.model_copy(update={
        "decision": decision,
        "decided_at": now_iso,
        "reversal_amount": reversal,
        "updated_at": now_iso,
    })
