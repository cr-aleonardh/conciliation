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

type BankSortField = 'date' | 'reference' | 'payee' | 'amount';
type RemitSortField = 'date' | 'reference' | 'client' | 'amount' | 'orderNumber';
type SortOrder = 'asc' | 'desc';

const calculateMatchStats = (bank: BankTransaction, remit: Remittance) => {
  const bankRef = bank.reference?.trim().toLowerCase() || '';
  const remitRef = remit.reference?.trim().toLowerCase() || '';
  const isReferenceMatch = bankRef !== '' && remitRef !== '' && (
    bankRef === remitRef || 
    bankRef.includes(remitRef) || 
    remitRef.includes(bankRef)
  );
  const rValue = isReferenceMatch ? 'Y' : 'N';

  const s1 = bank.payee.toLowerCase();
  const s2 = remit.customerName.toLowerCase();
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
  const union = new Set([...Array.from(set1), ...Array.from(set2)]);
  const similarity = union.size === 0 ? 0 : intersection.size / union.size;
  const nValue = `${Math.round(similarity * 100)}%`;

  const d1 = new Date(bank.date);
  const d2 = new Date(remit.date);
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const dValue = diffDays >= 0 
    ? `+${diffDays.toString().padStart(2, '0')}` 
    : `-${Math.abs(diffDays).toString().padStart(2, '0')}`;

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
      <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-amber-500/20 -translate-x-1/2 z-0">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border border-amber-500/50 flex items-center justify-center z-10 shadow-sm">
            <Sparkles className="w-3 h-3 text-amber-500" />
         </div>
      </div>

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

const ROW_HEIGHT = 72;
const GAP = 8;

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
      layoutId={`paid-bank-${data.id}`}
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
      layoutId={`paid-remit-${data.id}`}
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

        <div className="max-w-full overflow-hidden">
           <ClickToCopy text={data.customerName}><span className={cn("text-base font-medium transition-colors whitespace-nowrap", isMatched ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground group-hover:text-secondary")}>
             {data.customerName}
           </span></ClickToCopy>
        </div>

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

      <div className="text-right pl-4 shrink-0">
         <AmountDisplay amount={data.amount} type="remit" dimmed={isMatched} />
      </div>
    </motion.div>
  );
};

interface PaidOrdersReconciliationPageProps {
  isAdmin?: boolean;
}

export default function PaidOrdersReconciliationPage({ isAdmin = false }: PaidOrdersReconciliationPageProps) {
  const { toast } = useToast();
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());
  const [selectedRemitIds, setSelectedRemitIds] = useState<Set<string>>(new Set());
  
  const [bankFilter, setBankFilter] = useState('');
  const [remitFilter, setRemitFilter] = useState('');
  
  const [bankDateFrom, setBankDateFrom] = useState<Date | undefined>(undefined);
  const [bankDateTo, setBankDateTo] = useState<Date | undefined>(undefined);
  const [remitDateFrom, setRemitDateFrom] = useState<Date | undefined>(undefined);
  const [remitDateTo, setRemitDateTo] = useState<Date | undefined>(undefined);
  
  const [showMatched, setShowMatched] = useState(false);

  const [bankSort, setBankSort] = useState<{ field: BankSortField, order: SortOrder }>({ field: 'date', order: 'desc' });
  const [remitSort, setRemitSort] = useState<{ field: RemitSortField, order: SortOrder }>({ field: 'date', order: 'desc' });

  const [showSuggestions, setShowSuggestions] = useState(true);

  const [suggestionsHeight, setSuggestionsHeight] = useState(350);
  const [isResizingSuggestions, setIsResizingSuggestions] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [isRunningSuggestions, setIsRunningSuggestions] = useState(false);

  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileStatus, setReconcileStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);

  const [showAmountWarning, setShowAmountWarning] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<{ remitId: string; bankIds: string[]; difference: number } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

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
        const [bankResponse, ordersResponse] = await Promise.all([
          fetch('/api/bank-transactions'),
          fetch('/api/orders/paid')
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
          const { orders } = await ordersResponse.json();
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
        const txResponse = await fetch('/api/bank-transactions');
        if (txResponse.ok) {
          const transactions = await txResponse.json();
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

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [bankResponse, ordersResponse] = await Promise.all([
          fetch('/api/bank-transactions'),
          fetch('/api/orders/paid')
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
          const { orders } = await ordersResponse.json();
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

  const filteredBank = useMemo(() => 
    bankTransactions.filter(t => {
      if (!showMatched && (t.status === 'matched' || t.status === 'suggested')) return false;
      
      const matchesText = t.payee.toLowerCase().includes(bankFilter.toLowerCase()) || 
                          t.amount.toString().includes(bankFilter) ||
                          t.reference.includes(bankFilter);
      if (!matchesText) return false;
      
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
       if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1;
       
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
      if (!showMatched && (r.status === 'matched' || r.status === 'suggested')) return false;
      
      const matchesText = r.id.includes(remitFilter) ||
                          r.customerName.toLowerCase().includes(remitFilter.toLowerCase()) || 
                          r.amount.toString().includes(remitFilter) ||
                          r.reference.toLowerCase().includes(remitFilter.toLowerCase());
      if (!matchesText) return false;
      
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
       if (a.status !== b.status) return a.status === 'unmatched' ? -1 : 1;

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
    const remit = remittances.find(r => r.id === remitId);
    const bank = bankTransactions.find(b => b.id === bankId);
    
    if (remit && bank) {
      const difference = remit.amount - bank.amount;
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
      for (const bankId of pendingMatch.bankIds) {
        await executeMatch(pendingMatch.remitId, bankId, overrideReason);
      }
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

  const handleUnmatch = async (remitId: string, bankIds: string[]) => {
    try {
      for (const transactionHash of bankIds) {
        await fetch('/api/unmatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionHash })
        });
      }
      
      setBankTransactions(prev => prev.map(t => 
        bankIds.includes(t.id) ? { ...t, status: 'unmatched' } : t
      ));
      
      setRemittances(prev => prev.map(r => 
        r.id === remitId ? { ...r, status: 'unmatched', matchedBankIds: undefined } : r
      ));
    } catch (error) {
      console.error('Failed to unmatch:', error);
    }
  };

  const handleReconcile = async () => {
    if (isReconciling) return;
    
    const matchedRemits = remittances.filter(r => r.reconciliationStatus === 'temporarily_matched');
    if (matchedRemits.length === 0) return;
    
    const matches = matchedRemits.map(r => ({
      orderId: parseInt(r.id),
      transactionHashes: r.matchedBankIds || []
    }));
    
    setIsReconciling(true);
    setReconcileStatus(null);
    setShowReconcileConfirm(false);
    
    try {
      const response = await fetch('/api/reconcile-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches })
      });
      
      const result = await response.json();
      
      if (result.success) {
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

  const toggleBankSelection = (id: string) => {
    const next = new Set(selectedBankIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBankIds(next);
  };

  const toggleRemitSelection = (id: string) => {
    if (selectedRemitIds.has(id)) {
      setSelectedRemitIds(new Set());
    } else {
      setSelectedRemitIds(new Set([id]));
    }
  };

  const handleMatch = useCallback(async () => {
    if (selectedBankIds.size === 0 || selectedRemitIds.size === 0) return;

    const remitId = Array.from(selectedRemitIds)[0];
    const transactionHashes = Array.from(selectedBankIds);
    
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

      setSelectedBankIds(new Set());
      setSelectedRemitIds(new Set());
    } catch (error) {
      console.error('Failed to save match:', error);
    }
  }, [selectedBankIds, selectedRemitIds, remittances, bankTransactions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey) {
        handleMatch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMatch]);

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

  const matchedGroups = useMemo(() => {
    if (!showMatched) return [];
    
    const matchedRemits = remittances.filter(r => r.reconciliationStatus === 'temporarily_matched');
    
    return matchedRemits.map(r => {
       const remitId = parseInt(r.id);
       const relatedBankTxns = bankTransactions.filter(b => 
         b.reconciliationStatus === 'temporarily_matched' && (
           r.matchedBankIds?.includes(b.id) || 
           b.orderId === remitId
         )
       );
       return { remittance: r, bankTransactions: relatedBankTxns };
    }).sort((a, b) => b.remittance.date.localeCompare(a.remittance.date));
  }, [remittances, bankTransactions, showMatched]);

  const reconcileCounts = useMemo(() => {
    const matchedRemits = remittances.filter(r => r.reconciliationStatus === 'temporarily_matched');
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
    <div className="h-screen w-full bg-background text-foreground flex flex-col overflow-x-auto overflow-y-hidden font-sans min-w-[900px]">
      
      <header className="h-16 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Conciliate Paid Orders in Remitec</h1>
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
               data-testid="paid-input-bank-file"
             />
             <Button 
               size="sm" 
               variant="outline" 
               className="h-8 text-xs gap-2"
               onClick={handleUploadButtonClick}
               disabled={isUploading}
               data-testid="paid-button-upload-bank-file"
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
                variant={isRunningSuggestions ? "secondary" : "outline"}
                className={cn(
                  "h-8 text-xs gap-2 min-w-[130px] transition-all duration-300",
                  isRunningSuggestions && "text-muted-foreground bg-muted cursor-not-allowed"
                )}
                onClick={handleRunSuggestions}
                disabled={isRunningSuggestions}
                data-testid="paid-button-run-suggestions"
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
                 data-testid="paid-button-view-all-transactions"
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
                 data-testid="paid-button-fully-reconcile"
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
             <div className="flex items-center gap-2 border-r border-border/50 pr-4 mr-2">
                <Switch 
                  id="paid-show-matched" 
                  checked={showMatched} 
                  onCheckedChange={setShowMatched}
                  className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="paid-show-matched" className="text-xs cursor-pointer flex items-center gap-1">
                   {showMatched ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                   Matched
                </Label>
             </div>
             <div className={cn(
               "flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all duration-200",
               isMatchable 
                 ? (isPerfectMatch ? "bg-match/10 border-match" : "bg-muted/50 border-border") 
                 : "bg-muted/20 border-border/40"
             )}>
               <span className="text-xs text-muted-foreground">Bank:</span>
               <span className={cn("text-sm font-mono font-medium", selectedBankIds.size > 0 ? "text-bank" : "text-muted-foreground/50")}>
                 {selectedBankTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
               </span>
               <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground/50 mx-1" />
               <span className="text-xs text-muted-foreground">Order:</span>
               <span className={cn("text-sm font-mono font-medium", selectedRemitIds.size > 0 ? "text-remit" : "text-muted-foreground/50")}>
                 {selectedRemitTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
               </span>
               <span className={cn(
                 "text-sm font-mono font-bold ml-2 px-1.5 py-0.5 rounded",
                 isPerfectMatch && isMatchable ? "bg-match text-white" : "text-muted-foreground"
               )}>
                 Δ {difference >= 0 ? '+' : ''}{difference.toLocaleString('en-US', { minimumFractionDigits: 2 })}
               </span>
             </div>
             <TooltipProvider>
               <Tooltip>
                 <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      disabled={!isMatchable}
                      onClick={handleMatch}
                      className={cn("h-8 gap-2 transition-all", isPerfectMatch && isMatchable && "bg-match hover:bg-match/90")}
                      data-testid="paid-button-match"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      Match
                    </Button>
                 </TooltipTrigger>
                 <TooltipContent side="bottom">
                   Press <kbd className="bg-muted px-1 rounded font-mono ml-1">M</kbd> to match
                 </TooltipContent>
               </Tooltip>
             </TooltipProvider>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <ResizablePanelGroup direction="vertical" className="flex-1">
        <ResizablePanel defaultSize={showMatched ? 60 : 100} minSize={30}>
        <div className="h-full flex flex-col">
        
        <AnimatePresence>
           {showSuggestions && suggestedMatches.length > 0 && (
              <motion.div
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: suggestionsHeight }}
                 exit={{ opacity: 0, height: 0 }}
                 className="border-b-2 border-amber-500/30 bg-amber-500/5 shrink-0 flex flex-col relative overflow-hidden"
              >
                <div className="h-10 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between px-4 shrink-0">
                   <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Suggested Matches</span>
                      <Badge variant="secondary" className="bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200 font-mono text-xs">
                         {suggestedMatches.length}
                      </Badge>
                   </div>
                   <div className="flex items-center gap-2">
                      {suggestedMatches.length > 0 && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-green-600 hover:text-green-600 hover:bg-green-500/10" onClick={handleApproveAllSuggestions} data-testid="paid-button-approve-all-suggestions">
                           <CheckCircle2 className="w-3.5 h-3.5" />
                           Approve All
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setShowSuggestions(false)} data-testid="paid-button-close-suggestions">
                         <X className="w-4 h-4" />
                      </Button>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <AnimatePresence mode="popLayout">
                     {suggestedMatches.map(({ remittance, bankTransaction }) => (
                        <SuggestedMatchRow 
                           key={`${bankTransaction.id}-${remittance.id}`}
                           remittance={remittance}
                           bankTransaction={bankTransaction}
                           onApprove={() => handleApproveSuggestion(remittance.id, bankTransaction.id)}
                           onReject={() => handleRejectSuggestion(remittance.id, bankTransaction.id)}
                        />
                     ))}
                  </AnimatePresence>
                </div>
                
                <div 
                   className="h-3 cursor-row-resize bg-gradient-to-b from-transparent to-amber-500/10 hover:to-amber-500/20 flex items-center justify-center group"
                   onMouseDown={() => setIsResizingSuggestions(true)}
                >
                   <GripHorizontal className="w-8 h-3 text-amber-500/30 group-hover:text-amber-500/50" />
                </div>
              </motion.div>
           )}
        </AnimatePresence>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-[400px] flex flex-col border-r border-border/40 overflow-hidden">
              <div className="h-12 border-b border-border/40 flex items-center px-4 gap-3 bg-card/30 shrink-0">
                <div className="relative flex-1">
                   <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                   <Input 
                      placeholder="Filter bank transactions..." 
                      className="h-8 pl-8 text-xs bg-background/50"
                      value={bankFilter}
                      onChange={e => setBankFilter(e.target.value)}
                      data-testid="paid-input-bank-filter"
                   />
                </div>
                <Popover>
                   <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" data-testid="paid-button-bank-date-filter">
                        <CalendarIcon className="w-3 h-3" />
                        {bankDateFrom || bankDateTo ? (
                          <span>
                            {bankDateFrom ? format(bankDateFrom, 'MMM d') : '...'} - {bankDateTo ? format(bankDateTo, 'MMM d') : '...'}
                          </span>
                        ) : (
                          'Date'
                        )}
                      </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-auto p-4" align="end">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs">From</Label>
                          <Calendar
                            mode="single"
                            selected={bankDateFrom}
                            onSelect={setBankDateFrom}
                            initialFocus
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">To</Label>
                          <Calendar
                            mode="single"
                            selected={bankDateTo}
                            onSelect={setBankDateTo}
                          />
                        </div>
                        {(bankDateFrom || bankDateTo) && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full text-xs"
                            onClick={() => { setBankDateFrom(undefined); setBankDateTo(undefined); }}
                          >
                            Clear dates
                          </Button>
                        )}
                      </div>
                   </PopoverContent>
                </Popover>
                <div className="flex gap-1">
                   <SortButton label="Date" active={bankSort.field === 'date'} direction={bankSort.order} onClick={() => handleBankSort('date')} />
                   <SortButton label="Amt" active={bankSort.field === 'amount'} direction={bankSort.order} onClick={() => handleBankSort('amount')} />
                   <SortButton label="Ref" active={bankSort.field === 'reference'} direction={bankSort.order} onClick={() => handleBankSort('reference')} />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
                <AnimatePresence mode="popLayout">
                  {filteredBank.map(t => (
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

             <div className="h-10 border-t border-border/40 flex items-center px-4 justify-between bg-muted/10 text-xs text-muted-foreground">
               <span>{filteredBank.length} items</span>
               <span className="font-mono">Total: {filteredBank.reduce((acc, t) => acc + t.amount, 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex-1 min-w-[400px] flex flex-col overflow-hidden">
              <div className="h-12 border-b border-border/40 flex items-center px-4 gap-3 bg-card/30 shrink-0">
                <div className="relative flex-1">
                   <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                   <Input 
                      placeholder="Filter orders..." 
                      className="h-8 pl-8 text-xs bg-background/50"
                      value={remitFilter}
                      onChange={e => setRemitFilter(e.target.value)}
                      data-testid="paid-input-remit-filter"
                   />
                </div>
                <Popover>
                   <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1" data-testid="paid-button-remit-date-filter">
                        <CalendarIcon className="w-3 h-3" />
                        {remitDateFrom || remitDateTo ? (
                          <span>
                            {remitDateFrom ? format(remitDateFrom, 'MMM d') : '...'} - {remitDateTo ? format(remitDateTo, 'MMM d') : '...'}
                          </span>
                        ) : (
                          'Date'
                        )}
                      </Button>
                   </PopoverTrigger>
                   <PopoverContent className="w-auto p-4" align="end">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs">From</Label>
                          <Calendar
                            mode="single"
                            selected={remitDateFrom}
                            onSelect={setRemitDateFrom}
                            initialFocus
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">To</Label>
                          <Calendar
                            mode="single"
                            selected={remitDateTo}
                            onSelect={setRemitDateTo}
                          />
                        </div>
                        {(remitDateFrom || remitDateTo) && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full text-xs"
                            onClick={() => { setRemitDateFrom(undefined); setRemitDateTo(undefined); }}
                          >
                            Clear dates
                          </Button>
                        )}
                      </div>
                   </PopoverContent>
                </Popover>
                <div className="flex gap-1">
                   <SortButton label="Date" active={remitSort.field === 'date'} direction={remitSort.order} onClick={() => handleRemitSort('date')} />
                   <SortButton label="Amt" active={remitSort.field === 'amount'} direction={remitSort.order} onClick={() => handleRemitSort('amount')} />
                   <SortButton label="Ref" active={remitSort.field === 'reference'} direction={remitSort.order} onClick={() => handleRemitSort('reference')} />
                   <SortButton label="Order" active={remitSort.field === 'orderNumber'} direction={remitSort.order} onClick={() => handleRemitSort('orderNumber')} />
                </div>
              </div>

             <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
                <AnimatePresence mode="popLayout">
                  {filteredRemit.map(r => (
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
      
      <div className="h-6 border-t bg-muted/20 flex items-center justify-center text-[10px] text-muted-foreground gap-4">
        <span className="flex items-center gap-1"><Keyboard className="w-3 h-3" /> Shortcuts:</span>
        <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded font-mono">Click</kbd> Select</span>
        <span className="flex items-center gap-1"><kbd className="bg-muted px-1 rounded font-mono">M</kbd> Match Selected</span>
      </div>

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
                <Label htmlFor="paid-overrideReason">Reason to Override</Label>
                <Input
                  id="paid-overrideReason"
                  data-testid="paid-input-override-reason"
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
                data-testid="paid-button-override-warning"
                className="bg-orange-600 hover:bg-orange-700"
              >
                Override Warning
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
