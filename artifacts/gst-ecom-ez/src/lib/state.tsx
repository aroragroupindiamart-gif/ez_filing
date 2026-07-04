import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import api from "@/lib/api";

interface Seller {
  gstin: string;
  trade_name?: string;
  legal_name?: string;
}

interface AppState {
  sellers: Seller[];
  sellerGstin: string | null;
  setSellerGstin: (g: string) => void;
  period: string;
  setPeriod: (p: string) => void;
  refreshSellers: () => Promise<Seller[]>;
  loading: boolean;
}

const Ctx = createContext<AppState | null>(null);

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellerGstin, setSellerGstin] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);

  const refreshSellers = async () => {
    const rows: Seller[] = await api.listSellers();
    setSellers(rows);
    if (rows.length && !sellerGstin) setSellerGstin(rows[0].gstin);
    return rows;
  };

  useEffect(() => {
    (async () => {
      try {
        let rows: Seller[] = await api.listSellers();
        if (!rows.length) {
          const seed: any = await api.seedDemo();
          setPeriod(seed.period);
          rows = await api.listSellers();
        }
        setSellers(rows);
        if (rows.length) setSellerGstin(rows[0].gstin);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider
      value={{
        sellers,
        sellerGstin,
        setSellerGstin,
        period,
        setPeriod,
        refreshSellers,
        loading,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAppState = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
};
