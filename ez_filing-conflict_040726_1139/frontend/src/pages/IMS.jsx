import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Info } from "lucide-react";
import api from "@/lib/api";
import { useAppState } from "@/lib/state";
import { fmtINR, cls } from "@/lib/format";

const DECISION_LABEL = {
  accept: "Accepted",
  reject: "Rejected",
  pending: "Pending",
  no_action: "No action",
};
const DECISION_STYLES = {
  accept: "bg-emerald-600 text-white",
  reject: "bg-red-600 text-white",
  pending: "bg-amber-500 text-white",
  no_action: "bg-slate-200 text-slate-700",
};

export default function IMS() {
  const { sellerGstin, period } = useAppState();
  const [rows, setRows] = useState([]);
  const flagEnabled = true; // IMS defaulted ON per Oct 2025 rules

  const load = async () => setRows(await api.listIMS(sellerGstin, period));
  useEffect(() => { if (sellerGstin && period) load(); }, [sellerGstin, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (id, decision) => {
    try {
      await api.decideIMS(id, decision);
      toast.success(`Decision saved: ${DECISION_LABEL[decision]}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Not allowed for this credit note");
    }
  };

  const totals = useMemo(() => {
    const t = { accepted: 0, pending: 0, reversal: 0 };
    rows.forEach((r) => {
      if (r.decision === "accept") t.accepted += 1;
      if (r.decision === "pending") t.pending += 1;
      t.reversal += r.reversal_amount || 0;
    });
    return t;
  }, [rows]);

  return (
    <div className="space-y-6" data-testid="ims-page">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">IMS action tracker</h1>
          <p className="mt-2 text-slate-500 max-w-3xl">
            Accept / Reject / Pending / No action per credit note. Rules encoded per GSTN advisory effective
            Oct 2025 — Pending disallowed for original credit notes & specified amendments.
          </p>
        </div>
        <Badge variant="outline" className={cls("border", flagEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500")}>
          IMS engine: {flagEnabled ? "ON" : "OFF"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <StatCard label="Accepted CNs" value={totals.accepted} tone="success" />
        <StatCard label="Pending CNs" value={totals.pending} tone="warn" />
        <StatCard label="Table 4B(2) reversal" value={fmtINR(totals.reversal)} tone="default" />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Credit notes awaiting action</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-semibold py-2 px-3">Supplier GSTIN</th>
                <th className="text-left font-semibold py-2 px-3">CN Number</th>
                <th className="text-left font-semibold py-2 px-3">CN Date</th>
                <th className="text-right font-semibold py-2 px-3">Taxable</th>
                <th className="text-right font-semibold py-2 px-3">Tax</th>
                <th className="text-left font-semibold py-2 px-3">Type</th>
                <th className="text-left font-semibold py-2 px-3">Decision</th>
                <th className="text-right font-semibold py-2 px-3">Reversal (Δ ITC)</th>
                <th className="text-left font-semibold py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody data-testid="ims-tbody">
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400">No IMS credit notes for this period.</td></tr>
              )}
              {rows.map((r) => {
                const pendingBlocked = r.is_original_cn || r.is_amendment;
                return (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 px-3 font-mono text-xs">{r.supplier_gstin}</td>
                    <td className="py-2 px-3 font-medium">{r.credit_note_number}</td>
                    <td className="py-2 px-3 text-slate-600">{r.credit_note_date}</td>
                    <td className="py-2 px-3 text-right tabular">{fmtINR(r.taxable_value)}</td>
                    <td className="py-2 px-3 text-right tabular">{fmtINR(r.tax_amount)}</td>
                    <td className="py-2 px-3">
                      <span className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                        {r.is_original_cn ? "Original CN" : r.is_amendment ? "Amendment" : "Other"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={cls("inline-flex px-2 py-0.5 rounded-md text-xs font-medium",
                        r.decision === "accept" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        r.decision === "reject" ? "bg-red-50 text-red-700 border border-red-200" :
                        r.decision === "pending" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        "bg-slate-100 text-slate-600 border border-slate-200")}>
                        {DECISION_LABEL[r.decision] || r.decision}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular text-emerald-700">{r.reversal_amount > 0 ? fmtINR(r.reversal_amount) : "—"}</td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        {["accept", "reject", "pending", "no_action"].map((d) => (
                          <button
                            key={d}
                            data-testid={`ims-decision-${d}-${r.id}`}
                            disabled={d === "pending" && pendingBlocked}
                            onClick={() => decide(r.id, d)}
                            className={cls(
                              "px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                              r.decision === d ? DECISION_STYLES[d] :
                                "border border-slate-200 text-slate-600 hover:bg-slate-50",
                              (d === "pending" && pendingBlocked) && "opacity-40 cursor-not-allowed"
                            )}
                            title={d === "pending" && pendingBlocked ? "Pending disallowed for original/amendment CN" : ""}
                          >
                            {DECISION_LABEL[d]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="p-4 flex gap-3 text-sm text-blue-900">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
          <div>
            Ineligible ITC (u/s 17(5)) is surfaced in <strong>Table 4B(1)</strong>, not rejected here.
            IMS impacts <strong>Table 4B(2)</strong> only for accepted credit notes where ITC was previously claimed.
            Pending is allowed for exactly one tax period — beyond that, the CN is deemed accepted.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const StatCard = ({ label, value, tone = "default" }) => {
  const tones = {
    success: "text-emerald-700",
    warn: "text-amber-700",
    default: "text-slate-900",
  };
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
        <div className={cls("mt-2 text-3xl font-display font-semibold tabular", tones[tone])}>{value}</div>
      </CardContent>
    </Card>
  );
};
