import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRightLeft, X, RefreshCw, Layers, Keyboard, Eye, EyeOff, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Check, ThumbsUp, ThumbsDown, XCircle, History, GripHorizontal, Unlink, Upload, DownloadCloud, ChevronDown, ChevronRight, CalendarIcon, List } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export interface BankTransaction {
  id: string;
  date: string;
  payee: string;
  reference: string;
  amount: number;
  status: 'unmatched' | 'matched' | 'suggested';
  reconciliationStatus?: string;
  orderId?: number;
}

export interface Remittance {
  id: string;
  date: string;
  reference: string;
  customerName: string;
  orderNumber: string;
  amount: number;
  status: 'unmatched' | 'matched' | 'suggested';
  reconciliationStatus?: string;
  matchedBankIds?: string[];
  suggestedMatchId?: string;
  remitecStatus?: string;
}
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- Types ---

type BankSortField = 'date' | 'reference' | 'payee' | 'amount';
type RemitSortField = 'date' | 'reference' | 'client' | 'amount' | 'orderNumber';
type SortOrder = 'asc' | 'desc';

// --- Helpers ---

const calculateMatchStats = (bank: BankTransaction, remit: Remittance) => {
  // R: Reference match indicator (Y/N)
  // Must have non-empty references on both sides to be a match
  const bankRef = bank.reference?.trim().toLowerCase() || '';
  const remitRef = remit.reference?.trim().toLowerCase() || '';
  const isReferenceMatch = bankRef !== '' && remitRef !== '' && (
    bankRef === remitRef || 
    bankRef.includes(remitRef) || 
    remitRef.includes(bankRef)
  );
  const rValue = isReferenceMatch ? 'Y' : 'N';

  // N: Name similarity score (0-100%)
  // Simple Jaccard similarity implementation for demo
  const s1 = bank.payee.toLowerCase();
  const s2 = remit.customerName.toLowerCase();
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
  const union = new Set([...Array.from(set1), ...Array.from(set2)]);
  const similarity = union.size === 0 ? 0 : intersection.size / union.size;
  const nValue = `${Math.round(similarity * 100)}%`;

  // D: Date difference
  const d1 = new Date(bank.date);
  const d2 = new Date(remit.date);
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  // Format to 2 digits with sign
  const dValue = diffDays >= 0 
    ? `+${diffDays.toString().padStart(2, '0')}` 
    : `-${Math.abs(diffDays).toString().padStart(2, '0')}`;

  // A: Amount difference
  const diffAmount = bank.amount - remit.amount;
  const aValue = diffAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  return { rValue, nValue, dValue, aValue: diffAmount > 0 ? `+${aValue}` : aValue };
};

const MatchStatsDisplay = ({ stats }: { stats: { rValue: string, nValue: string, dValue: string, aValue: string } }) => (
  <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground/80 mt-1 select-text">
    <span title="Reference Match"><strong className="text-foreground/70">R:</strong>{stats.rValue}</span>
    <span title="Name Similarity"><strong className="text-foreground/70">N:</strong>{stats.nValue}</span>
    <span title="Date Difference"><strong className="text-foreground/70">D:</strong>{stats.dValue}</span>
    <span title="Amount Difference"><strong className="text-foreground/70">A:</strong>{stats.aValue}</span>
  </div>
);

// Click to copy component for names
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

// --- Components ---

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

// --- Components ---

const SuggestedMatchRow = ({ 
  remittance, 
  bankTransaction,
  onApprove,
  onReject
}: { 
  remittance: Remittance, 
  bankTransaction: BankTransaction,
  onApprove: () => void,
  onReject: () => void
}) => {
  const stats = calculateMatchStats(bankTransaction, remittance);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="flex items-stretch border border-amber-500/30 bg-amber-500/5 rounded-lg mb-2 overflow-hidden relative group"
    >
      {/* Central Connector Line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-amber-500/20 -translate-x-1/2 z-0">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-amber-500/50 flex items-center justify-center z-10 shadow-sm">
            <Sparkles className="w-3 h-3 text-amber-500" />
         </div>
      </div>

      {/* Left: Bank Transaction */}
      <div className="flex-1 p-3 pr-8 flex items-center justify-between">
         <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
               <span className="text-xs font-mono text-muted-foreground">{bankTransaction.date}</span>
               <Badge variant="secondary" className="text-xs h-5 px-1.5 font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                 {bankTransaction.reference}
               </Badge>
               <MatchStatsDisplay stats={stats} />
            </div>
            <ClickToCopy text={bankTransaction.payee}><span className="text-sm font-medium opacity-90">{bankTransaction.payee}</span></ClickToCopy>
         </div>
         <AmountDisplay amount={bankTransaction.amount} type="bank" />
      </div>

      {/* Right: Remittance */}
      <div className="flex-1 p-3 pl-8 flex items-center justify-between">
         <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
               <span className="text-xs font-mono text-muted-foreground">{remittance.date}</span>
               <Badge variant="secondary" className="text-xs h-5 px-1.5 font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                 {remittance.reference}
               </Badge>
               <span className="text-xs font-mono text-muted-foreground/40">{remittance.orderNumber}</span>
               <MatchStatsDisplay stats={stats} />
            </div>
            <ClickToCopy text={remittance.customerName}><span className="text-sm font-medium opacity-90 whitespace-nowrap">{remittance.customerName}</span></ClickToCopy>
         </div>
         <AmountDisplay amount={remittance.amount} type="remit" />
      </div>

      {/* Actions Overlay (On Hover or Always Visible) */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm p-1 rounded-md shadow-sm border border-border/50">
         <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onReject}>
            <XCircle className="w-5 h-5" />
         </Button>
         <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-green-600 hover:text-green-600 hover:bg-green-500/10" onClick={onApprove}>
            <CheckCircle2 className="w-5 h-5" />
         </Button>
      </div>
    </motion.div>
  );
};

