import { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
  isAdmin: boolean;
  isViewer?: boolean;
  unreconciledCount?: number;
  suggestedCount?: number;
  onLogout?: () => void;
}

export default function Layout({ 
  children, 
  isAdmin, 
  isViewer = false,
  unreconciledCount = 0, 
  suggestedCount = 0,
  onLogout 
}: LayoutProps) {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar 
        isAdmin={isAdmin}
        isViewer={isViewer}
        unreconciledCount={unreconciledCount}
        suggestedCount={suggestedCount}
        onLogout={onLogout}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
