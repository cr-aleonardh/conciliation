import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  GitCompare, 
  LayoutDashboard, 
  CreditCard,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LandingPageProps {
  isAdmin: boolean;
}

export default function LandingPage({ isAdmin }: LandingPageProps) {
  const navItems = [
    {
      title: "Dashboard",
      description: "Overview of reconciliation status and statistics",
      icon: <LayoutDashboard className="w-8 h-8" />,
      path: "/dashboard",
      color: "from-blue-500 to-cyan-500",
      borderColor: "border-blue-500/30",
      hoverBorder: "hover:border-blue-500/60",
    },
    {
      title: "Reconciliation Cockpit",
      description: "Match bank transactions with holding orders",
      icon: <GitCompare className="w-8 h-8" />,
      path: "/reconciliation",
      color: "from-emerald-500 to-green-500",
      borderColor: "border-emerald-500/30",
      hoverBorder: "hover:border-emerald-500/60",
    },
    ...(isAdmin ? [{
      title: "Conciliate Paid Orders",
      description: "Match bank transactions with paid/completed orders in Remitec",
      icon: <CreditCard className="w-8 h-8" />,
      path: "/paid-orders-reconciliation",
      color: "from-purple-500 to-pink-500",
      borderColor: "border-purple-500/30",
      hoverBorder: "hover:border-purple-500/60",
      adminOnly: true,
    }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-8 flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <GitCompare className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-slate-100" data-testid="text-landing-title">
              Reconciliation System
            </h1>
          </div>
          <p className="text-slate-400 text-lg">
            Select a workspace to get started
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {navItems.map((item, index) => (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link href={item.path}>
                <Card 
                  className={`bg-slate-900/50 border ${item.borderColor} ${item.hoverBorder} cursor-pointer transition-all duration-300 hover:bg-slate-900 hover:shadow-lg group h-full`}
                  data-testid={`card-nav-${item.path.replace('/', '')}`}
                >
                  <CardHeader>
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <div className="text-white">
                        {item.icon}
                      </div>
                    </div>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      {item.title}
                      {item.adminOnly && (
                        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
                          Admin
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-cyan-400 text-sm font-medium group-hover:translate-x-2 transition-transform">
                      Open
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>

        {isAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 text-center"
          >
            <p className="text-slate-500 text-sm">
              You have admin access. Additional options are available.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
