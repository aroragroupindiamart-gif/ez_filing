import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { fmtINR } from "@/lib/format";
import { Calculator } from "lucide-react";

const today = new Date().toISOString().slice(0, 10);
const defaultDue = () => {
  const d = new Date();
  d.setDate(20);
  return d.toISOString().slice(0, 10);
};

export default function Interest() {
  const [form, setForm] = useState({
    net_cash_liability: 50000,
    ecl_min_cash_balance: 0,
    due_date: defaultDue(),
    filing_date: today,
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const compute = async () => {
    setLoading(true);
    try {
      const r = await api.estimateInterest({
        net_cash_liability: Number(form.net_cash_liability),
        ecl_min_cash_balance: Number(form.ecl_min_cash_balance),
        due_date: form.due_date,
        filing_date: form.filing_date,
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  const totalDue = useMemo(() => {
    if (!result) return 0;
    return (
      Number(form.net_cash_liability || 0) +
      (result.interest_amount || 0) +
      (result.late_fee_total || 0)
    );
  }, [result, form]);

  return (
    <div className="space-y-6" data-testid="interest-page">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
          Interest estimator
        </h1>
        <p className="mt-2 text-slate-500 max-w-3xl">
          Rule 88B(1): interest = (Net Cash Liability − Min ECL Cash Balance from due date to
          payment date) × (days delayed / 365) × 18%. Interest is only on the net cash shortfall —
          never on the ITC-paid portion.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Inputs</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <Field
              label="Net cash liability (₹)"
              k="net_cash_liability"
              form={form}
              setForm={setForm}
              type="number"
            />
            <Field
              label="Min ECL cash balance (₹) — since due date"
              k="ecl_min_cash_balance"
              form={form}
              setForm={setForm}
              type="number"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Filing due date" k="due_date" form={form} setForm={setForm} type="date" />
              <Field
                label="Actual / planned filing date"
                k="filing_date"
                form={form}
                setForm={setForm}
                type="date"
              />
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              data-testid="compute-interest-btn"
              onClick={compute}
              disabled={loading}
            >
              <Calculator className="w-4 h-4" /> {loading ? "Computing…" : "Compute interest"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Estimate</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {!result && (
              <div className="text-sm text-slate-400 italic">
                Enter inputs and click Compute to see the estimate.
              </div>
            )}
            {result && (
              <>
                <ResultRow label="Days late" value={<span className="tabular">{result.days_late}</span>} />
                <ResultRow
                  label="Interest base (net cash − ECL)"
                  value={fmtINR(result.interest_base)}
                />
                <ResultRow
                  label="Interest @ 18% p.a."
                  value={fmtINR(result.interest_amount)}
                  tone="danger"
                  testid="result-interest"
                />
                <div className="border-t border-slate-100 pt-3 space-y-1">
                  <ResultRow label="Late fee — CGST" value={fmtINR(result.late_fee_cgst)} />
                  <ResultRow label="Late fee — SGST" value={fmtINR(result.late_fee_sgst)} />
                  <ResultRow
                    label="Late fee total (₹50/day)"
                    value={fmtINR(result.late_fee_total)}
                    tone="warn"
                    testid="result-late-fee"
                  />
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <ResultRow
                    label="Total payable (cash + interest + late fee)"
                    value={
                      <span className="font-display text-lg font-semibold">{fmtINR(totalDue)}</span>
                    }
                    tone="primary"
                    testid="result-total"
                  />
                </div>
                <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                    Formula
                  </div>
                  <code className="block mt-1 text-xs text-slate-700 tabular">{result.formula}</code>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Field = ({
  label,
  k,
  form,
  setForm,
  type,
}: {
  label: string;
  k: string;
  form: any;
  setForm: any;
  type: string;
}) => (
  <div>
    <Label className="text-xs text-slate-500 mb-1 block">{label}</Label>
    <Input
      data-testid={`interest-input-${k}`}
      type={type}
      value={form[k]}
      onChange={(e) => setForm((prev: any) => ({ ...prev, [k]: e.target.value }))}
      className="tabular"
    />
  </div>
);

const ResultRow = ({
  label,
  value,
  tone = "default",
  testid,
}: {
  label: string;
  value: any;
  tone?: string;
  testid?: string;
}) => {
  const tones: Record<string, string> = {
    default: "text-slate-900",
    danger: "text-red-700",
    warn: "text-amber-700",
    primary: "text-blue-700",
  };
  return (
    <div className="flex items-baseline justify-between" data-testid={testid}>
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`tabular font-medium ${tones[tone]}`}>{value}</span>
    </div>
  );
};
