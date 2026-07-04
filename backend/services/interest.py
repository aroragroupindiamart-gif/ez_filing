"""Interest Estimator — CGST Rule 88B(1).

Interest = (Net Cash Liability − Min ECL Cash Balance) × (days delayed / 365) × 18%

Rules encoded:
- Interest only on net *cash* shortfall — never on ITC-paid portion.
- No interest on cash pre-deposited in ECL *before* due date (subtracted).
- Late fee: ₹50/day (₹25 CGST + ₹25 SGST), capped at ₹5000 per Act by law
  (we do NOT cap here since limits vary; UI shows raw ₹50/day and total).
"""
from datetime import date, datetime
from typing import Tuple

from models import InterestInput, InterestResult

INTEREST_RATE_PCT = 18.0
LATE_FEE_PER_DAY_TOTAL = 50.0  # ₹50 = ₹25 CGST + ₹25 SGST


def _parse(d: str) -> date:
    return datetime.strptime(d, "%Y-%m-%d").date()


def _days_between(due: str, filed: str) -> int:
    dd = _parse(due)
    fd = _parse(filed)
    diff = (fd - dd).days
    return max(diff, 0)


def compute_interest(inp: InterestInput) -> InterestResult:
    days_late = inp.days_late_override if inp.days_late_override is not None else _days_between(inp.due_date, inp.filing_date)

    interest_base = max(inp.net_cash_liability - inp.ecl_min_cash_balance, 0.0)
    interest_amount = round(interest_base * (days_late / 365.0) * (INTEREST_RATE_PCT / 100.0), 2)

    late_fee_total = round(LATE_FEE_PER_DAY_TOTAL * days_late, 2) if days_late > 0 else 0.0
    late_fee_cgst = round(late_fee_total / 2, 2)
    late_fee_sgst = round(late_fee_total - late_fee_cgst, 2)

    formula = (
        f"({inp.net_cash_liability:.2f} − {inp.ecl_min_cash_balance:.2f}) × "
        f"{days_late}/365 × 18% = ₹{interest_amount:.2f}"
    )
    return InterestResult(
        days_late=days_late,
        interest_base=round(interest_base, 2),
        interest_amount=interest_amount,
        late_fee_cgst=late_fee_cgst,
        late_fee_sgst=late_fee_sgst,
        late_fee_total=late_fee_total,
        formula=formula,
    )
