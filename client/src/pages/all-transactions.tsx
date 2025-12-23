import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  LogOut,
  RefreshCw,
  List,
  ArrowLeft,
  CalendarIcon,
  X
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { BankTransaction } from "@shared/schema";

type SortField = "transactionDate" | "payerSender" | "extractedReference" | "creditAmount";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "reconciled" | "unmatched";

interface AllTransactionsPageProps {
  isViewer?: boolean;
}

export default function AllTransactionsPage({ isViewer = false }: AllTransactionsPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("transactionDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: transactions = [], isLoading, refetch } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions"],
    queryFn: async () => {
      const response = await fetch("/api/bank-transactions");
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? 
      <ArrowUp className="w-4 h-4 ml-1" /> : 
      <ArrowDown className="w-4 h-4 ml-1" />;
  };

  const filteredAndSortedTransactions = useMemo(() => {
    let result = [...transactions];

    if (statusFilter !== "all") {
      result = result.filter(t => 
        statusFilter === "reconciled" 
          ? t.reconciliationStatus === "reconciled" 
          : t.reconciliationStatus !== "reconciled"
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.payerSender?.toLowerCase().includes(query) ||
        t.extractedReference?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.transactionHash?.toLowerCase().includes(query) ||
        t.creditAmount?.toString().includes(query) ||
        t.orderId?.toString().includes(query)
      );
    }

    if (dateFrom || dateTo) {
      result = result.filter(t => {
        const txDate = new Date(t.transactionDate);
        if (dateFrom && txDate < dateFrom) return false;
        if (dateTo) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (txDate > endOfDay) return false;
        }
        return true;
      });
    }

    result.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sortField) {
        case "transactionDate":
          aVal = new Date(a.transactionDate).getTime();
          bVal = new Date(b.transactionDate).getTime();
          break;
        case "payerSender":
          aVal = a.payerSender?.toLowerCase() || "";
          bVal = b.payerSender?.toLowerCase() || "";
          break;
        case "extractedReference":
          aVal = a.extractedReference?.toLowerCase() || "";
          bVal = b.extractedReference?.toLowerCase() || "";
          break;
        case "creditAmount":
          aVal = parseFloat(a.creditAmount) || 0;
          bVal = parseFloat(b.creditAmount) || 0;
          break;
      }
      
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [transactions, statusFilter, searchQuery, sortField, sortDirection, dateFrom, dateTo]);

  const reconciledCount = transactions.filter(t => t.reconciliationStatus === "reconciled").length;
  const unreconciledCount = transactions.filter(t => t.reconciliationStatus !== "reconciled").length;

  const [copiedPayer, setCopiedPayer] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatAmount = (amount: string) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR"
    }).format(parseFloat(amount));
  };

  const handleCopyPayer = async (payerName: string) => {
    try {
      await navigator.clipboard.writeText(payerName);
      setCopiedPayer(payerName);
      setTimeout(() => setCopiedPayer(null), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center">
              <List className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">All Transactions</h1>
              <p className="text-sm text-slate-400">View all bank transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isViewer && (
              <Link href="/">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  data-testid="button-back-cockpit"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Cockpit
                </Button>
              </Link>
            )}
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
                Bank Transactions
                <Badge variant="secondary" className="bg-slate-700 text-slate-300" data-testid="text-total-count">
                  {filteredAndSortedTransactions.length} of {transactions.length}
                </Badge>
              </CardTitle>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                  data-testid="button-refresh"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search by payer, reference, description, amount..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
                  data-testid="input-search"
                />
              </div>

              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800", dateFrom && "text-slate-100")}>
                      <CalendarIcon className="w-4 h-4" />
                      {dateFrom ? format(dateFrom, "MM/dd/yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800", dateTo && "text-slate-100")}>
                      <CalendarIcon className="w-4 h-4" />
                      {dateTo ? format(dateTo, "MM/dd/yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                  </PopoverContent>
                </Popover>
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  className={statusFilter === "all" 
                    ? "bg-cyan-600 hover:bg-cyan-700 text-white" 
                    : "border-slate-600 text-slate-300 hover:bg-slate-800"}
                  data-testid="button-filter-all"
                >
                  All ({transactions.length})
                </Button>
                <Button
                  variant={statusFilter === "reconciled" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("reconciled")}
                  className={statusFilter === "reconciled" 
                    ? "bg-green-600 hover:bg-green-700 text-white" 
                    : "border-slate-600 text-slate-300 hover:bg-slate-800"}
                  data-testid="button-filter-reconciled"
                >
                  Reconciled ({reconciledCount})
                </Button>
                <Button
                  variant={statusFilter === "unmatched" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("unmatched")}
                  className={statusFilter === "unmatched" 
                    ? "bg-amber-600 hover:bg-amber-700 text-white" 
                    : "border-slate-600 text-slate-300 hover:bg-slate-800"}
                  data-testid="button-filter-unreconciled"
                >
                  Unreconciled ({unreconciledCount})
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-slate-400">Loading transactions...</div>
              </div>
            ) : filteredAndSortedTransactions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-slate-400">No transactions found</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-transparent">
                      <TableHead 
                        className="text-slate-400 cursor-pointer select-none"
                        onClick={() => handleSort("transactionDate")}
                        data-testid="header-date"
                      >
                        <div className="flex items-center">
                          Date
                          <SortIcon field="transactionDate" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-slate-400 cursor-pointer select-none"
                        onClick={() => handleSort("payerSender")}
                        data-testid="header-payer"
                      >
                        <div className="flex items-center">
                          Payer
                          <SortIcon field="payerSender" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-slate-400 cursor-pointer select-none"
                        onClick={() => handleSort("extractedReference")}
                        data-testid="header-reference"
                      >
                        <div className="flex items-center">
                          Reference
                          <SortIcon field="extractedReference" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-slate-400 cursor-pointer select-none text-right"
                        onClick={() => handleSort("creditAmount")}
                        data-testid="header-amount"
                      >
                        <div className="flex items-center justify-end">
                          Amount
                          <SortIcon field="creditAmount" />
                        </div>
                      </TableHead>
                      <TableHead className="text-slate-400">Status</TableHead>
                      <TableHead className="text-slate-400">Order ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedTransactions.map((transaction) => (
                      <TableRow 
                        key={transaction.transactionHash} 
                        className="border-slate-700 hover:bg-slate-800/50"
                        data-testid={`row-transaction-${transaction.transactionHash}`}
                      >
                        <TableCell className="text-slate-300" data-testid={`text-date-${transaction.transactionHash}`}>
                          {formatDate(transaction.transactionDate)}
                        </TableCell>
                        <TableCell 
                          className="text-slate-100 font-medium max-w-xs truncate cursor-pointer hover:text-cyan-400 hover:underline transition-colors"
                          onClick={() => handleCopyPayer(transaction.payerSender)}
                          title="Click to copy"
                          data-testid={`text-payer-${transaction.transactionHash}`}
                        >
                          {copiedPayer === transaction.payerSender ? (
                            <span className="text-green-400">Copied!</span>
                          ) : (
                            transaction.payerSender
                          )}
                        </TableCell>
                        <TableCell className="text-slate-300" data-testid={`text-reference-${transaction.transactionHash}`}>
                          {transaction.extractedReference || "-"}
                        </TableCell>
                        <TableCell className="text-right text-slate-100 font-mono" data-testid={`text-amount-${transaction.transactionHash}`}>
                          {formatAmount(transaction.creditAmount)}
                        </TableCell>
                        <TableCell data-testid={`text-status-${transaction.transactionHash}`}>
                          <Badge 
                            variant="secondary" 
                            className={transaction.reconciliationStatus === "reconciled" 
                              ? "bg-green-900/50 text-green-400 border border-green-700" 
                              : "bg-amber-900/50 text-amber-400 border border-amber-700"}
                          >
                            {transaction.reconciliationStatus === "reconciled" ? "Reconciled" : "Unreconciled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-400" data-testid={`text-orderid-${transaction.transactionHash}`}>
                          {transaction.orderId || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
