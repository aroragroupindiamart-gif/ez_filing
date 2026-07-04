import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAppState } from "@/lib/state";
import { CheckCircle2 } from "lucide-react";

export default function Exceptions() {
  const { sellerGstin, period } = useAppState();
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<Record<string, any>>({});

  const load = async () => {
    if (!sellerGstin || !period) return;
    setRows(await api.listExceptions(sellerGstin, period));
  };
  useEffect(() => {
    load();
  }, [sellerGstin, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = async (id: string, corrected: object) => {
    await api.resolveException(id, corrected);
    toast.success("Exception resolved");
    load();
  };

  return (
    <div className="space-y-6" data-testid="exceptions-page">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
          Exception Ledger
        </h1>
        <p className="mt-2 text-slate-500">
          Rows the parser couldn&apos;t classify. Fix inline — nothing is silently dropped.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Open exceptions ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="text-left font-semibold py-2 px-3">Upload</th>
                <th className="text-left font-semibold py-2 px-3">Row</th>
                <th className="text-left font-semibold py-2 px-3">Reason</th>
                <th className="text-left font-semibold py-2 px-3">Raw</th>
                <th className="text-left font-semibold py-2 px-3">Fix</th>
                <th className="text-right font-semibold py-2 px-3">Action</th>
              </tr>
            </thead>
            <tbody data-testid="exceptions-tbody">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No open exceptions. All rows landed cleanly.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const fix = editing[r.id] ?? {
                  supplier_gstin:
                    r.raw?.["Buyer GSTIN"] || r.raw?.supplier_gstin || "",
                };
                return (
                  <tr key={r.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 px-3 font-mono text-xs text-slate-500">
                      {r.upload_id?.slice(0, 8) || "—"}
                    </td>
                    <td className="py-2 px-3 tabular">{r.row_index ?? "—"}</td>
                    <td className="py-2 px-3 text-red-700 text-xs max-w-[280px]">{r.reason}</td>
                    <td className="py-2 px-3">
                      <details>
                        <summary className="text-blue-600 text-xs cursor-pointer">view raw</summary>
                        <pre className="mt-2 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 max-w-md whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(r.raw, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        data-testid={`exception-fix-input-${r.id}`}
                        placeholder="Enter supplier GSTIN or notes"
                        value={fix.supplier_gstin || ""}
                        onChange={(e) =>
                          setEditing((prev) => ({
                            ...prev,
                            [r.id]: { supplier_gstin: e.target.value },
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button
                        size="sm"
                        data-testid={`exception-resolve-btn-${r.id}`}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => resolve(r.id, fix)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