const MatchedGroupRow = ({ 
  remittance, 
  bankTransactions,
  index,
  onUnmatch
}: { 
  remittance: Remittance, 
  bankTransactions: BankTransaction[],
  index: number,
  onUnmatch: () => void
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <div className="flex border-b border-border/40 hover:bg-muted/20 transition-colors group relative">
      {/* Unmatch Action Overlay */}
      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
         {isConfirming ? (
            <div className="flex items-center gap-2 bg-background/95 backdrop-blur shadow-md rounded-md p-1.5 border border-border animate-in fade-in zoom-in-95 duration-200">
               <span className="text-[10px] font-semibold text-muted-foreground px-1 uppercase tracking-wider">Unmatch?</span>
               <Button 
                 size="sm" 
                 variant="destructive" 
                 className="h-6 px-2 text-[10px] font-bold" 
                 onClick={(e) => {
                   e.stopPropagation();
                   onUnmatch();
                   setIsConfirming(false);
                 }}
               >
                  Confirm
               </Button>
               <Button 
                 size="sm" 
                 variant="ghost" 
                 className="h-6 w-6 p-0 hover:bg-muted" 
                 onClick={(e) => {
                   e.stopPropagation();
                   setIsConfirming(false);
                 }}
               >
                  <X className="w-3 h-3" />
               </Button>
            </div>
         ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive bg-background/50 border border-transparent hover:border-border shadow-sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsConfirming(true);
                    }}
                  >
                      <Unlink className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">Unmatch items</TooltipContent>
              </Tooltip>
            </TooltipProvider>
         )}
      </div>

      {/* Left Side: Bank Transactions Stack */}
      <div className="flex-1 min-w-[400px] border-r border-border/40 p-2 space-y-2">
        {bankTransactions.map(t => {
           const stats = calculateMatchStats(t, remittance);
           return (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-transparent opacity-70 group-hover:opacity-100 transition-opacity h-[72px]">
               <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="w-3 h-3 text-match" />
                    <span className="text-xs font-mono text-muted-foreground">{t.date}</span>
                    <Badge variant="secondary" className="text-[11px] h-5 px-1.5 font-mono font-semibold bg-blue-50/50 text-blue-700/70 border-blue-200/50 dark:bg-blue-900/10 dark:text-blue-400/70 dark:border-blue-800/50">
                      {t.reference}
                    </Badge>
                    <MatchStatsDisplay stats={stats} />
                  </div>
                  <ClickToCopy text={t.payee}><span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/30">
                    {t.payee}
                  </span></ClickToCopy>
               </div>
               <AmountDisplay amount={t.amount} type="bank" dimmed />
            </div>
           );
        })}
      </div>

      {/* Right Side: Remittance */}
      <div className="flex-1 min-w-[400px] p-2">
        <div className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-transparent opacity-70 group-hover:opacity-100 transition-opacity h-full">
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-2 flex-wrap">
                 <CheckCircle2 className="w-3 h-3 text-match" />
                 <span className="text-xs font-mono text-muted-foreground">{remittance.date}</span>
                 <Badge variant="secondary" className="text-[11px] h-5 px-1.5 font-mono font-semibold bg-pink-50/50 text-pink-700/70 border-pink-200/50 dark:bg-pink-900/10 dark:text-pink-400/70 dark:border-pink-800/50">
                   {remittance.reference}
                 </Badge>
                 <span className="text-xs font-mono text-muted-foreground/40">{remittance.orderNumber}</span>
                 {/* For group view, showing stats on the remittance side is ambiguous if multiple banks match. 
                     We could average them or just show nothing on the Remittance side since the Bank side shows the details. 
                     However, request says "On both bank transactions and remittance records".
                     If 1-to-1 match, easy. If 1-to-many, we can compare Remit to the "Sum of Banks" or each bank?
                     Let's show stats against the FIRST bank transaction for simplicity in this mockup or the grouped total if we had logic for it.
                     Let's iterate and show stats against the first one for now as a representative. */}
                 {bankTransactions.length > 0 && <MatchStatsDisplay stats={calculateMatchStats(bankTransactions[0], remittance)} />}
              </div>
              <div className="max-w-full overflow-hidden">
                 <ClickToCopy text={remittance.customerName}><span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/30 whitespace-nowrap">
                   {remittance.customerName}
                 </span></ClickToCopy>
              </div>
              {bankTransactions.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-match font-medium mt-1">
                  <Layers className="w-3 h-3" />
                  <span>Matched {bankTransactions.length} items</span>
                </div>
              )}
            </div>
            <div className="text-right pl-4 shrink-0">
               <AmountDisplay amount={remittance.amount} type="remit" dimmed />
            </div>
        </div>
      </div>
    </div>
  );
};

