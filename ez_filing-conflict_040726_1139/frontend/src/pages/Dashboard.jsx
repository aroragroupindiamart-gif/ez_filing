import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, ShieldCheck, AlertTriangle, ClipboardCheck } from "lucide-react";
import api from "@/lib/api";
import { useAppState } from "@/lib/state";
import { fmtINR, fmtInt, periodLabel } from "@/lib/format";

const Metric = ({ label, value, sub, tone = "default", testid }) => {
  const toneMap = {
    default: "text-slate-900",
    success: "text-emerald-700",
    warn: "text-amber-700",
    danger: "text-red-700",
  };
  return (
    <Card className="border-slate-200 shadow-sm" data-testid={testid}>
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
        <div className={`mt-2 text-3xl font-display font-semibold tabular ${toneMap[tone]}`}>{value}</div>
        {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
      </CardContent>
    </Card>
  );
};

export default function Dashboard() {
  const { sellerGstin, period } = useAppState();
  const [snapshot, setSnapshot] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    if (!sellerGstin || !period) return;
    (async () => {
      const [snap, exc, allJobs] = await Promise.all([
        api.compliancePreview(sellerGstin, period),
        api.listExceptions(sellerGstin, period),
        api.listJobs(),
      ]);
      setSnapshot(snap);
      setExceptions(exc);
      setJobs(allJobs.slice(0, 6));
    })();
  }, [sellerGstin, period]);

  const outward = snapshot?.gstr3b?.["3.1"]?.["3.1(a)"] || {};
  const itc = snapshot?.gstr3b?.["4"] || {};
  const netItc = (itc["4D"]?.igst || 0) + (itc["4D"]?.cgst || 0) + (itc["4D"]?.sgst || 0);
  const outwardTax = (outward.igst || 0) + (outward.cgst || 0) + (outward.sgst || 0);

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
            Filing control room
          </h1>
          <p className="mt-2 text-slate-500 text-base">
            {periodLabel(period)} · seller {sellerGstin} — reconcile, review, export portal-ready JSON.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/upload">
            <Button data-testid="dashboard-upload-btn" className="bg-blue-600 hover:bg-blue-700 text-white">
              Start new upload <ArrowUpRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Metric
          testid="metric-outward-taxable"
          label="Outward taxable value"
          value={fmtINR(outward.taxable_value)}
          sub={`Tax collected: ${fmtINR(outwardTax)}`}
        />
        <Metric
          testid="metric-net-itc"
          label="Net ITC (Table 4D)"
          value={fmtINR(netItc)}
          sub="Verified vendor invoices only"
          tone="success"
        />
        <Metric
          testid="metric-exceptions"
          label="Open exceptions"
          value={fmtInt(exceptions.length)}
          sub={exceptions.length ? "Awaiting inline fixes" : "All clean"}
          tone={exceptions.length ? "warn" : "success"}
        />
        <Metric
          testid="metric-b2b-count"
          label="B2B invoices"
          value={fmtInt(snapshot?.gstr1?.b2b?.length || 0)}
          sub={`${snapshot?.gstr1?.b2cs?.length || 0} b2cs · ${snapshot?.gstr1?.b2cl?.length || 0} b2cl`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between">
              <CardTitle className="font-display text-base">Recent processing jobs</CardTitle>
              <Link to="/upload" className="text-xs text-blue-600 hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left font-semibold py-2">Job</th>
                  <th className="text-left font-semibold py-2">Kind</th>
                  <th className="text-left font-semibold py-2">Status</th>
                  <th className="text-right font-semibold py-2">Progress</th>
                </tr>
              </thead>
              <tbody data-testid="recent-jobs-tbody">
                {jobs.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">No jobs yet. Upload marketplace or vendor files to begin.</td></tr>
                )}
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-slate-100 table-row-hover">
                    <td className="py-2 pr-2 font-mono text-xs text-slate-600">{j.id.slice(0, 8)}</td>
                    <td className="py-2 pr-2 text-slate-700">{j.kind === "vendor_ocr" ? "Vendor PDF" : "Marketplace file"}</td>
                    <td className="py-2 pr-2"><StatusBadge status={j.status} /></td>
                    <td className="py-2 text-right tabular text-slate-700">{j.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Compliance shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <ShortLink to="/compliance" icon={FileText} label="GSTR-1 & 3B preview" tone="primary" testid="short-compliance" />
            <ShortLink to="/ims" icon={ClipboardCheck} label="IMS action tracker" testid="short-ims" />
            <ShortLink to="/exceptions" icon={AlertTriangle} label={`Exception ledger (${exceptions.length})`} tone={exceptions.length ? "warn" : "default"} testid="short-exceptions" />
            <ShortLink to="/interest" icon={ShieldCheck} label="Interest estimator" testid="short-interest" />
          </CardContent>
        </Card>
      </div>

      {snapshot && <ITCSnapshot itc={itc} />}
    </div>
  );
}

const ShortLink = ({ to, icon: Icon, label, tone = "default", testid }) => (
  <Link
    to={to}
    data-testid={testid}
    className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors text-sm text-slate-700"
  >
    <Icon className={"w-4 h-4 " + (tone === "warn" ? "text-amber-600" : tone === "primary" ? "text-blue-600" : "text-slate-500")} />
    <span className="flex-1">{label}</span>
    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
  </Link>
);

export const StatusBadge = ({ status }) => {
  const map = {
    queued: "bg-slate-100 text-slate-600 border-slate-200",
    processing: "bg-blue-50 text-blue-700 border-blue-200",
    parsed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
    exception: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border font-medium ${map[status] || map.queued}`} data-testid={`status-badge-${status}`}>
      {status}
    </span>
  );
};

const ITCSnapshot = ({ itc }) => (
  <Card className="border-slate-200 shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="font-display text-base">Table 4 — ITC snapshot</CardTitle>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 rounded-lg border border-slate-200 overflow-hidden">
        {["4A", "4B(1)", "4B(2)", "4D"].map((k) => {
          const row = itc[k] || {};
          const total = (row.igst || 0) + (row.cgst || 0) + (row.sgst || 0);
          return (
            <div key={k} className="p-5" data-testid={`itc-cell-${k}`}>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Table {k}</div>
              <div className="text-xs text-slate-500 mt-0.5">{row.label}</div>
              <div className="mt-3 text-2xl font-display font-semibold tabular">{fmtINR(total)}</div>
              <div className="mt-1 text-[11px] text-slate-400 tabular">
                IGST {fmtINR(row.igst)} · CGST {fmtINR(row.cgst)} · SGST {fmtINR(row.sgst)}
              </div>
              {row.source_ids?.length ? (
                <div className="mt-2 text-[11px] text-blue-600">{row.source_ids.length} source doc(s)</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </CardContent>
  </Card>
);
