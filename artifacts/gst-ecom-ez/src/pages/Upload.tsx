import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, FileSpreadsheet, FileText, Package } from "lucide-react";
import api from "@/lib/api";
import { useAppState } from "@/lib/state";
import { StatusBadge } from "@/pages/Dashboard";
import { cls } from "@/lib/format";

const MARKETPLACES = [
  { id: "amazon", label: "Amazon" },
  { id: "flipkart", label: "Flipkart" },
  { id: "meesho", label: "Meesho" },
  { id: "other", label: "Other" },
];

type DropZoneType = "marketplace" | "outward" | "inward";

interface ZoneConfig {
  type: DropZoneType;
  kind: string;
  label: string;
  sub: string;
  accept: string;
  acceptExtensions: string[];
  icon: React.ReactNode;
  color: string;
  activeBg: string;
  activeBorder: string;
}

const ZONES: ZoneConfig[] = [
  {
    type: "marketplace",
    kind: "marketplace_csv",
    label: "Marketplace Reports",
    sub: "CSV / XLSX — Amazon, Flipkart, Meesho",
    accept: ".csv,.xls,.xlsx",
    acceptExtensions: [".csv", ".xls", ".xlsx"],
    icon: <FileSpreadsheet className="w-7 h-7" />,
    color: "text-violet-500",
    activeBg: "bg-violet-50/60",
    activeBorder: "border-violet-500",
  },
  {
    type: "outward",
    kind: "outward_pdf",
    label: "Sales Invoices",
    sub: "PDF — B2B invoices you issued → GSTR-1 Table 4",
    accept: ".pdf",
    acceptExtensions: [".pdf"],
    icon: <FileText className="w-7 h-7" />,
    color: "text-blue-500",
    activeBg: "bg-blue-50/60",
    activeBorder: "border-blue-500",
  },
  {
    type: "inward",
    kind: "inward_pdf",
    label: "Purchase Invoices",
    sub: "PDF — vendor invoices received → GSTR-3B Table 4 ITC",
    accept: ".pdf",
    acceptExtensions: [".pdf"],
    icon: <FileText className="w-7 h-7" />,
    color: "text-emerald-500",
    activeBg: "bg-emerald-50/60",
    activeBorder: "border-emerald-500",
  },
];

const DOC_TYPE_LABEL: Record<string, string> = {
  marketplace_parse: "Marketplace",
  outward_ocr: "Sales (Outward)",
  inward_ocr: "Purchase (Inward)",
  vendor_ocr: "Purchase (Inward)",
};

