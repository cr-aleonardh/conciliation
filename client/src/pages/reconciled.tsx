import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, CheckCircle2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const ReconciledBatchGroup = ({ batch }: { batch: { 
  batchId: number; 
  reconciledAt: string; 
  groups: { order: any; transactions: any[] }[];
  totalAmount: number;
}}) => {
  const [isOpen, setIsOpen] = useState(true);
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return dateStr.split(' ')[0];
  };
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors border border-border/40">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <Badge variant="outline" className="font-mono">Batch #{batch.batchId}</Badge>
            <span className="text-sm text-muted-foreground">
              {batch.groups.length} groups
            </span>
            <span className="text-xs text-muted-foreground/70">
              {formatDate(batch.reconciledAt)}
            </span>
          </div>
          <span className="font-mono text-sm text-green-600">
            {batch.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="mt-2 space-y-2 pl-4 border-l-2 border-border/30 ml-2">
          {batch.groups.map(({ order, transactions }) => (
            <div key={order.orderId} className="flex border border-border/40 rounded-md overflow-hidden bg-card">
              <div className="flex-1 p-3 border-r border-border/40 space-y-1">
                {transactions.map((t: any) => (
                  <div key={t.transactionHash} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {t.transactionDate?.split(' ')[0]}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 font-mono">
                        {t.extractedReference || '-'}
                      </Badge>
                      <span className="text-muted-foreground truncate max-w-[150px]">{t.payerSender}</span>
                    </div>
                    <span className="font-mono text-blue-600">{parseFloat(t.creditAmount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex-1 p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                    <span className="text-xs font-mono text-muted-foreground">
                      {order.orderDate?.split(' ')[0]}
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 font-mono bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-400">
                      {order.orderBankReference || '-'}
                    </Badge>
                    <span className="text-xs text-muted-foreground/60">#{order.orderId}</span>
                    <span className="text-muted-foreground truncate max-w-[150px]">{order.customerName}</span>
                  </div>
                  <span className="font-mono text-pink-600">{parseFloat(order.amountTotalFee).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default function ReconciledPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [reconciledData, setReconciledData] = useState<{
    transactions: any[];
    orders: any[];
  }>({ transactions: [], orders: [] });

  useEffect(() => {
    const fetchReconciledData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/reconciled');
        if (response.ok) {
          const data = await response.json();
          setReconciledData(data);
        }
      } catch (error) {
        console.error('Failed to fetch reconciled records:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchReconciledData();
  }, []);

  const reconciledBatches = useMemo(() => {
    const { transactions, orders } = reconciledData;
    
    const batchIds = Array.from(new Set(orders.map(o => o.batchId).filter(Boolean))).sort((a, b) => (b as number) - (a as number));
    
    return batchIds.map(batchId => {
      const batchOrders = orders.filter(o => o.batchId === batchId);
      const batchTransactions = transactions.filter(t => t.batchId === batchId);
      
      const groups = batchOrders.map(order => {
        const orderTransactions = batchTransactions.filter(t => t.orderId === order.orderId);
        return { order, transactions: orderTransactions };
      });
      
      return {
        batchId,
        reconciledAt: batchOrders[0]?.reconciledAt,
        groups,
        totalAmount: batchOrders.reduce((sum, o) => sum + parseFloat(o.amountTotalFee || '0'), 0)
      };
    });
  }, [reconciledData]);

  const totalReconciled = reconciledBatches.reduce((sum, batch) => sum + batch.totalAmount, 0);
  const totalOrders = reconciledData.orders.length;
  const totalTransactions = reconciledData.transactions.length;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="h-14 border-b bg-card/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-to-cockpit">
              <ArrowLeft className="w-4 h-4" />
              Back to Cockpit
            </Button>
          </Link>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h1 className="text-lg font-semibold">Reconciled Records</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Orders:</span>
            <Badge variant="secondary" data-testid="text-total-orders">{totalOrders}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Transactions:</span>
            <Badge variant="secondary" data-testid="text-total-transactions">{totalTransactions}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total Amount:</span>
            <span className="font-mono font-semibold text-green-600" data-testid="text-total-amount">
              {totalReconciled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-4">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : reconciledBatches.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground" data-testid="text-no-records">
              No reconciled records found.
            </div>
          ) : (
            <div className="space-y-4 pr-4">
              {reconciledBatches.map((batch) => (
                <ReconciledBatchGroup key={batch.batchId} batch={batch} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
