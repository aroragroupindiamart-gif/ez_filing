import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import AppShell from "@/layouts/AppShell";
import { AppStateProvider } from "@/lib/state";
import Dashboard from "@/pages/Dashboard";
import UploadPage from "@/pages/Upload";
import Exceptions from "@/pages/Exceptions";
import IMS from "@/pages/IMS";
import Compliance from "@/pages/Compliance";
import Interest from "@/pages/Interest";
import ExportPage from "@/pages/Export";

function App() {
  return (
    <BrowserRouter>
      <AppStateProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/exceptions" element={<Exceptions />} />
            <Route path="/ims" element={<IMS />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/interest" element={<Interest />} />
            <Route path="/export" element={<ExportPage />} />
          </Routes>
        </AppShell>
      </AppStateProvider>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
