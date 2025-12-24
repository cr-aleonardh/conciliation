import { useState, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ReconciliationPage from "@/pages/reconciliation";
import ReconciledPage from "@/pages/reconciled";
import AllTransactionsPage from "@/pages/all-transactions";
import UnreconciledTransactionsPage from "@/pages/unreconciled-transactions";
import LoginPage from "@/pages/login";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string>("operator");

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.isAuthenticated);
        setIsAdmin(data.isAdmin || false);
        setRole(data.role || "operator");
      })
      .catch(() => {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setRole("operator");
      });
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={(admin: boolean, userRole: string) => { setIsAuthenticated(true); setIsAdmin(admin); setRole(userRole); }} />;
  }

  if (role === "viewer") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/all-transactions" component={() => <AllTransactionsPage isViewer={true} />} />
            <Route><Redirect to="/all-transactions" /></Route>
          </Switch>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Switch>
          <Route path="/" component={() => <ReconciliationPage isAdmin={isAdmin} />} />
          <Route path="/reconciled" component={ReconciledPage} />
          <Route path="/all-transactions" component={() => <AllTransactionsPage isAdmin={isAdmin} />} />
          {isAdmin && <Route path="/manage-unreconciled" component={UnreconciledTransactionsPage} />}
          <Route component={NotFound} />
        </Switch>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
