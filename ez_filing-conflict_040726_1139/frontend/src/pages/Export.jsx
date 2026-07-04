import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { useAppState } from "@/lib/state";
import { toast } from "sonner";

function extractApiError(e) {
  const detail = e?.response?.data?.detail;
  if (!detail) return "Export failed";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  return JSON.stringify(detail);
}

export default function ExportPage() {
  const { sellerGstin, period, loading } = useAppState();
  const [previews, setPreviews] = useState({ gstr1: null, gstr3b: null });

  const buildAndDownload = async (kind) => {
    if (!sellerGstin) {
      toast.error("Select a seller GSTIN first.");
      return;
    }
    try {
      const fn = kind === "gstr1" ? api.exportGstr1 : api.exportGstr3b;
      const res = await fn(sellerGstin, period);
      setPreviews((p) => ({ ...p, [kind]: res.preview }));
      window.open(api.downloadUrl(res.export_id, res.download_token), "_blank");
      toast.success(`${kind.toUpperCase()} JSON download triggered`);
    } catch (e) {
      toast.error(extractApiError(e));
    }
  };

  return (
    <div className="space-y-6" data-testid="export-page">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">Export portal-ready JSON</h1>
        <p className="mt-2 text-slate-500 max-w-3xl">Payload stored encrypted at rest (AES-256-GCM). Download URLs are HMAC-signed and expire in 10 minutes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {["gstr1", "gstr3b"].map((k) => (
          <Card className="border-slate-200 shadow-sm" key={k}>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base flex items-center justify-between">
                {k.toUpperCase()} — GSTN offline tool schema
                <span className="text-[11px] font-normal text-emerald-700 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> plain on download
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                data-testid={`export-${k}-btn`}
                disabled={loading || !sellerGstin}
                onClick={() => buildAndDownload(k)}
              >
                <Download className="w-4 h-4" /> Generate & download {k.toUpperCase()}
              </Button>
              {previews[k] && (
                <pre className="text-[11px] leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-auto max-h-[400px] font-mono">
                  {JSON.stringify(previews[k], null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
