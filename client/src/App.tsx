import { useState, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import ReconciliationPage from "@/pages/reconciliation";
import ReconciledPage from "@/pages/reconciled";
import AllTransactionsPage from "@/pages/all-transactions";
import UnreconciledTransactionsPage from "@/pages/unreconciled-transactions";
import BatchesPage from "@/pages/batches";
import LoginPage from "@/pages/login";
import Layout from "@/components/Layout";

function AppContent({ isAdmin, isViewer, onLogout }: { isAdmin: boolean; isViewer: boolean; onLogout: () => void }) {
  const [, setLocation] = useLocation();

  const { data: bankTransactions = [] } = useQuery({
    queryKey: ["/api/bank-transactions"],
  });

  const unreconciledCount = Array.isArray(bankTransactions)
    ? bankTransactions.filter((t: any) => t.reconciliationStatus === "unmatched").length
    : 0;

  const suggestedCount = Array.isArray(bankTransactions)
    ? bankTransactions.filter((t: any) => t.reconciliationStatus === "suggested_match").length
    : 0;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onLogout();
      setLocation("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isViewer) {
    return (
      <Layout 
        isAdmin={false} 
        isViewer={true}
        onLogout={handleLogout}
      >
        <Switch>
          <Route path="/all-transactions" component={() => <AllTransactionsPage isViewer={true} />} />
          <Route path="/batches" component={BatchesPage} />
          <Route><Redirect to="/all-transactions" /></Route>
        </Switch>
      </Layout>
    );
  }

  return (
    <Layout 
      isAdmin={isAdmin}
      unreconciledCount={unreconciledCount}
      suggestedCount={suggestedCount}
      onLogout={handleLogout}
    >
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/reconciliation" component={() => <ReconciliationPage isAdmin={isAdmin} />} />
        <Route path="/reconciled" component={ReconciledPage} />
        <Route path="/all-transactions" component={() => <AllTransactionsPage isAdmin={isAdmin} />} />
        <Route path="/batches" component={BatchesPage} />
        {isAdmin && <Route path="/manage-unreconciled" component={UnreconciledTransactionsPage} />}
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent 
          isAdmin={isAdmin} 
          isViewer={role === "viewer"} 
          onLogout={() => {
            setIsAuthenticated(false);
            setIsAdmin(false);
            setRole("operator");
          }} 
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
