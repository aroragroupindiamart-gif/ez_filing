import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UploadCloud, RefreshCw, FileSpreadsheet, FileText, Package } from "lucide-react";
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

export default function UploadPage() {
  const { sellerGstin, period } = useAppState();
  const [marketplace, setMarketplace] = useState("amazon");
  const [dragActive, setDragActive] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
    async (files: File[]) => {
      if (!sellerGstin) return toast.error("Select a seller GSTIN first.");
      for (const file of files) {
        const isPdf = file.name.toLowerCase().endsWith(".pdf");
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        const isXlsx =
          file.name.toLowerCase().endsWith(".xls") ||
          file.name.toLowerCase().endsWith(".xlsx");
        if (!isPdf && !isCsv && !isXlsx) {
          toast.error(`Unsupported file type: ${file.name}`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", isPdf ? "vendor_pdf" : isXlsx ? "marketplace_xlsx" : "marketplace_csv");
        fd.append("period", period);
        fd.append("seller_gstin", sellerGstin);
        if (!isPdf) fd.append("marketplace", marketplace);
        try {
          const res = await api.uploadFile(fd);
          toast.success(`Queued: ${file.name}`);
          setJobs((prev) => [res.job, ...prev]);
        } catch (e: any) {
          toast.error(
            `Failed to upload ${file.name}: ${e?.response?.data?.detail || e.message}`
          );
        }
      }
      setTick((x) => x + 1);
    },
    [sellerGstin, period, marketplace]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    uploadFiles(files);
  };

  return (
    <div className="space-y-8" data-testid="upload-page">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
          Dropzone Control Center
        </h1>
        <p className="mt-2 text-slate-500">
          Drag CSV/XLSX marketplace settlements or vendor invoice PDFs. Async pipeline handles OCR,
          parsing and routing.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                Marketplace (for CSV/XLSX)
              </label>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg" data-testid="marketplace-tabs">
                {MARKETPLACES.map((m) => (
                  <button
                    key={m.id}
                    data-testid={`marketplace-tab-${m.id}`}
                    onClick={() => setMarketplace(m.id)}
                    className={cls(
                      "px-3 py-1 rounded-md text-sm transition-colors",
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
            <div className="ml-auto text-xs text-slate-500">
              Files encrypted at rest with AES-256-GCM · Download URLs are signed and expire in 10
              min.
            </div>
          </div>

          <div
            data-testid="dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cls(
              "cursor-pointer border-2 border-dashed rounded-xl p-10 text-center transition-colors",
              dragActive
                ? "border-blue-500 bg-blue-50/40 dropzone-active"
                : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/30"
            )}
          >
            <UploadCloud
              className={cls("w-10 h-10 mx-auto mb-3", dragActive ? "text-blue-600" : "text-slate-400")}
            />
            <div className="font-display text-lg text-slate-800 font-medium">
              Drop files here, or click to browse
            </div>
            <div className="text-sm text-slate-500 mt-1">
              CSV, XLSX (marketplace) · PDF (vendor invoices)
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept=".csv,.xls,.xlsx,.pdf"
              data-testid="file-input"
              onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
            />
          </div>

          <SampleTemplates onSelect={(files) => uploadFiles(files)} marketplace={marketplace} />
        </CardContent>
      </Card>

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
                <th className="text-left font-semibold py-2 px-3">Kind</th>
                <th className="text-left font-semibold py-2 px-3">Status</th>
                <th className="text-left font-semibold py-2 px-3">Progress</th>
                <th className="text-left font-semibold py-2 px-3">Message</th>
                <th className="text-right font-semibold py-2 px-3">Attempts</th>
              </tr>
            </thead>
            <tbody data-testid="jobs-tbody">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No jobs yet.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-slate-100 table-row-hover">
                  <td className="py-2 px-3 font-mono text-xs text-slate-600">
                    {j.id.slice(0, 8)}
                  </td>
                  <td className="py-2 px-3">
                    {j.kind === "vendor_ocr" ? "Vendor PDF" : "Marketplace file"}
                  </td>
                  <td className="py-2 px-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="py-2 px-3 w-56">
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

const SAMPLE_CSV = `Invoice Number,Invoice Date,Buyer State,Buyer GSTIN,Taxable Value,IGST,CGST,SGST,Cess,Invoice Amount,GST Rate,HSN,Quantity
SAMPLE-001,${new Date().toISOString().slice(0, 10)},Karnataka,,4500,0,405,405,0,5310,18,6109,1
SAMPLE-002,${new Date().toISOString().slice(0, 10)},Maharashtra,,7200,1296,0,0,0,8496,18,6109,1
SAMPLE-003,${new Date().toISOString().slice(0, 10)},Tamil Nadu,29AAAAA0000A1Z5,15000,2700,0,0,0,17700,18,6109,2
`;

const SampleTemplates = ({
  onSelect,
  marketplace,
}: {
  onSelect: (files: File[]) => void;
  marketplace: string;
}) => (
  <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
    <span>Or try:</span>
    <button
      data-testid="load-sample-csv-btn"
      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
      onClick={() => {
        const file = new File([SAMPLE_CSV], `${marketplace}-sample.csv`, { type: "text/csv" });
        onSelect([file]);
      }}
    >
      <FileSpreadsheet className="w-3.5 h-3.5" /> load a sample marketplace CSV
    </button>
    <span>·</span>
    <button
      data-testid="load-sample-pdf-btn"
      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
      onClick={() => {
        const content = `Vendor Invoice\nSupplier: Bharti Airtel Ltd\nGSTIN: 29AABCU9603R1Z2\nInvoice No: BAL-9981\nDate: ${new Date().toISOString().slice(0, 10)}\nTaxable Value: 2000\nCGST: 180\nSGST: 180\nTotal: 2360`;
        const file = new File([content], "vendor-sample.pdf", { type: "application/pdf" });
        onSelect([file]);
      }}
    >
      <FileText className="w-3.5 h-3.5" /> sample vendor doc (text-based)
    </button>
    <span>·</span>
    <span className="inline-flex items-center gap-1 text-slate-400">
      <Package className="w-3.5 h-3.5" /> pipelines run async
    </span>
  </div>
);
