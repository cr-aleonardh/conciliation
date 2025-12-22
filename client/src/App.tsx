import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ReconciliationPage from "@/pages/reconciliation";
import ReconciledPage from "@/pages/reconciled";
import LoginPage from "@/pages/login";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ReconciliationPage} />
      <Route path="/reconciled" component={ReconciledPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.isAuthenticated);
      })
      .catch(() => {
        setIsAuthenticated(false);
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
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
