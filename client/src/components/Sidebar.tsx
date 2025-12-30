import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  GitCompare, 
  CheckCircle, 
  List, 
  Package,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  isAdmin: boolean;
  isViewer?: boolean;
  unreconciledCount?: number;
  suggestedCount?: number;
  onLogout?: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: string;
  adminOnly?: boolean;
  viewerHidden?: boolean;
}

export default function Sidebar({ isAdmin, isViewer = false, unreconciledCount = 0, suggestedCount = 0, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  const navItems: NavItem[] = [
    { 
      path: "/", 
      label: "Dashboard", 
      icon: <LayoutDashboard className="w-5 h-5" />,
      viewerHidden: true
    },
    { 
      path: "/reconciliation", 
      label: "Reconciliation", 
      icon: <GitCompare className="w-5 h-5" />,
      badge: suggestedCount,
      badgeColor: "bg-cyan-600",
      viewerHidden: true
    },
    { 
      path: "/reconciled", 
      label: "Reconciled", 
      icon: <CheckCircle className="w-5 h-5" />,
      viewerHidden: true
    },
    { 
      path: "/all-transactions", 
      label: "All Transactions", 
      icon: <List className="w-5 h-5" />
    },
    { 
      path: "/batches", 
      label: "Batches", 
      icon: <Package className="w-5 h-5" />
    },
    { 
      path: "/manage-unreconciled", 
      label: "Manage Unreconciled", 
      icon: <AlertCircle className="w-5 h-5" />,
      badge: unreconciledCount,
      badgeColor: "bg-amber-600",
      adminOnly: true
    },
  ];

  const filteredItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.viewerHidden && isViewer) return false;
    return true;
  });

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2 }}
      className="h-screen bg-slate-900 border-r border-slate-800 flex flex-col"
      data-testid="sidebar"
    >
      <div className="p-4 flex items-center justify-between border-b border-slate-800">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <GitCompare className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-slate-100 text-lg">Recon</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          data-testid="button-toggle-sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {filteredItems.map((item) => (
          <Tooltip key={item.path} delayDuration={collapsed ? 0 : 1000}>
            <TooltipTrigger asChild>
              <Link href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all",
                    isActive(item.path)
                      ? "bg-slate-800 text-cyan-400 border border-cyan-900/50"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                  )}
                  data-testid={`nav-${item.path.replace("/", "") || "dashboard"}`}
                >
                  <div className="flex-shrink-0">{item.icon}</div>
                  
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex-1 flex items-center justify-between overflow-hidden"
                      >
                        <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <Badge 
                            className={cn("text-xs", item.badgeColor || "bg-slate-600")}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {collapsed && item.badge !== undefined && item.badge > 0 && (
                    <div className={cn(
                      "absolute right-2 top-1 w-2 h-2 rounded-full",
                      item.badgeColor || "bg-slate-600"
                    )} />
                  )}
                </div>
              </Link>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="bg-slate-800 border-slate-700">
                <p>{item.label}</p>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-xs text-slate-400 ml-1">({item.badge})</span>
                )}
              </TooltipContent>
            )}
          </Tooltip>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <Tooltip delayDuration={collapsed ? 0 : 1000}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={onLogout}
              className={cn(
                "w-full text-slate-400 hover:text-red-400 hover:bg-red-900/20",
                collapsed ? "justify-center px-0" : "justify-start"
              )}
              data-testid="button-logout"
            >
              <LogOut className="w-5 h-5" />
              <AnimatePresence mode="wait">
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="ml-3 text-sm"
                  >
                    Logout
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="bg-slate-800 border-slate-700">
              <p>Logout</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </motion.aside>
  );
}
