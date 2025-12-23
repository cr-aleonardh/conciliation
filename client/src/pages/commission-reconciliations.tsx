import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRightLeft, X, RefreshCw, Eye, EyeOff, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Check, DollarSign, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface BankTransaction {
  id: string;
  date: string;
  payee: string;
  reference: string;
  amount: number;
  status: 'unmatched' | 'matched' | 'suggested';
  reconciliationStatus?: string;
  orderId?: number;
}

interface Order {
  id: string;
  date: string;
  reference: string;
  customerName: string;
  orderNumber: string;
  amount: number;
  status: 'unmatched' | 'matched' | 'suggested';
  reconciliationStatus?: string;
  matchedBankIds?: string[];
}

type BankSortField = 'date' | 'payee' | 'amount';
type OrderSortField = 'date' | 'client' | 'amount' | 'orderNumber';
type SortOrder = 'asc' | 'desc';

const ROW_HEIGHT = 64;

const AmountDisplay = ({ amount, type, dimmed = false }: { amount: number, type: 'bank' | 'order', dimmed?: boolean }) => (
  <span className={cn(
    "text-base font-mono font-bold tabular-nums",
    dimmed ? "text-muted-foreground/50" : type === 'bank' ? "text-cyan-400" : "text-emerald-400"
  )}>
    {amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  </span>
);

const SortButton = ({ 
  label, 
  active, 
  direction, 
  onClick 
}: { 
  label: string, 
  active: boolean, 
  direction: SortOrder, 
  onClick: () => void 
}) => (
  <Button 
    variant="ghost" 
    size="sm" 
    onClick={onClick}
    className={cn(
      "h-6 px-2 text-[10px] uppercase font-semibold tracking-wider gap-1",
      active ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
    )}
  >
    {label}
    {active ? (
      direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
    ) : (
      <ArrowUpDown className="w-3 h-3 opacity-30" />
    )}
  </Button>
);

const ClickToCopy = ({ text, className, children }: { text: string; className?: string; children: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span 
          onClick={handleCopy}
          className={cn("cursor-pointer hover:bg-muted/50 px-1 -mx-1 rounded transition-colors", className)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {copied ? "Copied!" : "Click to copy"}
      </TooltipContent>
    </Tooltip>
  );
};

const BankTransactionRow = ({ 
  data, 
  isSelected, 
  onClick 
}: { 
  data: BankTransaction, 
  isSelected: boolean,
  onClick: () => void 
}) => {
  const isMatched = data.status === 'matched';
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isMatched ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      onClick={!isMatched ? onClick : undefined}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all mb-2",
        isMatched 
          ? "border-muted/30 bg-muted/10 cursor-default" 
          : "border-border/50 bg-card hover:bg-card/80 hover:border-cyan-500/30",
        isSelected && !isMatched && "bg-cyan-500/10 border-cyan-500 shadow-[0_0_15px_-3px_var(--color-cyan-500)] z-10 translate-x-2"
      )}
      style={{ height: ROW_HEIGHT }}
      data-testid={`row-bank-${data.id}`}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isMatched && <CheckCircle2 className="w-3 h-3 text-green-500" />}
          <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/50" : "text-muted-foreground")}>{data.date}</span>
          <Badge variant="secondary" className={cn(
            "text-xs h-5 px-1.5 font-mono font-bold",
            isMatched ? "bg-muted/30 text-muted-foreground/50" : "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
          )}>
            {data.reference || '-'}
          </Badge>
        </div>
        <ClickToCopy text={data.payee}>
          <span className={cn("text-base font-medium transition-colors truncate", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-primary")}>
            {data.payee}
          </span>
        </ClickToCopy>
      </div>
      <div className="text-right pl-4 shrink-0">
        <AmountDisplay amount={data.amount} type="bank" dimmed={isMatched} />
      </div>
    </motion.div>
  );
};

const OrderRow = ({ 
  data, 
  isSelected, 
  onClick 
}: { 
  data: Order, 
  isSelected: boolean,
  onClick: () => void 
}) => {
  const isMatched = data.status === 'matched';
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: isMatched ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      onClick={!isMatched ? onClick : undefined}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all mb-2",
        isMatched 
          ? "border-muted/30 bg-muted/10 cursor-default" 
          : "border-border/50 bg-card hover:bg-card/80 hover:border-emerald-500/30",
        isSelected && !isMatched && "bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_-3px_var(--color-emerald-500)] z-10 -translate-x-2"
      )}
      style={{ height: ROW_HEIGHT }}
      data-testid={`row-order-${data.id}`}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isMatched && <CheckCircle2 className="w-3 h-3 text-green-500" />}
          <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/50" : "text-muted-foreground")}>{data.date}</span>
          <Badge variant="secondary" className={cn(
            "text-xs h-5 px-1.5 font-mono font-bold",
            isMatched ? "bg-muted/30 text-muted-foreground/50" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          )}>
            {data.reference || '-'}
          </Badge>
          <span className="text-xs font-mono text-muted-foreground/40">#{data.orderNumber}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
            {data.reconciliationStatus || 'unknown'}
          </Badge>
        </div>
        <ClickToCopy text={data.customerName}>
          <span className={cn("text-base font-medium transition-colors truncate", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-primary")}>
            {data.customerName}
          </span>
        </ClickToCopy>
      </div>
      <div className="text-right pl-4 shrink-0">
        <AmountDisplay amount={data.amount} type="order" dimmed={isMatched} />
      </div>
    </motion.div>
  );
};

