import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "sonner";
import { AppStateProvider } from "@/lib/state";
import AppShell from "@/layouts/AppShell";
import Dashboard from "@/pages/Dashboard";
import UploadPage from "@/pages/Upload";
import Exceptions from "@/pages/Exceptions";
import IMS from "@/pages/IMS";
import Compliance from "@/pages/Compliance";
import Interest from "@/pages/Interest";
import ExportPage from "@/pages/Export";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/exceptions" component={Exceptions} />
      <Route path="/ims" component={IMS} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/interest" component={Interest} />
      <Route path="/export" component={ExportPage} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AppStateProvider>
        <AppShell>
          <AppRouter />
        </AppShell>
      </AppStateProvider>
      <Toaster position="top-right" richColors />
    </WouterRouter>
  );
}

export default App;