export default function UploadPage() {
  const { sellerGstin, period } = useAppState();
  const [marketplace, setMarketplace] = useState("amazon");
  const [dragActive, setDragActive] = useState<DropZoneType | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const inputRefs = useRef<Record<DropZoneType, HTMLInputElement | null>>({
    marketplace: null,
    outward: null,
    inward: null,
  });

  useEffect(() => {
    (async () => setJobs(await api.listJobs()))();
  }, [tick]);

  useEffect(() => {
    const anyActive = jobs.some((j) => ["queued", "processing", "parsed"].includes(j.status));
    if (!anyActive) return;
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [jobs]);

  const uploadFiles = useCallback(
    async (files: File[], zone: ZoneConfig) => {
      if (!sellerGstin) return toast.error("Select a seller GSTIN first.");
      for (const file of files) {
        const ext = "." + file.name.split(".").pop()!.toLowerCase();
        if (!zone.acceptExtensions.includes(ext)) {
          toast.error(`${file.name} — wrong type for "${zone.label}". Expected: ${zone.accept}`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const kind =
          zone.type === "marketplace"
            ? ext === ".csv"
              ? "marketplace_csv"
              : "marketplace_xlsx"
            : zone.kind;
        fd.append("kind", kind);
        fd.append("period", period);
        fd.append("seller_gstin", sellerGstin);
        if (zone.type === "marketplace") fd.append("marketplace", marketplace);
        try {
          const res = await api.uploadFile(fd);
          toast.success(`Queued: ${file.name}`);
          setJobs((prev) => [res.job, ...prev]);
        } catch (e: any) {
          toast.error(
            `Failed: ${file.name} — ${e?.response?.data?.detail || e.message}`
          );
        }
      }
      setTick((x) => x + 1);
    },
    [sellerGstin, period, marketplace]
  );

  return (
    <div className="space-y-8" data-testid="upload-page">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
          File Control Center
        </h1>
        <p className="mt-2 text-slate-500">
          Drop files into the correct zone — the pipeline routes each document type
          automatically. Files are encrypted at rest with AES-256-GCM.
        </p>
      </div>

      {/* Three drop zones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ZONES.map((zone) => (
          <Card key={zone.type} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              {/* Marketplace selector — only for zone 1 */}
              {zone.type === "marketplace" && (
                <div className="mb-3">
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                    Platform
                  </label>
                  <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg" data-testid="marketplace-tabs">
                    {MARKETPLACES.map((m) => (
                      <button
                        key={m.id}
                        data-testid={`marketplace-tab-${m.id}`}
                        onClick={() => setMarketplace(m.id)}
                        className={cls(
                          "px-2.5 py-1 rounded-md text-xs transition-colors",
                          marketplace === m.id
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                data-testid={`dropzone-${zone.type}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(zone.type);
                }}
                onDragLeave={() => setDragActive(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(null);
                  uploadFiles(Array.from(e.dataTransfer.files || []), zone);
                }}
                onClick={() => inputRefs.current[zone.type]?.click()}
                className={cls(
                  "cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-colors",
                  dragActive === zone.type
                    ? `${zone.activeBorder} ${zone.activeBg}`
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/60"
                )}
              >
                <div className={cls("mx-auto mb-2", zone.color)}>{zone.icon}</div>
                <div className="font-semibold text-sm text-slate-800">{zone.label}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">{zone.sub}</div>
                <input
                  ref={(el) => { inputRefs.current[zone.type] = el; }}
                  type="file"
                  multiple
                  hidden
                  accept={zone.accept}
                  data-testid={`file-input-${zone.type}`}
                  onChange={(e) => uploadFiles(Array.from(e.target.files || []), zone)}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sample helpers */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 -mt-2 px-1">
        <span>Quick samples:</span>
        <button
          data-testid="load-sample-csv-btn"
          className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-700 hover:underline"
          onClick={() => {
            const csv = `Invoice Number,Invoice Date,Buyer State,Buyer GSTIN,Taxable Value,IGST,CGST,SGST,Cess,Invoice Amount,GST Rate,HSN,Quantity\nSAMPLE-001,${new Date().toISOString().slice(0, 10)},Karnataka,,4500,0,405,405,0,5310,18,6109,1\nSAMPLE-002,${new Date().toISOString().slice(0, 10)},Maharashtra,,7200,1296,0,0,0,8496,18,6109,1\n`;
            uploadFiles([new File([csv], `${marketplace}-sample.csv`, { type: "text/csv" })], ZONES[0]);
          }}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> sample marketplace CSV
        </button>
        <span>·</span>
        <button
          data-testid="load-sample-pdf-btn"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
          onClick={() => {
            const txt = `Sales Invoice\nSeller: Acme Traders\nGSTIN: 29ABCDE1234F1Z5\nBill To GSTIN: 27AABCU9603R1Z2\nInvoice No: SI-1001\nDate: ${new Date().toISOString().slice(0, 10)}\nTaxable Value: 10000\nCGST: 900\nSGST: 900\nTotal: 11800`;
            uploadFiles([new File([txt], "sales-invoice-sample.pdf", { type: "application/pdf" })], ZONES[1]);
          }}
        >
          <FileText className="w-3.5 h-3.5" /> sample sales invoice
        </button>
        <span>·</span>
        <button
          data-testid="load-sample-vendor-btn"
          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
          onClick={() => {
            const txt = `Purchase Invoice\nSupplier: Bharti Airtel Ltd\nGSTIN: 29AABCU9603R1Z2\nInvoice No: BAL-9981\nDate: ${new Date().toISOString().slice(0, 10)}\nTaxable Value: 2000\nCGST: 180\nSGST: 180\nTotal: 2360`;
            uploadFiles([new File([txt], "vendor-sample.pdf", { type: "application/pdf" })], ZONES[2]);
          }}
        >
          <FileText className="w-3.5 h-3.5" /> sample purchase invoice
        </button>
        <span>·</span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Package className="w-3.5 h-3.5" /> pipelines run async
        </span>
      </div>

      {/* Processing pipeline queue */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="font-display text-base">Processing pipeline</CardTitle>
          <Button
            variant="outline"
            size="sm"
            data-testid="refresh-jobs-btn"
            onClick={() => setTick((x) => x + 1)}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-semibold py-2 px-3">Job ID</th>
                <th className="text-left font-semibold py-2 px-3">Document Type</th>
                <th className="text-left font-semibold py-2 px-3">Platform</th>
                <th className="text-left font-semibold py-2 px-3">Status</th>
                <th className="text-left font-semibold py-2 px-3">Progress</th>
                <th className="text-left font-semibold py-2 px-3">Message</th>
                <th className="text-right font-semibold py-2 px-3">Attempts</th>
              </tr>
            </thead>
            <tbody data-testid="jobs-tbody">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No jobs yet. Drop files above to begin.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-slate-100 table-row-hover">
                  <td className="py-2 px-3 font-mono text-xs text-slate-600">
                    {j.id.slice(0, 8)}
                  </td>
                  <td className="py-2 px-3">
                    <DocTypeBadge kind={j.kind} />
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500 capitalize">
                    {j.kind === "marketplace_parse" ? (j.marketplace ?? "—") : "—"}
                  </td>
                  <td className="py-2 px-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="py-2 px-3 w-40">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cls(
                          "h-full transition-all",
                          j.status === "failed"
                            ? "bg-red-500"
                            : j.status === "exception"
                              ? "bg-amber-500"
                              : j.status === "complete"
                                ? "bg-emerald-500"
                                : "bg-blue-500"
                        )}
                        style={{ width: `${j.progress}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-600 text-xs">{j.message}</td>
                  <td className="py-2 px-3 text-right tabular">
                    {j.attempts}/{j.max_attempts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DocTypeBadge({ kind }: { kind: string }) {
  const label = DOC_TYPE_LABEL[kind] ?? kind;
  const colors: Record<string, string> = {
    "Marketplace": "bg-violet-50 text-violet-700 border-violet-200",
    "Sales (Outward)": "bg-blue-50 text-blue-700 border-blue-200",
    "Purchase (Inward)": "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span className={cls("text-xs px-2 py-0.5 rounded-full border font-medium", colors[label] ?? "bg-slate-50 text-slate-600 border-slate-200")}>
      {label}
    </span>
  );
}