export default function CommissionReconciliationsPage() {
  const { toast } = useToast();
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  
  const [bankFilter, setBankFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');
  
  const [showMatched, setShowMatched] = useState(false);
  
  const [bankSort, setBankSort] = useState<{ field: BankSortField, order: SortOrder }>({ field: 'date', order: 'desc' });
  const [orderSort, setOrderSort] = useState<{ field: OrderSortField, order: SortOrder }>({ field: 'date', order: 'desc' });

  const [isReconciling, setIsReconciling] = useState(false);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/commission-data');
      if (response.ok) {
        const data = await response.json();
        
        const transformedBank: BankTransaction[] = data.transactions.map((t: any) => ({
          id: t.transactionHash,
          date: t.transactionDate?.split(' ')[0] || '',
          payee: t.payerSender || '',
          reference: t.extractedReference || '',
          amount: parseFloat(t.creditAmount) || 0,
          status: t.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                 t.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
          reconciliationStatus: t.reconciliationStatus,
          orderId: t.orderId || undefined
        }));
        
        const transformedOrders: Order[] = data.orders.map((o: any) => ({
          id: String(o.orderId),
          date: o.orderDate?.split(' ')[0] || '',
          customerName: o.customerName || '',
          reference: o.orderBankReference || '',
          orderNumber: String(o.orderId),
          amount: parseFloat(o.amountTotalFee) || 0,
          status: o.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                 o.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
          reconciliationStatus: o.reconciliationStatus,
          matchedBankIds: o.transactionIds || undefined
        }));
        
        setBankTransactions(transformedBank);
        setOrders(transformedOrders);
      }
    } catch (error) {
      console.error('Failed to fetch commission data:', error);
      toast({
        title: "Error",
        description: "Failed to load commission data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBankSort = (field: BankSortField) => {
    setBankSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleOrderSort = (field: OrderSortField) => {
    setOrderSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggleBankSelection = (id: string) => {
    setSelectedBankIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredBankTransactions = useMemo(() => {
    let result = bankTransactions.filter(t => {
      if (!showMatched && t.status === 'matched') return false;
      if (bankFilter) {
        const search = bankFilter.toLowerCase();
        return t.payee.toLowerCase().includes(search) || 
               t.reference.toLowerCase().includes(search) ||
               t.amount.toString().includes(search);
      }
      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (bankSort.field) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'payee':
          comparison = a.payee.localeCompare(b.payee);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
      }
      return bankSort.order === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [bankTransactions, bankFilter, showMatched, bankSort]);

  const filteredOrders = useMemo(() => {
    let result = orders.filter(o => {
      if (!showMatched && o.status === 'matched') return false;
      if (orderFilter) {
        const search = orderFilter.toLowerCase();
        return o.customerName.toLowerCase().includes(search) || 
               o.reference.toLowerCase().includes(search) ||
               o.orderNumber.includes(search) ||
               o.amount.toString().includes(search);
      }
      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (orderSort.field) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'client':
          comparison = a.customerName.localeCompare(b.customerName);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'orderNumber':
          comparison = parseInt(a.orderNumber) - parseInt(b.orderNumber);
          break;
      }
      return orderSort.order === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [orders, orderFilter, showMatched, orderSort]);

  const selectedBankTotal = useMemo(() => {
    return bankTransactions
      .filter(t => selectedBankIds.has(t.id))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [bankTransactions, selectedBankIds]);

  const selectedOrderTotal = useMemo(() => {
    return orders
      .filter(o => selectedOrderIds.has(o.id))
      .reduce((sum, o) => sum + o.amount, 0);
  }, [orders, selectedOrderIds]);

  const difference = selectedBankTotal - selectedOrderTotal;
  const isMatchable = selectedBankIds.size > 0 && selectedOrderIds.size > 0;
  const isPerfectMatch = isMatchable && Math.abs(difference) < 0.01;

  const handleMatch = async () => {
    if (!isMatchable) return;

    try {
      const bankIds = Array.from(selectedBankIds);
      const orderIdsList = Array.from(selectedOrderIds).map(id => parseInt(id));

      const response = await fetch('/api/reconcile-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matches: orderIdsList.map(orderId => ({
            orderId,
            transactionHashes: bankIds
          }))
        })
      });

      if (response.ok) {
        toast({
          title: "Commission matched",
          description: `Matched ${bankIds.length} transaction(s) to ${orderIdsList.length} order(s)`
        });
        setSelectedBankIds(new Set());
        setSelectedOrderIds(new Set());
        fetchData();
      } else {
        throw new Error('Failed to match');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to match commission",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading commission data...</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-cockpit">
                <ArrowLeft className="w-4 h-4" />
                Back to Cockpit
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Commission Reconciliations</h1>
                <p className="text-xs text-muted-foreground">Match commission transactions (3.50 - 4.50)</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 text-xs gap-2"
              onClick={fetchData}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              REFRESH
            </Button>

            <div className="flex items-center gap-2 border-r border-border/50 pr-4 mr-2">
              <Switch 
                id="show-matched" 
                checked={showMatched} 
                onCheckedChange={setShowMatched}
                className="data-[state=checked]:bg-primary"
              />
              <Label htmlFor="show-matched" className="text-xs font-medium cursor-pointer text-muted-foreground flex items-center gap-1.5">
                {showMatched ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                Matched
              </Label>
            </div>

            <AnimatePresence>
              {(selectedBankIds.size > 0 || selectedOrderIds.size > 0) && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex items-center gap-3 bg-muted/40 px-4 py-2 rounded-full border border-border/50"
                >
                  <div className="flex flex-col items-end mr-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Difference</span>
                    <span className={cn("text-sm font-mono font-bold", 
                      Math.abs(difference) < 0.01 ? "text-green-500" : "text-destructive"
                    )}>
                      {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                    </span>
                  </div>
                  
                  <Button 
                    size="sm" 
                    onClick={handleMatch}
                    disabled={!isMatchable}
                    className={cn(
                      "font-semibold transition-all",
                      isPerfectMatch 
                        ? "bg-green-500 text-black hover:bg-green-400 hover:scale-105 shadow-[0_0_20px_-5px_var(--color-green-500)]" 
                        : "bg-muted text-muted-foreground"
                    )}
                    data-testid="button-match"
                  >
                    Match {selectedBankIds.size} to {selectedOrderIds.size}
                  </Button>
                  
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => {
                    setSelectedBankIds(new Set());
                    setSelectedOrderIds(new Set());
                  }}>
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-cyan-400">Commission Transactions</h2>
                  <Badge variant="secondary" className="text-xs">{filteredBankTransactions.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <SortButton label="Date" active={bankSort.field === 'date'} direction={bankSort.order} onClick={() => handleBankSort('date')} />
                  <SortButton label="Name" active={bankSort.field === 'payee'} direction={bankSort.order} onClick={() => handleBankSort('payee')} />
                  <SortButton label="Amount" active={bankSort.field === 'amount'} direction={bankSort.order} onClick={() => handleBankSort('amount')} />
                </div>
              </div>
              
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  className="pl-10 h-9"
                  data-testid="input-bank-filter"
                />
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                <AnimatePresence>
                  {filteredBankTransactions.map(t => (
                    <BankTransactionRow
                      key={t.id}
                      data={t}
                      isSelected={selectedBankIds.has(t.id)}
                      onClick={() => toggleBankSelection(t.id)}
                    />
                  ))}
                </AnimatePresence>
                {filteredBankTransactions.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No commission transactions found
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-emerald-400">All Orders</h2>
                  <Badge variant="secondary" className="text-xs">{filteredOrders.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <SortButton label="Date" active={orderSort.field === 'date'} direction={orderSort.order} onClick={() => handleOrderSort('date')} />
                  <SortButton label="Name" active={orderSort.field === 'client'} direction={orderSort.order} onClick={() => handleOrderSort('client')} />
                  <SortButton label="Amount" active={orderSort.field === 'amount'} direction={orderSort.order} onClick={() => handleOrderSort('amount')} />
                  <SortButton label="Order" active={orderSort.field === 'orderNumber'} direction={orderSort.order} onClick={() => handleOrderSort('orderNumber')} />
                </div>
              </div>
              
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                  className="pl-10 h-9"
                  data-testid="input-order-filter"
                />
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                <AnimatePresence>
                  {filteredOrders.map(o => (
                    <OrderRow
                      key={o.id}
                      data={o}
                      isSelected={selectedOrderIds.has(o.id)}
                      onClick={() => toggleOrderSelection(o.id)}
                    />
                  ))}
                </AnimatePresence>
                {filteredOrders.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No orders found
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
