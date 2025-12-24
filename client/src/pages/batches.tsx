import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  LogOut,
  Layers,
  ArrowLeft,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Undo2
} from "lucide-react";
import { Link } from "wouter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

interface BatchGroup {
  batchId: number;
  reconciledAt: string;
  groups: { order: any; transactions: any[] }[];
  totalAmount: number;
}

const BatchCard = ({ batch, onRegenerate, isRegenerating, isAdmin, onUnconciliate, unconciliatingOrderId }: { 
  batch: BatchGroup; 
  onRegenerate: (batchId: number, orderIds: number[]) => void;
  isRegenerating: boolean;
  isAdmin?: boolean;
  onUnconciliate: (orderId: number, transactionHashes: string[]) => void;
  unconciliatingOrderId: number | null;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return dateStr.split(' ')[0];
  };

  const orderIds = batch.groups.map(g => g.order.orderId).filter(Boolean);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors border border-slate-700" data-testid={`batch-header-${batch.batchId}`}>
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
            <Badge variant="outline" className="font-mono border-cyan-600 text-cyan-400">Batch #{batch.batchId}</Badge>
            <span className="text-sm text-slate-400">
              {batch.groups.length} orders
            </span>
            <span className="text-xs text-slate-500">
              {formatDate(batch.reconciledAt)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-green-400">
              {batch.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} EUR
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate(batch.batchId, orderIds);
              }}
              disabled={isRegenerating}
              className="border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              data-testid={`button-regenerate-${batch.batchId}`}
            >
              <Download className="w-4 h-4 mr-2" />
              {isRegenerating ? "Generating..." : "Re-Generate File"}
            </Button>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="mt-2 space-y-2 pl-6 border-l-2 border-slate-700 ml-3">
          {batch.groups.map(({ order, transactions }) => (
            <div key={order.orderId} className="flex border border-slate-700 rounded-md overflow-hidden bg-slate-900" data-testid={`batch-order-${order.orderId}`}>
              <div className="flex-1 p-3 border-r border-slate-700 space-y-1">
                {transactions.map((t: any) => (
                  <div key={t.transactionHash} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span className="text-xs font-mono text-slate-500">
                        {t.transactionDate?.split(' ')[0]}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 font-mono bg-slate-800 text-slate-300">
                        {t.extractedReference || '-'}
                      </Badge>
                      <span className="text-slate-400 truncate max-w-[150px]">{t.payerSender}</span>
                    </div>
                    <span className="font-mono text-green-400">{parseFloat(t.creditAmount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="w-64 p-3 bg-slate-800/50 flex flex-col justify-center">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">#{order.orderId}</span>
                    <span className="text-slate-400 truncate max-w-[80px]">{order.customerName}</span>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUnconciliate(order.orderId, transactions.map((t: any) => t.transactionHash))}
                      disabled={unconciliatingOrderId === order.orderId}
                      className="h-6 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-900/30"
                      data-testid={`button-unconciliate-${order.orderId}`}
                    >
                      <Undo2 className="w-3 h-3 mr-1" />
                      {unconciliatingOrderId === order.orderId ? "..." : "Undo"}
                    </Button>
                  )}
                </div>
                <span className="font-mono text-pink-400 text-sm">{parseFloat(order.amountTotalFee).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface BatchesPageProps {
  isAdmin?: boolean;
}

export default function BatchesPage({ isAdmin = false }: BatchesPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [regeneratingBatchId, setRegeneratingBatchId] = useState<number | null>(null);
  const [unconciliatingOrderId, setUnconciliatingOrderId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: reconciledData = { transactions: [], orders: [] }, isLoading, refetch } = useQuery<{
    transactions: any[];
    orders: any[];
  }>({
    queryKey: ["/api/reconciled"],
    queryFn: async () => {
      const response = await fetch("/api/reconciled");
      if (!response.ok) throw new Error("Failed to fetch reconciled data");
      return response.json();
    },
  });

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  };

  const reconciledBatches = useMemo(() => {
    const { transactions, orders } = reconciledData;
    
    const batchIds = Array.from(new Set(transactions.map(t => t.batchId).filter(Boolean))).sort((a, b) => (b as number) - (a as number));
    
    return batchIds.map(batchId => {
      const batchTransactions = transactions.filter(t => t.batchId === batchId);
      const orderIdsInBatch = Array.from(new Set(batchTransactions.map(t => t.orderId).filter(Boolean)));
      
      const groups = orderIdsInBatch.map(orderId => {
        const order = orders.find(o => o.orderId === orderId);
        const orderTransactions = batchTransactions.filter(t => t.orderId === orderId);
        return { 
          order: order || { orderId, customerName: 'Unknown', orderBankReference: '', amountTotalFee: '0', orderDate: '' }, 
          transactions: orderTransactions 
        };
      });
      
      const reconciledAt = batchTransactions[0]?.reconciledAt;
      
      return {
        batchId: batchId as number,
        reconciledAt,
        groups,
        totalAmount: batchTransactions.reduce((sum, t) => sum + parseFloat(t.creditAmount || '0'), 0)
      };
    });
  }, [reconciledData]);

  const filteredBatches = useMemo(() => {
    if (!searchQuery.trim()) return reconciledBatches;
    
    const query = searchQuery.toLowerCase();
    
    return reconciledBatches.filter(batch => {
      if (batch.batchId.toString().includes(query)) return true;
      if (batch.reconciledAt?.toLowerCase().includes(query)) return true;
      if (batch.totalAmount.toString().includes(query)) return true;
      
      return batch.groups.some(({ order, transactions }) => {
        if (order.orderId?.toString().includes(query)) return true;
        if (order.customerName?.toLowerCase().includes(query)) return true;
        if (order.orderBankReference?.toLowerCase().includes(query)) return true;
        if (order.amountTotalFee?.toString().includes(query)) return true;
        
        return transactions.some(t => {
          if (t.transactionHash?.toLowerCase().includes(query)) return true;
          if (t.payerSender?.toLowerCase().includes(query)) return true;
          if (t.extractedReference?.toLowerCase().includes(query)) return true;
          if (t.description?.toLowerCase().includes(query)) return true;
          if (t.creditAmount?.toString().includes(query)) return true;
          return false;
        });
      });
    });
  }, [reconciledBatches, searchQuery]);

  const handleRegenerate = async (batchId: number, orderIds: number[]) => {
    if (orderIds.length === 0) {
      toast({
        title: "Error",
        description: "No orders in this batch",
        variant: "destructive"
      });
      return;
    }

    setRegeneratingBatchId(batchId);
    
    try {
      const response = await fetch("/api/export-reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds })
      });

      if (!response.ok) {
        throw new Error("Failed to generate file");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reconciliation_batch_${batchId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: `File for Batch #${batchId} downloaded successfully`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate file",
        variant: "destructive"
      });
    } finally {
      setRegeneratingBatchId(null);
    }
  };

  const handleUnconciliate = async (orderId: number, transactionHashes: string[]) => {
    if (transactionHashes.length === 0) {
      toast({
        title: "Error",
        description: "No transactions to unconciliate",
        variant: "destructive"
      });
      return;
    }

    setUnconciliatingOrderId(orderId);
    
    try {
      const response = await fetch("/api/unconciliate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHashes, orderId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to unconciliate");
      }

      toast({
        title: "Success",
        description: `Order #${orderId} has been unconciliated`
      });
      
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unconciliate",
        variant: "destructive"
      });
    } finally {
      setUnconciliatingOrderId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Reconciliation Batches</h1>
              <p className="text-sm text-slate-400">View reconciliated transactions grouped by batch</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/all-transactions">
              <Button 
                variant="outline" 
                size="sm"
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
                data-testid="button-back-transactions"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Transactions
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleLogout}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6">
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                Batches
                <Badge variant="secondary" className="bg-slate-700 text-slate-300" data-testid="text-batch-count">
                  {filteredBatches.length} of {reconciledBatches.length}
                </Badge>
              </CardTitle>
            </div>

            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search by batch ID, order ID, customer name, reference, amount, payer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  data-testid="input-search-batches"
                />
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-slate-400">Loading batches...</div>
            ) : filteredBatches.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {searchQuery ? "No batches match your search" : "No reconciliated batches found"}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBatches.map(batch => (
                  <BatchCard 
                    key={batch.batchId} 
                    batch={batch} 
                    onRegenerate={handleRegenerate}
                    isRegenerating={regeneratingBatchId === batch.batchId}
                    isAdmin={isAdmin}
                    onUnconciliate={handleUnconciliate}
                    unconciliatingOrderId={unconciliatingOrderId}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
