export interface InterestInput {
  net_cash: number;
  ecl_balance: number;
  due_date: string;
  payment_date: string;
}

export interface InterestResult {
  days_delayed: number;
  interest_base: number;
  interest_18pct: number;
  interest_24pct: number;
  applicable_rate: number;
  interest_amount: number;
  note: string;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeInterest(input: InterestInput): InterestResult {
  const { net_cash, ecl_balance, due_date, payment_date } = input;

  const due = new Date(due_date);
  const paid = new Date(payment_date);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysDelayed = Math.max(0, Math.floor((paid.getTime() - due.getTime()) / msPerDay));

  if (daysDelayed === 0) {
    return {
      days_delayed: 0,
      interest_base: 0,
      interest_18pct: 0,
      interest_24pct: 0,
      applicable_rate: 0,
      interest_amount: 0,
      note: 'No delay — return filed on or before due date.',
    };
  }

  const interestBase = Math.max(0, net_cash - ecl_balance);
  const interest18 = r2((interestBase * 0.18 * daysDelayed) / 365);
  const interest24 = r2((interestBase * 0.24 * daysDelayed) / 365);

  return {
    days_delayed: daysDelayed,
    interest_base: r2(interestBase),
    interest_18pct: interest18,
    interest_24pct: interest24,
    applicable_rate: 18,
    interest_amount: interest18,
    note: `Rule 88B(1): Interest on net cash liability ₹${interestBase.toFixed(2)} for ${daysDelayed} days at 18% p.a.`,
  };
}
