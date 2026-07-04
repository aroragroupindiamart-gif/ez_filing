import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const Ctx = createContext(null);

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const AppStateProvider = ({ children }) => {
  const [sellers, setSellers] = useState([]);
  const [sellerGstin, setSellerGstin] = useState(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);

  const refreshSellers = async () => {
    const rows = await api.listSellers();
    setSellers(rows);
    if (rows.length && !sellerGstin) setSellerGstin(rows[0].gstin);
    return rows;
  };

  useEffect(() => {
    (async () => {
      try {
        let rows = await api.listSellers();
        if (!rows.length) {
          const seed = await api.seedDemo();
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
    <Ctx.Provider value={{
      sellers, sellerGstin, setSellerGstin,
      period, setPeriod,
      refreshSellers, loading,
    }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAppState = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState outside provider");
  return v;
};
