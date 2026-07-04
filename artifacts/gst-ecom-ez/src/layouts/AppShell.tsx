import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Upload,
  AlertTriangle,
  ClipboardCheck,
  FileSpreadsheet,
  Calculator,
  Download,
  ShieldCheck,
} from "lucide-react";
import { useAppState } from "@/lib/state";
import { periodLabel } from "@/lib/format";
import { ReactNode } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/upload", label: "Upload", icon: Upload, testid: "nav-upload" },
  { to: "/exceptions", label: "Exception Ledger", icon: AlertTriangle, testid: "nav-exceptions" },
  { to: "/ims", label: "IMS Actions", icon: ClipboardCheck, testid: "nav-ims" },
  { to: "/compliance", label: "Compliance Preview", icon: FileSpreadsheet, testid: "nav-compliance" },
  { to: "/interest", label: "Interest Estimator", icon: Calculator, testid: "nav-interest" },
  { to: "/export", label: "Export", icon: Download, testid: "nav-export" },
];

const AppShell = ({ children }: { children: ReactNode }) => {
  const { sellers, sellerGstin, setSellerGstin, period, setPeriod } = useAppState();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 fixed inset-y-0 left-0 flex flex-col">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="font-display font-semibold text-slate-900 leading-none">GST-ECOM-EZ</div>
            <div className="text-[11px] text-slate-500 mt-1 uppercase tracking-wider">Portal-ready filings</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1" data-testid="app-sidebar">
          {nav.map((n) => {
            const active = n.to === "/" ? location === "/" : location.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                href={n.to}
                data-testid={n.testid}
                className={
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors " +
                  (active
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")
                }
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-200 text-[11px] text-slate-400">
          Encryption: <span className="text-emerald-600 font-medium">AES-256-GCM</span>
          <br />
          v0.1 · Rule 88B(1) engine
        </div>
      </aside>

      {/* Main */}
      <div className="ml-64 flex-1 flex flex-col">
        <header className="h-16 sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center px-8 gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">
                Seller GSTIN
              </label>
              <select
                data-testid="header-seller-select"
                value={sellerGstin || ""}
                onChange={(e) => setSellerGstin(e.target.value)}
                className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white font-mono tabular focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {sellers.map((s) => (
                  <option key={s.gstin} value={s.gstin}>
                    {s.gstin} — {s.trade_name || s.legal_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">
                Filing Period
              </label>
              <input
                data-testid="header-period-input"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white tabular focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div className="ml-auto text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Reviewing</div>
              <div className="text-sm font-medium text-slate-900">{periodLabel(period)}</div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
