import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  GitCompare, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp,
  ArrowRight,
  Clock,
  DollarSign,
  FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface DashboardStats {
  totalTransactions: number;
  reconciledTransactions: number;
  suggestedMatches: number;
  unmatchedTransactions: number;
  totalAmount: number;
  reconciledAmount: number;
}

export default function DashboardPage() {
  const { data: bankTransactions = [] } = useQuery({
    queryKey: ["/api/bank-transactions"],
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
  });

  const stats: DashboardStats = {
    totalTransactions: Array.isArray(bankTransactions) ? bankTransactions.length : 0,
    reconciledTransactions: Array.isArray(bankTransactions) 
      ? bankTransactions.filter((t: any) => t.reconciliationStatus === "reconciled").length 
      : 0,
    suggestedMatches: Array.isArray(bankTransactions) 
      ? bankTransactions.filter((t: any) => t.reconciliationStatus === "suggested_match").length 
      : 0,
    unmatchedTransactions: Array.isArray(bankTransactions) 
      ? bankTransactions.filter((t: any) => t.reconciliationStatus === "unmatched").length 
      : 0,
    totalAmount: Array.isArray(bankTransactions) 
      ? bankTransactions.reduce((sum: number, t: any) => sum + parseFloat(t.creditAmount || 0), 0)
      : 0,
    reconciledAmount: Array.isArray(bankTransactions) 
      ? bankTransactions
          .filter((t: any) => t.reconciliationStatus === "reconciled")
          .reduce((sum: number, t: any) => sum + parseFloat(t.creditAmount || 0), 0)
      : 0,
  };

  const reconciliationRate = stats.totalTransactions > 0 
    ? Math.round((stats.reconciledTransactions / stats.totalTransactions) * 100) 
    : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const statCards = [
    {
      title: "Total Transactions",
      value: stats.totalTransactions,
      icon: <FileText className="w-5 h-5" />,
      color: "text-slate-100",
      bgColor: "bg-slate-800",
      borderColor: "border-slate-700",
    },
    {
      title: "Reconciled",
      value: stats.reconciledTransactions,
      icon: <CheckCircle className="w-5 h-5" />,
      color: "text-green-400",
      bgColor: "bg-green-900/20",
      borderColor: "border-green-800",
    },
    {
      title: "Suggested Matches",
      value: stats.suggestedMatches,
      icon: <GitCompare className="w-5 h-5" />,
      color: "text-cyan-400",
      bgColor: "bg-cyan-900/20",
      borderColor: "border-cyan-800",
    },
    {
      title: "Unmatched",
      value: stats.unmatchedTransactions,
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "text-amber-400",
      bgColor: "bg-amber-900/20",
      borderColor: "border-amber-800",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100" data-testid="text-dashboard-title">
            Reconciliation Dashboard
          </h1>
          <p className="text-slate-400 mt-1">
            Overview of your bank transaction reconciliation status
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className={`${card.bgColor} border ${card.borderColor}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">{card.title}</p>
                      <p className={`text-3xl font-bold mt-1 ${card.color}`} data-testid={`stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        {card.value.toLocaleString()}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg ${card.bgColor} ${card.color}`}>
                      {card.icon}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  Reconciliation Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-slate-400">Overall Progress</span>
                      <span className="text-sm font-medium text-slate-100">{reconciliationRate}%</span>
                    </div>
                    <Progress 
                      value={reconciliationRate} 
                      className="h-3 bg-slate-800"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                    <div>
                      <p className="text-sm text-slate-400">Total Amount</p>
                      <p className="text-xl font-semibold text-slate-100">
                        {formatCurrency(stats.totalAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Reconciled Amount</p>
                      <p className="text-xl font-semibold text-green-400">
                        {formatCurrency(stats.reconciledAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.suggestedMatches > 0 && (
                    <Link href="/reconciliation">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between bg-cyan-900/20 border-cyan-800 text-cyan-400 hover:bg-cyan-900/40"
                        data-testid="button-review-suggestions"
                      >
                        <span className="flex items-center gap-2">
                          <GitCompare className="w-4 h-4" />
                          Review {stats.suggestedMatches} Suggested Matches
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                  
                  {stats.unmatchedTransactions > 0 && (
                    <Link href="/reconciliation">
                      <Button 
                        variant="outline" 
                        className="w-full justify-between bg-amber-900/20 border-amber-800 text-amber-400 hover:bg-amber-900/40"
                        data-testid="button-view-unmatched"
                      >
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Process {stats.unmatchedTransactions} Unmatched Transactions
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                  
                  <Link href="/all-transactions">
                    <Button 
                      variant="outline" 
                      className="w-full justify-between bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      data-testid="button-view-all"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        View All Transactions
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-cyan-400" />
                Orders Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-slate-400">Total Orders</p>
                  <p className="text-2xl font-bold text-slate-100" data-testid="stat-total-orders">
                    {Array.isArray(orders) ? orders.length.toLocaleString() : 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Matched Orders</p>
                  <p className="text-2xl font-bold text-green-400" data-testid="stat-matched-orders">
                    {Array.isArray(orders) 
                      ? orders.filter((o: any) => o.reconciliationStatus === "reconciled").length.toLocaleString() 
                      : 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Suggested</p>
                  <p className="text-2xl font-bold text-cyan-400" data-testid="stat-suggested-orders">
                    {Array.isArray(orders) 
                      ? orders.filter((o: any) => o.reconciliationStatus === "suggested_match").length.toLocaleString() 
                      : 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Unmatched</p>
                  <p className="text-2xl font-bold text-amber-400" data-testid="stat-unmatched-orders">
                    {Array.isArray(orders) 
                      ? orders.filter((o: any) => o.reconciliationStatus === "unmatched").length.toLocaleString() 
                      : 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
