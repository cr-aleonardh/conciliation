import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  LogOut,
  RefreshCw,
  ArrowLeft,
  CalendarIcon,
  X,
  Plus,
  Pencil,
  Trash2,
  FileWarning
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import type { BankTransaction } from "@shared/schema";

type SortField = "transactionDate" | "payerSender" | "extractedReference" | "creditAmount";
type SortDirection = "asc" | "desc";

interface TransactionFormData {
  payerSender: string;
  transactionDate: string;
  creditAmount: string;
  description: string;
  extractedReference: string;
}

const emptyFormData: TransactionFormData = {
  payerSender: "",
  transactionDate: "",
  creditAmount: "",
  description: "",
  extractedReference: "",
};

export default function UnreconciledTransactionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("transactionDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null);
  const [formData, setFormData] = useState<TransactionFormData>(emptyFormData);

  const { data: allTransactions = [], isLoading, refetch } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions"],
    queryFn: async () => {
      const response = await fetch("/api/bank-transactions");
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return response.json();
    },
  });

  const transactions = useMemo(() => 
    allTransactions.filter(t => t.reconciliationStatus !== "reconciled"),
    [allTransactions]
  );

  const createMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const transactionHash = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const response = await fetch("/api/bank-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionHash,
          payerSender: data.payerSender,
          transactionDate: new Date(data.transactionDate).toISOString(),
          creditAmount: data.creditAmount,
          description: data.description,
          extractedReference: data.extractedReference || null,
          matchReferenceFlag: false,
          matchNameScore: "0",
          reconciliationStatus: "unmatched",
        }),
      });
      if (!response.ok) throw new Error("Failed to create transaction");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      setIsCreateDialogOpen(false);
      setFormData(emptyFormData);
      toast({ title: "Transaction created", description: "The transaction has been added successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create transaction.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ hash, data }: { hash: string; data: Partial<TransactionFormData> }) => {
      const response = await fetch(`/api/bank-transactions/${encodeURIComponent(hash)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payerSender: data.payerSender,
          transactionDate: data.transactionDate ? new Date(data.transactionDate).toISOString() : undefined,
          creditAmount: data.creditAmount,
          description: data.description,
          extractedReference: data.extractedReference || null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update transaction");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      setIsEditDialogOpen(false);
      setSelectedTransaction(null);
      setFormData(emptyFormData);
      toast({ title: "Transaction updated", description: "The transaction has been updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update transaction.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (hash: string) => {
      const response = await fetch(`/api/bank-transactions/${encodeURIComponent(hash)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete transaction");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      setIsDeleteDialogOpen(false);
      setSelectedTransaction(null);
      toast({ title: "Transaction deleted", description: "The transaction has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete transaction.", variant: "destructive" });
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

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.payerSender?.toLowerCase().includes(query) ||
        t.extractedReference?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.transactionHash?.toLowerCase().includes(query) ||
        t.creditAmount?.toString().includes(query)
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
  }, [transactions, searchQuery, sortField, sortDirection, dateFrom, dateTo]);

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

  const handleOpenCreate = () => {
    setFormData(emptyFormData);
    setIsCreateDialogOpen(true);
  };

  const handleOpenEdit = (transaction: BankTransaction) => {
    setSelectedTransaction(transaction);
    setFormData({
      payerSender: transaction.payerSender,
      transactionDate: formatDate(transaction.transactionDate),
      creditAmount: transaction.creditAmount,
      description: transaction.description,
      extractedReference: transaction.extractedReference || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleOpenDelete = (transaction: BankTransaction) => {
    setSelectedTransaction(transaction);
    setIsDeleteDialogOpen(true);
  };

  const handleCreate = () => {
    if (!formData.payerSender || !formData.transactionDate || !formData.creditAmount || !formData.description) {
      toast({ title: "Validation error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedTransaction) return;
    if (!formData.payerSender || !formData.transactionDate || !formData.creditAmount || !formData.description) {
      toast({ title: "Validation error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ hash: selectedTransaction.transactionHash, data: formData });
  };

  const handleDelete = () => {
    if (!selectedTransaction) return;
    deleteMutation.mutate(selectedTransaction.transactionHash);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
              <FileWarning className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Manage Unreconciled Transactions</h1>
              <p className="text-sm text-slate-400">Admin: Create, edit, and delete unreconciled bank transactions</p>
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
                Back to All Transactions
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
                Unreconciled Transactions
                <Badge variant="secondary" className="bg-amber-900/50 text-amber-400 border border-amber-700" data-testid="text-total-count">
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
                <Button
                  size="sm"
                  onClick={handleOpenCreate}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  data-testid="button-create-transaction"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Transaction
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
                    <Button variant="outline" size="sm" className={cn("gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800", dateFrom && "text-slate-100")} data-testid="button-date-from">
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
                    <Button variant="outline" size="sm" className={cn("gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-800", dateTo && "text-slate-100")} data-testid="button-date-to">
                      <CalendarIcon className="w-4 h-4" />
                      {dateTo ? format(dateTo, "MM/dd/yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                  </PopoverContent>
                </Popover>
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} data-testid="button-clear-dates">
                    <X className="w-4 h-4" />
                  </Button>
                )}
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
                <div className="text-slate-400">No unreconciled transactions found</div>
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
                      <TableHead className="text-slate-400">Description</TableHead>
                      <TableHead className="text-slate-400 text-right">Actions</TableHead>
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
                        <TableCell className="text-slate-100 font-medium max-w-xs truncate" data-testid={`text-payer-${transaction.transactionHash}`}>
                          {transaction.payerSender}
                        </TableCell>
                        <TableCell className="text-slate-300" data-testid={`text-reference-${transaction.transactionHash}`}>
                          {transaction.extractedReference || "-"}
                        </TableCell>
                        <TableCell className="text-right text-slate-100 font-mono" data-testid={`text-amount-${transaction.transactionHash}`}>
                          {formatAmount(transaction.creditAmount)}
                        </TableCell>
                        <TableCell className="text-slate-400 max-w-xs truncate" title={transaction.description} data-testid={`text-description-${transaction.transactionHash}`}>
                          {transaction.description}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(transaction)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                              data-testid={`button-edit-${transaction.transactionHash}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDelete(transaction)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                              data-testid={`button-delete-${transaction.transactionHash}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>Add New Transaction</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new unreconciled bank transaction manually.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="payer">Payer / Sender *</Label>
              <Input
                id="payer"
                value={formData.payerSender}
                onChange={(e) => setFormData({ ...formData, payerSender: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-payer"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Transaction Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.transactionDate}
                onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (EUR) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.creditAmount}
                onChange={(e) => setFormData({ ...formData, creditAmount: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-amount"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-description"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reference">Reference (optional)</Label>
              <Input
                id="reference"
                value={formData.extractedReference}
                onChange={(e) => setFormData({ ...formData, extractedReference: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-reference"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="border-slate-600 text-slate-300" data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700" data-testid="button-confirm-create">
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription className="text-slate-400">
              Modify the transaction details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-payer">Payer / Sender *</Label>
              <Input
                id="edit-payer"
                value={formData.payerSender}
                onChange={(e) => setFormData({ ...formData, payerSender: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-edit-payer"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-date">Transaction Date *</Label>
              <Input
                id="edit-date"
                type="date"
                value={formData.transactionDate}
                onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-edit-date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-amount">Amount (EUR) *</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={formData.creditAmount}
                onChange={(e) => setFormData({ ...formData, creditAmount: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-edit-amount"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description *</Label>
              <Input
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-edit-description"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-reference">Reference (optional)</Label>
              <Input
                id="edit-reference"
                value={formData.extractedReference}
                onChange={(e) => setFormData({ ...formData, extractedReference: e.target.value })}
                className="bg-slate-800 border-slate-600"
                data-testid="input-edit-reference"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="border-slate-600 text-slate-300" data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700" data-testid="button-confirm-edit">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete this transaction? This action cannot be undone.
              {selectedTransaction && (
                <div className="mt-3 p-3 bg-slate-800 rounded-lg">
                  <p><strong>Payer:</strong> {selectedTransaction.payerSender}</p>
                  <p><strong>Amount:</strong> {formatAmount(selectedTransaction.creditAmount)}</p>
                  <p><strong>Date:</strong> {formatDate(selectedTransaction.transactionDate)}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300 hover:bg-slate-800" data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
