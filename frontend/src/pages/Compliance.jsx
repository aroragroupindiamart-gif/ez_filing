import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download } from "lucide-react";
import api from "@/lib/api";
import { useAppState } from "@/lib/state";
import { fmtINR, cls } from "@/lib/format";

const Section = ({ title, children, testid }) => (
  <div className="rounded-xl border border-slate-200 bg-white" data-testid={testid}>
    <div className="px-5 py-3 border-b border-slate-100">
      <div className="font-display text-sm font-semibold text-slate-900">{title}</div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const Row = ({ k, v, mono = true }) => (
  <div className="flex items-baseline justify-between py-1.5 border-b border-slate-50 last:border-0">
    <span className="text-xs text-slate-500">{k}</span>
    <span className={cls("text-sm", mono && "tabular")}>{v}</span>
  </div>
);

export default function Compliance() {
  const { sellerGstin, period } = useAppState();
  const [snap, setSnap] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [imsList, setImsList] = useState([]);

  useEffect(() => {
    if (!sellerGstin || !period) return;
    (async () => {
      const [s, v, i] = await Promise.all([
        api.compliancePreview(sellerGstin, period),
        api.listVendorInvoices(sellerGstin, period),
        api.listIMS(sellerGstin, period),
      ]);
      setSnap(s);
      setVendors(v);
      setImsList(i);
    })();
  }, [sellerGstin, period]);

  const openDrill = (cellKey, ids) => {
    const source = cellKey === "4B(2)" ? imsList : vendors;
    const rows = source.filter((r) => ids.includes(r.id));
    setDrilldown({ cellKey, rows });
  };

  const exportBoth = async () => {
    try {
      const g1 = await api.exportGstr1(sellerGstin, period);
      const g3b = await api.exportGstr3b(sellerGstin, period);
      // trigger downloads
      window.open(api.downloadUrl(g1.export_id, g1.download_token), "_blank");
      setTimeout(() => window.open(api.downloadUrl(g3b.export_id, g3b.download_token), "_blank"), 400);
      toast.success("Portal-ready JSON downloads triggered");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Export failed");
    }
  };

  if (!snap) return <div className="text-slate-400">Loading compliance snapshot…</div>;

  const g1 = snap.gstr1;
  const t31 = snap.gstr3b["3.1"];
  const t4 = snap.gstr3b["4"];

  return (
    <div className="space-y-6" data-testid="compliance-page">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">Compliance preview</h1>
          <p className="mt-2 text-slate-500">Side-by-side GSTR-1 and GSTR-3B (3.1 + Table 4) — click any Table 4 cell to drill down to source docs.</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={exportBoth} data-testid="export-both-btn">
          <Download className="w-4 h-4" /> Export portal JSON
        </Button>
      </div>

      <Tabs defaultValue="split">
        <TabsList data-testid="compliance-tabs">
          <TabsTrigger value="split" data-testid="tab-split">Side-by-side</TabsTrigger>
          <TabsTrigger value="gstr1" data-testid="tab-gstr1">GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b" data-testid="tab-gstr3b">GSTR-3B</TabsTrigger>
        </TabsList>

        <TabsContent value="split">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">GSTR-1 · Outward</div>
              <Section title="B2B" testid="section-b2b">
                <Row k="Invoices" v={g1.b2b.length} />
                <Row k="Total taxable" v={fmtINR(g1.b2b.reduce((s, r) => s + r.val, 0))} />
              </Section>
              <Section title="B2CS (Summary)" testid="section-b2cs">
                <Row k="Groups" v={g1.b2cs.length} />
                <Row k="Total taxable" v={fmtINR(g1.b2cs.reduce((s, r) => s + r.txval, 0))} />
              </Section>
              <Section title="B2CL" testid="section-b2cl">
                <Row k="Invoices" v={g1.b2cl.length} />
              </Section>
              <Section title="HSN Summary" testid="section-hsn">
                <Row k="Distinct rows" v={g1.hsn.data.length} />
                <Row k="Total taxable" v={fmtINR(g1.totals.taxable_value)} />
              </Section>
            </div>
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">GSTR-3B · 3.1 + Table 4</div>
              <Section title="Table 3.1(a) — Outward taxable" testid="section-3.1a">
                <Row k="Taxable value" v={fmtINR(t31["3.1(a)"].taxable_value)} />
                <Row k="IGST" v={fmtINR(t31["3.1(a)"].igst)} />
                <Row k="CGST" v={fmtINR(t31["3.1(a)"].cgst)} />
                <Row k="SGST" v={fmtINR(t31["3.1(a)"].sgst)} />
                <Row k="Cess" v={fmtINR(t31["3.1(a)"].cess)} />
              </Section>
              <Section title="Table 4 — ITC" testid="section-t4">
                {["4A", "4B(1)", "4B(2)", "4D"].map((k) => {
                  const cell = t4[k];
                  const total = (cell.igst || 0) + (cell.cgst || 0) + (cell.sgst || 0);
                  const hasSrc = cell.source_ids?.length > 0;
                  return (
                    <button
                      key={k}
                      data-testid={`t4-drill-${k}`}
                      onClick={() => hasSrc && openDrill(k, cell.source_ids)}
                      className={cls(
                        "w-full text-left py-2 px-3 rounded-lg border transition-colors",
                        hasSrc ? "hover:border-blue-300 hover:bg-blue-50/40 border-slate-100 cursor-pointer" : "border-transparent cursor-default",
                        k === "4D" && "bg-emerald-50/40 border-emerald-100"
                      )}
                    >
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-xs font-mono text-slate-500">{k}</span>
                          <span className="ml-2 text-sm text-slate-700">{cell.label}</span>
                        </div>
                        <div className="tabular font-medium">{fmtINR(total)}</div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 tabular">
                        IGST {fmtINR(cell.igst)} · CGST {fmtINR(cell.cgst)} · SGST {fmtINR(cell.sgst)}{hasSrc ? ` · ${cell.source_ids.length} source(s)` : ""}
                      </div>
                    </button>
                  );
                })}
              </Section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gstr1">
          <RawJson title="GSTR-1 preview" data={g1} />
        </TabsContent>
        <TabsContent value="gstr3b">
          <RawJson title="GSTR-3B preview" data={snap.gstr3b} />
        </TabsContent>
      </Tabs>

      {drilldown && (
        <Drilldown
          cellKey={drilldown.cellKey}
          rows={drilldown.rows}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}

const RawJson = ({ title, data }) => (
  <Card className="border-slate-200 shadow-sm mt-4">
    <CardHeader className="pb-2"><CardTitle className="font-display text-base">{title}</CardTitle></CardHeader>
    <CardContent className="pt-0">
      <pre className="text-[11px] leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-auto max-h-[600px] font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </CardContent>
  </Card>
);

const Drilldown = ({ cellKey, rows, onClose }) => (
  <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-4" onClick={onClose} data-testid="drilldown-modal">
    <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Drill-down · Table {cellKey}</div>
          <div className="font-display text-lg font-semibold">{rows.length} source document(s)</div>
        </div>
        <button className="text-slate-400 hover:text-slate-700 text-sm" onClick={onClose} data-testid="drilldown-close">Close</button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-semibold py-2 px-3">Doc</th>
              <th className="text-left font-semibold py-2 px-3">Supplier / CN</th>
              <th className="text-right font-semibold py-2 px-3">Taxable</th>
              <th className="text-right font-semibold py-2 px-3">Tax</th>
              <th className="text-left font-semibold py-2 px-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 px-3 font-mono text-xs">{r.invoice_number || r.credit_note_number}</td>
                <td className="py-2 px-3">{r.supplier_name || r.supplier_gstin}</td>
                <td className="py-2 px-3 text-right tabular">{fmtINR(r.taxable_value)}</td>
                <td className="py-2 px-3 text-right tabular">{fmtINR(r.tax_amount ?? (r.igst + r.cgst + r.sgst))}</td>
                <td className="py-2 px-3 text-xs text-slate-500">
                  {r.itc_ineligible_reason || r.decision || (r.verified_gstin ? "GSTIN verified" : "GSTIN unverified")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);
