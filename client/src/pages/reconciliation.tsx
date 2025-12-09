import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRightLeft, X, RefreshCw, Layers, Keyboard, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { generateMockData, BankTransaction, Remittance } from '../lib/mockData';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// --- Components ---

const AmountDisplay = ({ amount, type, dimmed }: { amount: number, type: 'bank' | 'remit', dimmed?: boolean }) => (
  <span className={cn(
    "font-mono font-medium tracking-tight transition-colors",
    dimmed ? "text-muted-foreground" : (type === 'bank' ? "text-bank" : "text-remit")
  )}>
    ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
  </span>
);

const TransactionRow = ({ 
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
      layoutId={`bank-${data.id}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isMatched ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0 }}
      onClick={!isMatched ? onClick : undefined}
      className={cn(
        "group relative flex items-center justify-between p-3 mb-2 rounded-md border transition-all duration-200 select-none",
        isMatched 
          ? "bg-muted/20 border-transparent cursor-default" 
          : "cursor-pointer hover:bg-muted/50 bg-card border-border/40 hover:border-border",
        isSelected && !isMatched && "bg-bank/10 border-bank shadow-[0_0_15px_-3px_var(--color-bank)] z-10 translate-x-2"
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {isMatched && <CheckCircle2 className="w-3 h-3 text-match" />}
          <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/50" : "text-muted-foreground")}>{data.date}</span>
          <Badge variant="outline" className={cn("text-[10px] h-4 px-1", isMatched ? "border-muted-foreground/20 text-muted-foreground/40" : "border-muted-foreground/30 text-muted-foreground")}>
            {data.reference}
          </Badge>
        </div>
        <span className={cn("text-sm font-medium transition-colors", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-primary")}>
          {data.payee}
        </span>
      </div>
      <div className="text-right">
        <AmountDisplay amount={data.amount} type="bank" dimmed={isMatched} />
      </div>
      
      {isSelected && !isMatched && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-bank rounded-l-full shadow-[0_0_10px_var(--color-bank)]" />
      )}
    </motion.div>
  );
};

const RemittanceRow = ({ 
  data, 
  isSelected, 
  onClick,
  isMultiMatchTarget,
  matchCount
}: { 
  data: Remittance, 
  isSelected: boolean, 
  onClick: () => void,
  isMultiMatchTarget: boolean,
  matchCount: number
}) => {
  const isMatched = data.status === 'matched';

  return (
    <motion.div
      layoutId={`remit-${data.id}`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ 
        opacity: isMatched ? 0.5 : 1, 
        x: 0, 
        scale: isMultiMatchTarget ? 1.02 : 1,
        minHeight: isMultiMatchTarget ? "80px" : "auto", // Expand height visually
        borderColor: isMultiMatchTarget ? "var(--color-match)" : undefined
      }}
      exit={{ opacity: 0, x: 50, height: 0, marginBottom: 0 }}
      onClick={!isMatched ? onClick : undefined}
      className={cn(
        "group relative flex items-center justify-between p-3 mb-2 rounded-md border transition-all duration-200 select-none",
        isMatched 
          ? "bg-muted/20 border-transparent cursor-default" 
          : "cursor-pointer hover:bg-muted/50 bg-card border-border/40 hover:border-border",
        isSelected && !isMatched && "bg-remit/10 border-remit shadow-[0_0_15px_-3px_var(--color-remit)] z-10 -translate-x-2",
        isMultiMatchTarget && "bg-match/5 border-match shadow-[0_0_20px_-5px_var(--color-match)]"
      )}
    >
      {isSelected && !isMatched && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-remit rounded-r-full shadow-[0_0_10px_var(--color-remit)]" />
      )}

      <div className="flex flex-col gap-1 w-full">
        {/* Top Line: Date | Reference | Order Number */}
        <div className="flex items-center gap-2">
           {isMatched && <CheckCircle2 className="w-3 h-3 text-match" />}
           <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/50" : "text-muted-foreground")}>{data.date}</span>
           <Badge variant="outline" className={cn("text-[10px] h-4 px-1", isMatched ? "border-muted-foreground/20 text-muted-foreground/40" : "border-muted-foreground/30 text-muted-foreground")}>
             {data.reference}
           </Badge>
           <span className={cn("text-[10px] font-mono", isMatched ? "text-muted-foreground/40" : "text-muted-foreground/70")}>{data.orderNumber}</span>
        </div>

        {/* Bottom Line: Name & Amount */}
        <div className="flex items-center justify-between w-full">
           <span className={cn("text-sm font-medium transition-colors", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-secondary")}>
             {data.client}
           </span>
           <AmountDisplay amount={data.amount} type="remit" dimmed={isMatched} />
        </div>

        {/* Visual Expansion for Many-to-One */}
        {isMultiMatchTarget && (
          <motion.div 
             initial={{ opacity: 0, height: 0 }}
             animate={{ opacity: 1, height: 'auto' }}
             className="mt-2 pt-2 border-t border-match/20 w-full"
          >
             <div className="flex items-center gap-2 text-xs text-match font-medium">
               <Layers className="w-3 h-3" />
               <span>Grouping {matchCount} bank transactions</span>
             </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// --- Main Page ---

export default function ReconciliationPage() {
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [selectedRemitIds, setSelectedRemitIds] = useState<Set<string>>(new Set());
  
  const [bankFilter, setBankFilter] = useState('');
  const [remitFilter, setRemitFilter] = useState('');
  
  const [showMatched, setShowMatched] = useState(false);

  // Initial Data Load
  useEffect(() => {
    const { bankTransactions: b, remittances: r } = generateMockData();
    setBankTransactions(b);
    setRemittances(r);
  }, []);

  // Filtering
  const filteredBank = useMemo(() => 
    bankTransactions.filter(t => 
      (showMatched || t.status === 'unmatched') && 
      (t.payee.toLowerCase().includes(bankFilter.toLowerCase()) || 
       t.amount.toString().includes(bankFilter) ||
       t.reference.includes(bankFilter))
    ).sort((a, b) => {
       // Always put unmatched first
       if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1;
       return 0; 
    }), [bankTransactions, bankFilter, showMatched]
  );

  const filteredRemit = useMemo(() => 
    remittances.filter(r => 
      (showMatched || r.status === 'unmatched') &&
      (r.client.toLowerCase().includes(remitFilter.toLowerCase()) || 
       r.amount.toString().includes(remitFilter) ||
       r.reference.toLowerCase().includes(remitFilter.toLowerCase()))
    ).sort((a, b) => {
       // Always put unmatched first
       if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1;
       return 0;
    }), [remittances, remitFilter, showMatched]
  );


  // Selection Handling
  const toggleBankSelection = (id: string) => {
    const next = new Set(selectedBankIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBankIds(next);
  };

  const toggleRemitSelection = (id: string) => {
    // Single select for Remittance (Many-to-One model)
    if (selectedRemitIds.has(id)) {
      setSelectedRemitIds(new Set());
    } else {
      setSelectedRemitIds(new Set([id]));
    }
  };

  // Matching Logic
  const handleMatch = useCallback(() => {
    if (selectedBankIds.size === 0 || selectedRemitIds.size === 0) return;

    // Mark items as matched
    setBankTransactions(prev => prev.map(t => 
      selectedBankIds.has(t.id) ? { ...t, status: 'matched' } : t
    ));
    setRemittances(prev => prev.map(r => 
      selectedRemitIds.has(r.id) ? { ...r, status: 'matched' } : r
    ));

    // Clear selection
    setSelectedBankIds(new Set());
    setSelectedRemitIds(new Set());
  }, [selectedBankIds, selectedRemitIds]);

  // Keyboard Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey) {
        handleMatch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMatch]);

  // Computed Totals for Selection
  const selectedBankTotal = useMemo(() => {
    return bankTransactions
      .filter(t => selectedBankIds.has(t.id))
      .reduce((sum, t) => sum + t.amount, 0);
  }, [bankTransactions, selectedBankIds]);

  const selectedRemitTotal = useMemo(() => {
    return remittances
      .filter(r => selectedRemitIds.has(r.id))
      .reduce((sum, r) => sum + r.amount, 0);
  }, [remittances, selectedRemitIds]);

  const difference = selectedBankTotal - selectedRemitTotal;
  const isMatchable = selectedBankIds.size > 0 && selectedRemitIds.size > 0;
  const isPerfectMatch = Math.abs(difference) < 0.01;

  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col overflow-hidden font-sans">
      
      {/* Header / Stats Bar */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reconciliation Cockpit</h1>
            <div className="text-xs text-muted-foreground flex gap-3">
              <span>Unmatched Bank: <span className="text-foreground font-mono">{filteredBank.length}</span></span>
              <span>Unmatched Remit: <span className="text-foreground font-mono">{filteredRemit.length}</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
             {/* Show Matched Toggle */}
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

             {/* Match Action Center - Only visible when selections exist */}
             <AnimatePresence>
              {(selectedBankIds.size > 0 || selectedRemitIds.size > 0) && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex items-center gap-3 bg-muted/40 px-4 py-2 rounded-full border border-border/50"
                >
                  <div className="flex flex-col items-end mr-2">
                     <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Difference</span>
                     <span className={cn("text-sm font-mono font-bold", 
                       Math.abs(difference) < 0.01 ? "text-match" : "text-destructive"
                     )}>
                       {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                     </span>
                  </div>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="sm" 
                          onClick={handleMatch}
                          disabled={!isMatchable}
                          className={cn(
                            "font-semibold transition-all",
                            isPerfectMatch 
                              ? "bg-match text-black hover:bg-match/90 hover:scale-105 shadow-[0_0_20px_-5px_var(--color-match)]" 
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          Match {selectedBankIds.size} to {selectedRemitIds.size}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Press <kbd className="bg-muted px-1 rounded text-[10px] font-mono mx-1">M</kbd> to match
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => {
                    setSelectedBankIds(new Set());
                    setSelectedRemitIds(new Set());
                  }}>
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
             </AnimatePresence>

             <Button variant="outline" size="sm" className="gap-2" onClick={() => window.location.reload()}>
                <RefreshCw className="w-3 h-3" />
                Reset
             </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Panel: Bank Transactions */}
        <div className="flex-1 flex flex-col border-r border-border/40 min-w-[400px]">
          {/* Panel Header */}
          <div className="h-12 border-b border-border/40 flex items-center px-4 gap-2 bg-background/50">
             <div className="w-2 h-2 rounded-full bg-bank shadow-[0_0_8px_var(--color-bank)]" />
             <span className="text-sm font-semibold text-bank uppercase tracking-wider">Bank Transactions</span>
             <div className="ml-auto relative w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input 
                  className="h-7 text-xs pl-7 bg-muted/30 border-transparent focus:bg-background" 
                  placeholder="Filter transactions..." 
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                />
             </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-background/50 scroll-smooth">
             <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {filteredBank.map((t) => (
                    <TransactionRow 
                      key={t.id} 
                      data={t} 
                      isSelected={selectedBankIds.has(t.id)}
                      onClick={() => toggleBankSelection(t.id)}
                    />
                  ))}
                  {filteredBank.length === 0 && (
                     <div className="text-center py-20 text-muted-foreground text-sm">No unmatched bank transactions found.</div>
                  )}
                </AnimatePresence>
             </div>
          </div>
          
          {/* Panel Footer / Summary */}
          <div className="h-10 border-t border-border/40 flex items-center px-4 justify-between bg-muted/10 text-xs text-muted-foreground">
             <span>{filteredBank.length} items</span>
             <span className="font-mono">Total: ${filteredBank.reduce((acc, t) => acc + t.amount, 0).toLocaleString()}</span>
          </div>
        </div>


        {/* Center Divider / Action Zone (Visual Only) */}
        <div className="w-[1px] bg-border relative z-10 hidden md:block">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shadow-lg">
             <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
           </div>
        </div>


        {/* Right Panel: Remittances */}
        <div className="flex-1 flex flex-col min-w-[400px]">
          {/* Panel Header */}
          <div className="h-12 border-b border-border/40 flex items-center px-4 gap-2 bg-background/50">
             <div className="w-2 h-2 rounded-full bg-remit shadow-[0_0_8px_var(--color-remit)]" />
             <span className="text-sm font-semibold text-remit uppercase tracking-wider">Remittances</span>
             <div className="ml-auto relative w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input 
                  className="h-7 text-xs pl-7 bg-muted/30 border-transparent focus:bg-background" 
                  placeholder="Filter remittances..." 
                  value={remitFilter}
                  onChange={(e) => setRemitFilter(e.target.value)}
                />
             </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-background/50 scroll-smooth">
             <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {filteredRemit.map((r) => (
                    <RemittanceRow 
                      key={r.id} 
                      data={r} 
                      isSelected={selectedRemitIds.has(r.id)}
                      onClick={() => toggleRemitSelection(r.id)}
                      isMultiMatchTarget={selectedRemitIds.has(r.id) && selectedBankIds.size > 1}
                      matchCount={selectedBankIds.size}
                    />
                  ))}
                   {filteredRemit.length === 0 && (
                     <div className="text-center py-20 text-muted-foreground text-sm">No unmatched remittances found.</div>
                  )}
                </AnimatePresence>
             </div>
          </div>

          {/* Panel Footer / Summary */}
           <div className="h-10 border-t border-border/40 flex items-center px-4 justify-between bg-muted/10 text-xs text-muted-foreground">
             <span>{filteredRemit.length} items</span>
             <span className="font-mono">Total: ${filteredRemit.reduce((acc, r) => acc + r.amount, 0).toLocaleString()}</span>
          </div>
        </div>

      </div>
      
      {/* Footer / Shortcuts Help */}
      <div className="h-6 border-t bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground gap-4">
        <span className="flex items-center gap-1"><Keyboard className="w-3 h-3" /> Shortcuts:</span>
        <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded font-mono">Click</kbd> Select</span>
        <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded font-mono">M</kbd> Match Selected</span>
      </div>
    </div>
  );
}