const AmountDisplay = ({ amount, type, dimmed }: { amount: number, type: 'bank' | 'remit', dimmed?: boolean }) => (
  <span className={cn(
    "font-mono font-medium tracking-tight transition-colors",
    dimmed ? "text-muted-foreground" : (type === 'bank' ? "text-bank" : "text-remit")
  )}>
    {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
  </span>
);

const ROW_HEIGHT = 72; // Fixed height in px
const GAP = 8; // margin-bottom

const TransactionRow = ({ 
  data, 
  isSelected, 
  onClick,
  matchStats
}: { 
  data: BankTransaction, 
  isSelected: boolean, 
  onClick: () => void,
  matchStats?: { rValue: string, nValue: string, dValue: string, aValue: string }
}) => {
  const isMatched = data.status === 'matched';
  
  return (
    <motion.div
      layoutId={`bank-${data.id}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: isMatched ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0 }}
      onClick={!isMatched ? onClick : undefined}
      style={{ height: `${ROW_HEIGHT}px`, marginBottom: `${GAP}px` }}
      className={cn(
        "group relative flex items-center justify-between p-3 rounded-md border transition-all duration-200 select-none",
        isMatched 
          ? "bg-muted/20 border-transparent cursor-default" 
          : "cursor-pointer hover:bg-muted/50 bg-card border-border/40 hover:border-border",
        isSelected && !isMatched && "bg-bank/10 border-bank shadow-[0_0_15px_-3px_var(--color-bank)] z-10 translate-x-2"
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          {isMatched && <CheckCircle2 className="w-3 h-3 text-match" />}
          <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/50" : "text-muted-foreground")}>{data.date}</span>
          <Badge variant="secondary" className={cn("text-[11px] h-5 px-1.5 font-mono font-bold border", 
            isMatched 
              ? "bg-blue-50/50 text-blue-700/50 border-blue-200/50 dark:bg-blue-900/10 dark:text-blue-400/50 dark:border-blue-800/50" 
              : "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
          )}>
            {data.reference}
          </Badge>
          {matchStats && <MatchStatsDisplay stats={matchStats} />}
        </div>
        <ClickToCopy text={data.payee}><span className={cn("text-base font-medium transition-colors", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-primary")}>
          {data.payee}
        </span></ClickToCopy>
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
  matchCount,
  matchStats
}: { 
  data: Remittance, 
  isSelected: boolean, 
  onClick: () => void,
  isMultiMatchTarget: boolean,
  matchCount: number,
  matchStats?: { rValue: string, nValue: string, dValue: string, aValue: string }
}) => {
  const isMatched = data.status === 'matched';
  const matchedCount = data.matchedBankIds?.length || 1;
  const height = isMatched ? (matchedCount * ROW_HEIGHT) + ((matchedCount - 1) * GAP) : ROW_HEIGHT;

  return (
    <motion.div
      layoutId={`remit-${data.id}`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ 
        opacity: isMatched ? 0.5 : 1, 
        x: 0, 
        scale: isMultiMatchTarget ? 1.02 : 1,
        borderColor: isMultiMatchTarget ? "var(--color-match)" : undefined
      }}
      exit={{ opacity: 0, x: 50, height: 0, marginBottom: 0 }}
      onClick={!isMatched ? onClick : undefined}
      style={{ 
         height: isMultiMatchTarget ? 'auto' : `${height}px`,
         minHeight: isMultiMatchTarget ? '80px' : undefined,
         marginBottom: `${GAP}px`
      }}
      className={cn(
        "group relative flex items-center justify-between p-3 rounded-md border transition-all duration-200 select-none",
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

      <div className="flex flex-col gap-1">
        {/* Top Line: Date | Reference | Order Number */}
        <div className="flex items-center gap-2 flex-wrap">
           {isMatched && <CheckCircle2 className="w-3 h-3 text-match" />}
           <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/50" : "text-muted-foreground")}>{data.date}</span>
           <Badge variant="secondary" className={cn("text-[11px] h-5 px-1.5 font-mono font-bold border", 
             isMatched 
               ? "bg-pink-50/50 text-pink-700/50 border-pink-200/50 dark:bg-pink-900/10 dark:text-pink-400/50 dark:border-pink-800/50" 
               : "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800"
           )}>
             {data.reference}
           </Badge>
           <span className={cn("text-xs font-mono", isMatched ? "text-muted-foreground/40" : "text-muted-foreground/70")}>{data.orderNumber}</span>
           {data.remitecStatus && (
             <Badge variant="outline" className={cn("text-[10px] h-4 px-1 font-mono", 
               data.remitecStatus === 'C' ? "border-red-500 text-red-500" :
               data.remitecStatus === 'P' ? "border-green-500 text-green-500" :
               data.remitecStatus === 'H' ? "border-yellow-500 text-yellow-500" :
               "border-muted-foreground text-muted-foreground"
             )}>
               {data.remitecStatus}
             </Badge>
           )}
           {matchStats && <MatchStatsDisplay stats={matchStats} />}
        </div>

        {/* Bottom Line: Name */}
        <div className="max-w-full overflow-hidden">
           <ClickToCopy text={data.customerName}><span className={cn("text-base font-medium transition-colors whitespace-nowrap", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-secondary")}>
             {data.customerName}
           </span></ClickToCopy>
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

      {/* Amount Display - Vertically Centered */}
      <div className="text-right pl-4 shrink-0">
         <AmountDisplay amount={data.amount} type="remit" dimmed={isMatched} />
      </div>
    </motion.div>
  );
};

// --- Main Page ---

interface ReconciliationPageProps {
  isAdmin?: boolean;
}

export default function ReconciliationPage({ isAdmin = false }: ReconciliationPageProps) {
  const { toast } = useToast();
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [selectedRemitIds, setSelectedRemitIds] = useState<Set<string>>(new Set());
  
  const [bankFilter, setBankFilter] = useState('');
  const [remitFilter, setRemitFilter] = useState('');
  
  // Date range filters
  const [bankDateFrom, setBankDateFrom] = useState<Date | undefined>(undefined);
  const [bankDateTo, setBankDateTo] = useState<Date | undefined>(undefined);
  const [remitDateFrom, setRemitDateFrom] = useState<Date | undefined>(undefined);
  const [remitDateTo, setRemitDateTo] = useState<Date | undefined>(undefined);
  
  const [showMatched, setShowMatched] = useState(false);

  // Sorting State
  const [bankSort, setBankSort] = useState<{ field: BankSortField, order: SortOrder }>({ field: 'date', order: 'desc' });
  const [remitSort, setRemitSort] = useState<{ field: RemitSortField, order: SortOrder }>({ field: 'date', order: 'desc' });

  const [showSuggestions, setShowSuggestions] = useState(true);

  // Resize Logic
  const [suggestionsHeight, setSuggestionsHeight] = useState(350);
  const [isResizingSuggestions, setIsResizingSuggestions] = useState(false);

  // Fetch Data Button State
  const [fetchDataCooldown, setFetchDataCooldown] = useState<number | null>(null);

  // File Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Fetch Orders State
  const [isFetchingOrders, setIsFetchingOrders] = useState(false);
  const [isFetchingAllOrders, setIsFetchingAllOrders] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // Suggestions State
  const [isRunningSuggestions, setIsRunningSuggestions] = useState(false);

  // Reconcile State
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileStatus, setReconcileStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);

  // Amount Difference Warning State
  const [showAmountWarning, setShowAmountWarning] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<{ remitId: string; bankIds: string[]; difference: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // Fetch All Orders Modal State (Admin only)
  const [showFetchAllModal, setShowFetchAllModal] = useState(false);
  const [fetchAllStartDate, setFetchAllStartDate] = useState<Date | undefined>(undefined);
  const [fetchAllEndDate, setFetchAllEndDate] = useState<Date | undefined>(new Date());
  const [fetchAllStatus, setFetchAllStatus] = useState<"P" | "H" | "D">("P");
  const [cleanOldOrders, setCleanOldOrders] = useState(false);


  useEffect(() => {
    if (fetchDataCooldown === null) return;

    if (fetchDataCooldown <= 0) {
      setFetchDataCooldown(null);
      return;
    }

    const timer = setInterval(() => {
      setFetchDataCooldown(prev => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [fetchDataCooldown]);

  const handleFetchData = async () => {
    if (isFetchingOrders) return;
    
    setIsFetchingOrders(true);
    setFetchStatus(null);
    
    try {
      const response = await fetch('/api/fetch-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setFetchStatus({
          type: 'success',
          message: `${result.message}. Inserted: ${result.inserted}, Updated: ${result.updated}`
        });
        // Start cooldown after successful fetch
        setFetchDataCooldown(600);
        // Refresh orders after successful fetch
        const ordersResponse = await fetch('/api/orders');
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          const transformedRemittances: Remittance[] = orders.map((o: any) => ({
            id: String(o.orderId),
            date: o.orderDate?.split(' ')[0] || '',
            customerName: o.customerName || '',
            reference: o.orderBankReference || '',
            orderNumber: String(o.orderId),
            amount: parseFloat(o.amountTotalFee) || 0,
            status: o.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                   o.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
            reconciliationStatus: o.reconciliationStatus,
            matchedBankIds: o.transactionIds || undefined,
            remitecStatus: o.remitecStatus || undefined
          }));
          setRemittances(transformedRemittances);
        }
      } else {
        setFetchStatus({
          type: 'error',
          message: result.message || 'Failed to fetch orders'
        });
      }
    } catch (error) {
      setFetchStatus({
        type: 'error',
        message: 'Failed to fetch orders. Please try again.'
      });
    } finally {
      setIsFetchingOrders(false);
    }
  };

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFetchAllOrders = async (startDate?: Date, endDate?: Date, status?: "P" | "H" | "D", cleanOld?: boolean) => {
    if (isFetchingAllOrders) return;
    
    setIsFetchingAllOrders(true);
    setFetchStatus(null);
    setShowFetchAllModal(false);
    
    try {
      const body: { startDate?: string; endDate?: string; statusFilter?: string; cleanOldOrders?: boolean } = {};
      if (startDate) body.startDate = format(startDate, 'yyyy-MM-dd');
      if (endDate) body.endDate = format(endDate, 'yyyy-MM-dd');
      if (!cleanOld && status) body.statusFilter = status;
      if (cleanOld) body.cleanOldOrders = true;
      
      const response = await fetch('/api/fetch-orders-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: cleanOld ? "Orders cleaned" : "All orders fetched",
          description: `Inserted: ${result.inserted}, Updated: ${result.updated}`,
        });
        // Refresh orders after successful fetch
        const ordersResponse = await fetch('/api/orders');
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          const transformedRemittances: Remittance[] = orders.map((o: any) => ({
            id: String(o.orderId),
            date: o.orderDate?.split(' ')[0] || '',
            customerName: o.customerName || '',
            reference: o.orderBankReference || '',
            orderNumber: String(o.orderId),
            amount: parseFloat(o.amountTotalFee) || 0,
            status: o.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                   o.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
            reconciliationStatus: o.reconciliationStatus,
            matchedBankIds: o.transactionIds || undefined,
            remitecStatus: o.remitecStatus || undefined
          }));
          setRemittances(transformedRemittances);
        }
      } else {
        toast({
          title: "Error",
          description: result.message || 'Failed to fetch all orders',
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: 'Failed to fetch all orders. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsFetchingAllOrders(false);
    }
  };

  const handleRunSuggestions = async () => {
    if (isRunningSuggestions) return;
    
    setIsRunningSuggestions(true);
    
    try {
      const response = await fetch('/api/suggestions/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh both bank transactions and orders to show updated suggestions
        const [bankResponse, ordersResponse] = await Promise.all([
          fetch('/api/bank-transactions'),
          fetch('/api/orders')
        ]);
        
        if (bankResponse.ok) {
          const bankData = await bankResponse.json();
          const transformedBank: BankTransaction[] = bankData.map((t: any) => ({
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
          setBankTransactions(transformedBank);
        }
        
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          const transformedRemittances: Remittance[] = orders.map((o: any) => ({
            id: String(o.orderId),
            date: o.orderDate?.split(' ')[0] || '',
            customerName: o.customerName || '',
            reference: o.orderBankReference || '',
            orderNumber: String(o.orderId),
            amount: parseFloat(o.amountTotalFee) || 0,
            status: o.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                   o.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
            reconciliationStatus: o.reconciliationStatus,
            matchedBankIds: o.transactionIds || undefined,
            suggestedMatchId: o.transactionIds?.[0] || undefined,
            remitecStatus: o.remitecStatus || undefined
          }));
          setRemittances(transformedRemittances);
        }
        
        setShowSuggestions(true);
        
        const count = result.suggestionsCount || 0;
        if (count > 0) {
          toast({
            title: "Matches found",
            description: `Found ${count} potential match${count === 1 ? '' : 'es'}`,
          });
        } else {
          toast({
            title: "No matches found",
            description: "No potential matches were identified",
          });
        }
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to run matching",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to run suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to run matching. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRunningSuggestions(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload-bank-file', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setUploadStatus({
          type: 'success',
          message: result.message
        });
        // Refresh bank transactions after successful upload
        const txResponse = await fetch('/api/bank-transactions');
        if (txResponse.ok) {
          const transactions = await txResponse.json();
          // Transform API data to match frontend interface
          const transformedTransactions: BankTransaction[] = transactions.map((t: any) => ({
            id: t.transactionHash,
            date: t.transactionDate?.split(' ')[0] || '',
            payee: t.payerSender,
            reference: t.extractedReference || '',
            amount: parseFloat(t.creditAmount),
            status: t.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                   t.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
            reconciliationStatus: t.reconciliationStatus,
            orderId: t.orderId || undefined
          }));
          setBankTransactions(transformedTransactions);
        }
      } else {
        setUploadStatus({
          type: 'error',
          message: result.message
        });
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: 'Failed to upload file. Please try again.'
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadButtonClick = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (!isResizingSuggestions) return;

    const handleMouseMove = (e: MouseEvent) => {
        setSuggestionsHeight(prev => Math.max(150, Math.min(window.innerHeight * 0.8, prev + e.movementY)));
    };

    const handleMouseUp = () => {
        setIsResizingSuggestions(false);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    };
  }, [isResizingSuggestions]);

  // Initial Data Load - currently empty, will be connected to API later
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [bankResponse, ordersResponse] = await Promise.all([
          fetch('/api/bank-transactions'),
          fetch('/api/orders')
        ]);
        
        if (bankResponse.ok) {
          const bankData = await bankResponse.json();
          const transformedBank: BankTransaction[] = bankData.map((t: any) => ({
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
          setBankTransactions(transformedBank);
        }
        
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          const transformedRemittances: Remittance[] = orders.map((o: any) => ({
            id: String(o.orderId),
            date: o.orderDate?.split(' ')[0] || '',
            customerName: o.customerName || '',
            reference: o.orderBankReference || '',
            orderNumber: String(o.orderId),
            amount: parseFloat(o.amountTotalFee) || 0,
            status: o.reconciliationStatus === 'unmatched' ? 'unmatched' : 
                   o.reconciliationStatus === 'suggested_match' ? 'suggested' : 'matched',
            reconciliationStatus: o.reconciliationStatus,
            matchedBankIds: o.transactionIds || undefined,
            remitecStatus: o.remitecStatus || undefined
          }));
          setRemittances(transformedRemittances);
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };
    
    loadInitialData();
  }, []);

  // Filtering & Sorting
  const filteredBank = useMemo(() => 
    bankTransactions.filter(t => {
      // Status filter
      if (!showMatched && (t.status === 'matched' || t.status === 'suggested')) return false;
      
      // Text filter
      const matchesText = t.payee.toLowerCase().includes(bankFilter.toLowerCase()) || 
                          t.amount.toString().includes(bankFilter) ||
                          t.reference.includes(bankFilter);
      if (!matchesText) return false;
      
      // Date range filter
      if (bankDateFrom || bankDateTo) {
        const txDate = new Date(t.date);
        if (bankDateFrom && txDate < bankDateFrom) return false;
        if (bankDateTo) {
          const endOfDay = new Date(bankDateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (txDate > endOfDay) return false;
        }
      }
      
      return true;
    }).sort((a, b) => {
       // Always put unmatched first (but exclude suggested from this specific sort if they are hidden)
       if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1;
       
       // Sort Logic
       let comparison = 0;
       switch (bankSort.field) {
         case 'date': comparison = a.date.localeCompare(b.date); break;
         case 'amount': comparison = a.amount - b.amount; break;
         case 'payee': comparison = a.payee.localeCompare(b.payee); break;
         case 'reference': comparison = a.reference.localeCompare(b.reference); break;
       }
       return bankSort.order === 'asc' ? comparison : -comparison;
    }), [bankTransactions, bankFilter, showMatched, bankSort, bankDateFrom, bankDateTo]
  );

  const filteredRemit = useMemo(() => 
    remittances.filter(r => {
      // Status filter
      if (!showMatched && (r.status === 'matched' || r.status === 'suggested')) return false;
      
      // Text filter
      const matchesText = r.id.includes(remitFilter) ||
                          r.customerName.toLowerCase().includes(remitFilter.toLowerCase()) || 
                          r.amount.toString().includes(remitFilter) ||
                          r.reference.toLowerCase().includes(remitFilter.toLowerCase());
      if (!matchesText) return false;
      
      // Date range filter
      if (remitDateFrom || remitDateTo) {
        const orderDate = new Date(r.date);
        if (remitDateFrom && orderDate < remitDateFrom) return false;
        if (remitDateTo) {
          const endOfDay = new Date(remitDateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (orderDate > endOfDay) return false;
        }
      }
      
      return true;
    }).sort((a, b) => {
       // Always put unmatched first
       if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1;

       // Sort Logic
       let comparison = 0;
       switch (remitSort.field) {
         case 'date': comparison = a.date.localeCompare(b.date); break;
         case 'amount': comparison = a.amount - b.amount; break;
         case 'client': comparison = a.customerName.localeCompare(b.customerName); break;
         case 'reference': comparison = a.reference.localeCompare(b.reference); break;
         case 'orderNumber': comparison = a.orderNumber.localeCompare(b.orderNumber); break;
       }
       return remitSort.order === 'asc' ? comparison : -comparison;
    }), [remittances, remitFilter, showMatched, remitSort, remitDateFrom, remitDateTo]
  );

  // Suggestions Logic
  const suggestedMatches = useMemo(() => {
    const suggestions = remittances.filter(r => r.status === 'suggested');
    return suggestions.map(r => {
      const bankTx = bankTransactions.find(b => b.id === r.suggestedMatchId);
      return bankTx ? { remittance: r, bankTransaction: bankTx } : null;
    }).filter((pair): pair is { remittance: Remittance, bankTransaction: BankTransaction } => pair !== null);
  }, [remittances, bankTransactions]);

  const executeMatch = async (remitId: string, bankId: string, reasonToOverride?: string) => {
    try {
      await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionHash: bankId,
          orderId: parseInt(remitId),
          status: 'temporarily_matched',
          ...(reasonToOverride ? { reasonToOverride } : {})
        })
      });
      
      setBankTransactions(prev => prev.map(t => t.id === bankId ? { ...t, status: 'matched', reconciliationStatus: 'temporarily_matched' } : t));
      setRemittances(prev => prev.map(r => r.id === remitId ? { ...r, status: 'matched', reconciliationStatus: 'temporarily_matched', matchedBankIds: [bankId] } : r));
    } catch (error) {
      console.error('Failed to approve suggestion:', error);
    }
  };

  const handleApproveSuggestion = async (remitId: string, bankId: string) => {
    // Find the remittance and bank transaction to check amounts
    const remit = remittances.find(r => r.id === remitId);
    const bank = bankTransactions.find(b => b.id === bankId);
    
    if (remit && bank) {
      const difference = remit.amount - bank.amount;
      // Show warning if order amount exceeds bank amount by more than 1.00
      if (difference > 1.00) {
        setPendingMatch({ remitId, bankIds: [bankId], difference });
        setShowAmountWarning(true);
        return;
      }
    }
    
    await executeMatch(remitId, bankId);
  };

  const handleConfirmAmountWarning = async () => {
    if (pendingMatch) {
      // Execute match for each bank transaction with override reason
      for (const bankId of pendingMatch.bankIds) {
        await executeMatch(pendingMatch.remitId, bankId, overrideReason);
      }
      // Clear selection after manual match
      setSelectedBankIds(new Set());
      setSelectedRemitIds(new Set());
      setPendingMatch(null);
      setShowAmountWarning(false);
      setOverrideReason("");
    }
  };

  const handleCancelAmountWarning = () => {
    setPendingMatch(null);
    setShowAmountWarning(false);
    setOverrideReason("");
  };

  const handleRejectSuggestion = (remitId: string, bankId: string) => {
    setBankTransactions(prev => prev.map(t => t.id === bankId ? { ...t, status: 'unmatched' } : t));
    setRemittances(prev => prev.map(r => r.id === remitId ? { ...r, status: 'unmatched', suggestedMatchId: undefined } : r));
  };

  const handleApproveAllSuggestions = () => {
    suggestedMatches.forEach(({ remittance, bankTransaction }) => {
      handleApproveSuggestion(remittance.id, bankTransaction.id);
    });
  };

  // Unmatch Logic
  const handleUnmatch = async (remitId: string, bankIds: string[]) => {
    try {
      // Call API to unmatch each transaction
      for (const transactionHash of bankIds) {
        await fetch('/api/unmatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionHash })
        });
      }
      
      // Update bank transactions
      setBankTransactions(prev => prev.map(t => 
        bankIds.includes(t.id) ? { ...t, status: 'unmatched' } : t
      ));
      
      // Update remittance
      setRemittances(prev => prev.map(r => 
        r.id === remitId ? { ...r, status: 'unmatched', matchedBankIds: undefined } : r
      ));
    } catch (error) {
      console.error('Failed to unmatch:', error);
    }
  };

  // Reconcile Logic - finalize all temporarily matched items
  const handleReconcile = async () => {
    if (isReconciling) return;
    
    // Get only temporarily matched items (not already fully reconciled)
    const matchedRemits = remittances.filter(r => r.reconciliationStatus === 'temporarily_matched');
    if (matchedRemits.length === 0) return;
    
    // Build matches array for API
    const matches = matchedRemits.map(r => ({
      orderId: parseInt(r.id),
      transactionHashes: r.matchedBankIds || []
    }));
    
    setIsReconciling(true);
    setReconcileStatus(null);
    setShowReconcileConfirm(false);
    
    try {
      // First reconcile the batch
      const response = await fetch('/api/reconcile-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Now download the export file
        const orderIds = matchedRemits.map(r => parseInt(r.id));
        const exportResponse = await fetch('/api/export-reconciliation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds })
        });
        
        if (exportResponse.ok) {
          const blob = await exportResponse.blob();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `BankReconciliation-${timestamp}.xls`;
          
          // Trigger download
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
        
        setReconcileStatus({
          type: 'success',
          message: `Batch ${result.batchId} reconciled successfully with ${matches.length} groups`
        });
        
        // Remove reconciled items from local state (they're now finalized in DB)
        const reconciledRemitIds = new Set(matchedRemits.map(r => r.id));
        const reconciledBankIds = new Set(matchedRemits.flatMap(r => r.matchedBankIds || []));
        
        setBankTransactions(prev => prev.filter(t => !reconciledBankIds.has(t.id)));
        setRemittances(prev => prev.filter(r => !reconciledRemitIds.has(r.id)));
      } else {
        setReconcileStatus({
          type: 'error',
          message: result.message || 'Failed to reconcile'
        });
      }
    } catch (error) {
      setReconcileStatus({
        type: 'error',
        message: 'Failed to reconcile. Please try again.'
      });
    } finally {
      setIsReconciling(false);
    }
  };


  // Sorting Handlers
  const handleBankSort = (field: BankSortField) => {
    setBankSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleRemitSort = (field: RemitSortField) => {
    setRemitSort(prev => ({
      field,
      order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
    }));
  };



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
  const handleMatch = useCallback(async () => {
    if (selectedBankIds.size === 0 || selectedRemitIds.size === 0) return;

    const remitId = Array.from(selectedRemitIds)[0];
    const transactionHashes = Array.from(selectedBankIds);
    
    // Check if order amount exceeds total bank amount by more than 1.00
    const remit = remittances.find(r => r.id === remitId);
    const selectedBanks = bankTransactions.filter(b => selectedBankIds.has(b.id));
    const totalBankAmount = selectedBanks.reduce((sum, b) => sum + b.amount, 0);
    
    if (remit) {
      const difference = remit.amount - totalBankAmount;
      if (difference > 1.00) {
        setPendingMatch({ remitId, bankIds: transactionHashes, difference });
        setShowAmountWarning(true);
        return;
      }
    }
    
    try {
      // Call API to persist each match with 'temporarily_matched' status
      for (const transactionHash of transactionHashes) {
        await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionHash,
            orderId: parseInt(remitId),
            status: 'temporarily_matched'
          })
        });
      }
      
      // Update local state to reflect the match
      setBankTransactions(prev => prev.map(t => 
        selectedBankIds.has(t.id) ? { ...t, status: 'matched', reconciliationStatus: 'temporarily_matched' } : t
      ));
      setRemittances(prev => prev.map(r => 
        selectedRemitIds.has(r.id) ? { 
          ...r, 
          status: 'matched',
          reconciliationStatus: 'temporarily_matched',
          matchedBankIds: Array.from(selectedBankIds)
        } : r
      ));

      // Clear selection
      setSelectedBankIds(new Set());
      setSelectedRemitIds(new Set());
    } catch (error) {
      console.error('Failed to save match:', error);
    }
  }, [selectedBankIds, selectedRemitIds, remittances, bankTransactions]);

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

  // Group Matched Items - only show temporarily_matched, not fully reconciled
  const matchedGroups = useMemo(() => {
    if (!showMatched) return [];
    
    // 1. Find temporarily matched remittances (not fully reconciled)
    const matchedRemits = remittances.filter(r => r.reconciliationStatus === 'temporarily_matched');
    
    // 2. Map them to their bank transactions using both approaches for robustness:
    //    - Check if bank transaction is in remittance's matchedBankIds array
    //    - OR check if bank transaction's orderId matches the remittance id
    return matchedRemits.map(r => {
       const remitId = parseInt(r.id);
       const relatedBankTxns = bankTransactions.filter(b => 
         b.reconciliationStatus === 'temporarily_matched' && (
           r.matchedBankIds?.includes(b.id) || 
           b.orderId === remitId
         )
       );
       return { remittance: r, bankTransactions: relatedBankTxns };
    }).sort((a, b) => b.remittance.date.localeCompare(a.remittance.date)); // Sort by date desc
  }, [remittances, bankTransactions, showMatched]);

  // Counts for reconcile confirmation (independent of showMatched toggle) - only temporarily_matched
  const reconcileCounts = useMemo(() => {
    const matchedRemits = remittances.filter(r => r.reconciliationStatus === 'temporarily_matched');
    // Count transactions using both matchedBankIds and orderId for robustness
    let totalTransactions = 0;
    for (const r of matchedRemits) {
      const remitId = parseInt(r.id);
      const txCount = bankTransactions.filter(b => 
        b.reconciliationStatus === 'temporarily_matched' && (
          r.matchedBankIds?.includes(b.id) || 
          b.orderId === remitId
        )
      ).length;
      totalTransactions += txCount;
    }
    return { orders: matchedRemits.length, transactions: totalTransactions };
  }, [remittances, bankTransactions]);

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
              <span>Unmatched Orders: <span className="text-foreground font-mono">{filteredRemit.length}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 border-l pl-4 border-border/40">
             <input
               type="file"
               ref={fileInputRef}
               onChange={handleFileUpload}
               accept=".csv,.xls,.xlsx"
               className="hidden"
               data-testid="input-bank-file"
             />
             <Button 
               size="sm" 
               variant="outline" 
               className="h-8 text-xs gap-2"
               onClick={handleUploadButtonClick}
               disabled={isUploading}
               data-testid="button-upload-bank-file"
             >
                {isUploading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {isUploading ? 'IMPORTING...' : 'UPLOAD BANK FILE'}
             </Button>
             <Button 
                size="sm" 
                variant={fetchDataCooldown !== null || isFetchingOrders ? "secondary" : "outline"}
                className={cn(
                  "h-8 text-xs gap-2 min-w-[150px] transition-all duration-300",
                  (fetchDataCooldown !== null || isFetchingOrders) && "text-muted-foreground bg-muted cursor-not-allowed"
                )}
                onClick={handleFetchData}
                disabled={fetchDataCooldown !== null || isFetchingOrders}
                data-testid="button-fetch-orders"
              >
                {isFetchingOrders ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    FETCHING...
                  </>
                ) : fetchDataCooldown !== null ? (
                  <span className="font-mono">{formatCooldown(fetchDataCooldown)}</span>
                ) : (
                  <>
                    <DownloadCloud className="w-3.5 h-3.5" />
                    ORDERS FROM API
                  </>
                )}
             </Button>
             {isAdmin && (
               <Button 
                  size="sm" 
                  variant={isFetchingAllOrders ? "secondary" : "outline"}
                  className={cn(
                    "h-8 text-xs gap-2 min-w-[160px] transition-all duration-300",
                    isFetchingAllOrders && "text-muted-foreground bg-muted cursor-not-allowed"
                  )}
                  onClick={() => setShowFetchAllModal(true)}
                  disabled={isFetchingAllOrders}
                  data-testid="button-fetch-all-orders"
                >
                  {isFetchingAllOrders ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      FETCHING...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="w-3.5 h-3.5" />
                      FETCH ALL ORDERS
                    </>
                  )}
               </Button>
             )}
             <Button 
                size="sm" 
                variant={isRunningSuggestions ? "secondary" : "outline"}
                className={cn(
                  "h-8 text-xs gap-2 min-w-[130px] transition-all duration-300",
                  isRunningSuggestions && "text-muted-foreground bg-muted cursor-not-allowed"
                )}
                onClick={handleRunSuggestions}
                disabled={isRunningSuggestions}
                data-testid="button-run-suggestions"
              >
                {isRunningSuggestions ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    MATCHING...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    SUGGESTIONS
                  </>
                )}
             </Button>
             <Link href="/all-transactions">
               <Button 
                 size="sm" 
                 variant="outline" 
                 className="h-8 text-xs gap-2"
                 data-testid="button-view-all-transactions"
               >
                  <List className="w-3.5 h-3.5" />
                  ALL TRANSACTIONS
               </Button>
             </Link>
             {reconcileCounts.orders > 0 && (
               <Button 
                 size="sm" 
                 className="h-8 text-xs gap-2 bg-green-600 hover:bg-green-700 text-white"
                 onClick={() => setShowReconcileConfirm(true)}
                 disabled={isReconciling}
                 data-testid="button-fully-reconcile"
               >
                  {isReconciling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      RECONCILING...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      FULLY RECONCILE
                    </>
                  )}
               </Button>
             )}
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
        </div>
      </header>

      {/* Upload Status Notification */}
      <AnimatePresence>
        {uploadStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "mx-4 mt-2 p-3 rounded-md flex items-center justify-between",
              uploadStatus.type === 'success' 
                ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
            )}
          >
            <div className="flex items-center gap-2">
              {uploadStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{uploadStatus.message}</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => setUploadStatus(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fetch Orders Status Notification */}
      <AnimatePresence>
        {fetchStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "mx-4 mt-2 p-3 rounded-md flex items-center justify-between",
              fetchStatus.type === 'success' 
                ? "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
            )}
          >
            <div className="flex items-center gap-2">
              {fetchStatus.type === 'success' ? (
                <DownloadCloud className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{fetchStatus.message}</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => setFetchStatus(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconcile Status Notification */}
      <AnimatePresence>
        {reconcileStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "mx-4 mt-2 p-3 rounded-md flex items-center justify-between",
              reconcileStatus.type === 'success' 
                ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
            )}
          >
            <div className="flex items-center gap-2">
              {reconcileStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{reconcileStatus.message}</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => setReconcileStatus(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={showMatched ? 60 : 100} minSize={20}>
            <div className="flex flex-col h-full overflow-hidden">
        {/* Suggestion Inbox (Collapsible) */}
        <AnimatePresence>
          {suggestedMatches.length > 0 && showSuggestions && (
            <motion.div 
              initial={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-amber-500/5 border-b border-amber-500/20 shrink-0 flex flex-col relative"
            >
               <div className="px-6 py-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                     <Sparkles className="w-4 h-4" />
                     <span className="text-sm font-semibold">Suggested Matches</span>
                     <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-0">
                       {suggestedMatches.length} pending
                     </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                     <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground hover:text-foreground" onClick={() => setShowSuggestions(false)}>
                        Dismiss
                     </Button>
                     <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0" onClick={handleApproveAllSuggestions}>
                        Approve All
                     </Button>
                  </div>
               </div>
               
               <div 
                 className="px-6 pb-2 overflow-y-auto"
                 style={{ height: suggestionsHeight }}
               >
                  {suggestedMatches.map(({ remittance, bankTransaction }) => (
                    <SuggestedMatchRow 
                      key={remittance.id}
                      remittance={remittance}
                      bankTransaction={bankTransaction}
                      onApprove={() => handleApproveSuggestion(remittance.id, bankTransaction.id)}
                      onReject={() => handleRejectSuggestion(remittance.id, bankTransaction.id)}
                    />
                  ))}
               </div>

               {/* Resize Handle */}
               <div 
                 className="h-4 w-full cursor-row-resize flex items-center justify-center hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors border-t border-amber-500/10 select-none"
                 onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizingSuggestions(true);
                 }}
               >
                  <GripHorizontal className="w-4 h-4 text-amber-500/30" />
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unmatched Area (Independent Scroll) */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel: Bank Transactions */}
          <div className="flex-1 flex flex-col border-r border-border/40 min-w-[400px]">
          {/* Panel Header */}
          <div className="h-12 border-b border-border/40 flex items-center px-4 gap-2 bg-background/50">
             <div className="w-2 h-2 rounded-full bg-bank shadow-[0_0_8px_var(--color-bank)]" />
             <span className="text-sm font-semibold text-bank uppercase tracking-wider whitespace-nowrap">Bank Transactions</span>
             <div className="ml-auto flex items-center gap-2">
                <div className="relative w-40">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input 
                    className="h-7 text-xs pl-7 bg-muted/30 border-transparent focus:bg-background" 
                    placeholder="Filter..." 
                    value={bankFilter}
                    onChange={(e) => setBankFilter(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 px-2", bankDateFrom && "text-foreground")}>
                      <CalendarIcon className="w-3 h-3" />
                      {bankDateFrom ? format(bankDateFrom, "MM/dd") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={bankDateFrom} onSelect={setBankDateFrom} initialFocus />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 px-2", bankDateTo && "text-foreground")}>
                      <CalendarIcon className="w-3 h-3" />
                      {bankDateTo ? format(bankDateTo, "MM/dd") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={bankDateTo} onSelect={setBankDateTo} initialFocus />
                  </PopoverContent>
                </Popover>
                {(bankDateFrom || bankDateTo) && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setBankDateFrom(undefined); setBankDateTo(undefined); }}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
             </div>
          </div>

          {/* Sort Bar */}
          <div className="h-8 border-b border-border/40 flex items-center px-2 gap-1 bg-muted/10 overflow-x-auto no-scrollbar">
             <SortButton label="Date" active={bankSort.field === 'date'} direction={bankSort.order} onClick={() => handleBankSort('date')} />
             <SortButton label="Ref" active={bankSort.field === 'reference'} direction={bankSort.order} onClick={() => handleBankSort('reference')} />
             <SortButton label="Payee" active={bankSort.field === 'payee'} direction={bankSort.order} onClick={() => handleBankSort('payee')} />
             <SortButton label="Amount" active={bankSort.field === 'amount'} direction={bankSort.order} onClick={() => handleBankSort('amount')} />
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
                      matchStats={
                        selectedBankIds.has(t.id) && selectedRemitIds.size > 0
                        ? calculateMatchStats(t, remittances.find(r => selectedRemitIds.has(r.id))!)
                        : undefined
                      }
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
             <span className="font-mono">Total: {filteredBank.reduce((acc, t) => acc + t.amount, 0).toLocaleString()}</span>
          </div>
        </div>


        {/* Center Divider / Action Zone (Visual Only) */}
        <div className="w-[1px] bg-border relative z-10 hidden md:block">
        </div>


        {/* Right Panel: Remittances */}
        <div className="flex-1 flex flex-col min-w-[400px]">
          {/* Panel Header */}
          <div className="h-12 border-b border-border/40 flex items-center px-4 gap-2 bg-background/50">
             <div className="w-2 h-2 rounded-full bg-remit shadow-[0_0_8px_var(--color-remit)]" />
             <span className="text-sm font-semibold text-remit uppercase tracking-wider whitespace-nowrap">Orders</span>
             <div className="ml-auto flex items-center gap-2">
                <div className="relative w-40">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input 
                    className="h-7 text-xs pl-7 bg-muted/30 border-transparent focus:bg-background" 
                    placeholder="Filter..." 
                    value={remitFilter}
                    onChange={(e) => setRemitFilter(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 px-2", remitDateFrom && "text-foreground")}>
                      <CalendarIcon className="w-3 h-3" />
                      {remitDateFrom ? format(remitDateFrom, "MM/dd") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={remitDateFrom} onSelect={setRemitDateFrom} initialFocus />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 px-2", remitDateTo && "text-foreground")}>
                      <CalendarIcon className="w-3 h-3" />
                      {remitDateTo ? format(remitDateTo, "MM/dd") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={remitDateTo} onSelect={setRemitDateTo} initialFocus />
                  </PopoverContent>
                </Popover>
                {(remitDateFrom || remitDateTo) && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setRemitDateFrom(undefined); setRemitDateTo(undefined); }}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
             </div>
          </div>

          {/* Sort Bar */}
          <div className="h-8 border-b border-border/40 flex items-center px-2 gap-1 bg-muted/10 overflow-x-auto no-scrollbar">
             <SortButton label="Date" active={remitSort.field === 'date'} direction={remitSort.order} onClick={() => handleRemitSort('date')} />
             <SortButton label="Ref" active={remitSort.field === 'reference'} direction={remitSort.order} onClick={() => handleRemitSort('reference')} />
             <SortButton label="Client" active={remitSort.field === 'client'} direction={remitSort.order} onClick={() => handleRemitSort('client')} />
             <SortButton label="Order" active={remitSort.field === 'orderNumber'} direction={remitSort.order} onClick={() => handleRemitSort('orderNumber')} />
             <SortButton label="Amount" active={remitSort.field === 'amount'} direction={remitSort.order} onClick={() => handleRemitSort('amount')} />
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
                      matchStats={
                        selectedRemitIds.has(r.id) && selectedBankIds.size > 0
                        ? calculateMatchStats(bankTransactions.find(b => selectedBankIds.has(b.id))!, r)
                        : undefined
                      }
                    />
                  ))}
                   {filteredRemit.length === 0 && (
                     <div className="text-center py-20 text-muted-foreground text-sm">No unmatched orders found.</div>
                  )}
                </AnimatePresence>
             </div>
          </div>

          {/* Panel Footer / Summary */}
           <div className="h-10 border-t border-border/40 flex items-center px-4 justify-between bg-muted/10 text-xs text-muted-foreground">
             <span>{filteredRemit.length} items</span>
             <span className="font-mono">Total: {filteredRemit.reduce((acc, r) => acc + r.amount, 0).toLocaleString()}</span>
          </div>
        </div>
        </div>
        </div>
        </ResizablePanel>
        
        {showMatched && (
             <>
               <ResizableHandle withHandle />
               <ResizablePanel defaultSize={40} minSize={20}>
                 <div className="flex flex-col h-full border-t-4 border-double border-border/50 bg-muted/5">
                    <div className="h-8 flex items-center px-4 bg-muted/20 border-b border-border/40 justify-between shrink-0">
                       <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                         <History className="w-3 h-3" />
                         Matched History
                       </span>
                       <div className="flex items-center gap-3">
                         <span className="text-xs text-muted-foreground">{matchedGroups.length} groups</span>
                       </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
                       <div className="space-y-2">
                         {matchedGroups.map((group, idx) => (
                           <MatchedGroupRow 
                             key={group.remittance.id}
                             remittance={group.remittance}
                             bankTransactions={group.bankTransactions}
                             index={idx}
                             onUnmatch={() => handleUnmatch(
                               group.remittance.id, 
                               group.bankTransactions.map(b => b.id)
                             )}
                           />
                         ))}
                         {matchedGroups.length === 0 && (
                            <div className="text-center py-10 text-muted-foreground text-sm">No matched items to display.</div>
                         )}
                       </div>
                    </div>
                 </div>
               </ResizablePanel>
             </>
          )}
        </ResizablePanelGroup>
      </div>
      
      {/* Footer / Shortcuts Help */}
      <div className="h-6 border-t bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground gap-4">
        <span className="flex items-center gap-1"><Keyboard className="w-3 h-3" /> Shortcuts:</span>
        <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded font-mono">Click</kbd> Select</span>
        <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded font-mono">M</kbd> Match Selected</span>
      </div>

      {/* Reconcile Confirmation Dialog */}
      <AlertDialog open={showReconcileConfirm} onOpenChange={setShowReconcileConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Reconciliation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reconcile <strong>{reconcileCounts.transactions} transactions</strong> with <strong>{reconcileCounts.orders} orders</strong>?
              <br /><br />
              This will finalize the matches and download an Excel report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReconcile} className="bg-green-600 hover:bg-green-700">
              Yes, Reconcile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Amount Difference Warning Dialog */}
      <AlertDialog open={showAmountWarning} onOpenChange={setShowAmountWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Amount Difference Warning</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                The order amount exceeds the bank transaction by <strong>{pendingMatch?.difference.toFixed(2)}</strong>
              </p>
              <p>
                Link the transaction and the commission, or if the commission is missing, ask the client to send that amount.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isAdmin && (
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label htmlFor="overrideReason">Reason to Override</Label>
                <Input
                  id="overrideReason"
                  data-testid="input-override-reason"
                  placeholder="Enter reason to override this warning..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelAmountWarning}>OK</AlertDialogCancel>
            {isAdmin && (
              <AlertDialogAction 
                onClick={handleConfirmAmountWarning} 
                disabled={!overrideReason.trim()}
                data-testid="button-override-warning"
                className="bg-orange-600 hover:bg-orange-700"
              >
                Override Warning
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fetch All Orders Modal (Admin Only) */}
      <Dialog open={showFetchAllModal} onOpenChange={setShowFetchAllModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Fetch All Orders</DialogTitle>
            <DialogDescription>
              Select a date range to fetch orders from the API.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fetchAllStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fetchAllStartDate ? format(fetchAllStartDate, "PPP") : "Select start date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fetchAllStartDate}
                    onSelect={setFetchAllStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endDate">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fetchAllEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fetchAllEndDate ? format(fetchAllEndDate, "PPP") : "Select end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fetchAllEndDate}
                    onSelect={setFetchAllEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="cleanOldOrders"
                checked={cleanOldOrders}
                onCheckedChange={setCleanOldOrders}
              />
              <Label htmlFor="cleanOldOrders" className="text-sm font-medium cursor-pointer">
                Clean Old Orders
              </Label>
            </div>
            {!cleanOldOrders && (
              <div className="grid gap-2">
                <Label htmlFor="status">Status Filter</Label>
                <Select value={fetchAllStatus} onValueChange={(value: "P" | "H" | "D") => setFetchAllStatus(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P">Paid</SelectItem>
                    <SelectItem value="H">Holding</SelectItem>
                    {isAdmin && <SelectItem value="D">Dispatch</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFetchAllModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleFetchAllOrders(fetchAllStartDate, fetchAllEndDate, fetchAllStatus, cleanOldOrders)}
              disabled={!fetchAllStartDate}
            >
              {cleanOldOrders ? "Clean Orders" : "Fetch Orders"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
