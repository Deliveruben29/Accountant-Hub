import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, X, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Activity, CalendarDays, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { 
  useListTransactions, 
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useListAccounts,
  TransactionType,
  Transaction
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTransactionsQueryKey } from "@workspace/api-client-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";

const CATEGORIES = ["Salary", "Sales", "Office Supplies", "Rent", "Utilities", "Travel", "Food", "Healthcare", "Entertainment", "Software", "Insurance", "Tax", "Household", "Refund", "Other", "Income"];

const txSchema = z.object({
  accountId: z.coerce.number().min(1, "Account is required"),
  date: z.string().min(1, "Date is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  type: z.enum([TransactionType.income, TransactionType.expense, TransactionType.transfer]),
  category: z.string().min(1, "Category is required"),
  notes: z.string().optional(),
});

type TxFormValues = z.infer<typeof txSchema>;

// ── Month helpers ───────────────────────────────────────────────────────────
function generateMonthOptions() {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  // Go back 24 months and forward 1
  for (let i = -1; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    options.push({ label, value: `${year}-${month}` });
  }
  return options;
}

function monthBounds(ym: string): { startDate: string; endDate: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

const MONTH_OPTIONS = generateMonthOptions();

// ── Component ────────────────────────────────────────────────────────────────
export default function Transactions() {
  const [filterAccountId, setFilterAccountId] = useState<number | undefined>(undefined);
  const [filterType, setFilterType] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [search, setSearch] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: accountsData } = useListAccounts();
  const accounts = accountsData || [];

  // Derive date bounds from month filter
  const dateBounds = filterMonth ? monthBounds(filterMonth) : {};

  const { data: txData, isLoading } = useListTransactions({
    limit: 500,
    offset: 0,
    ...(filterAccountId ? { accountId: filterAccountId } : {}),
    ...(filterType ? { type: filterType } : {}),
    ...(filterCategory ? { category: filterCategory } : {}),
    ...dateBounds,
  });

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<TxFormValues>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      accountId: 0,
      date: new Date().toISOString().split("T")[0],
      description: "",
      amount: 0,
      type: "expense",
      category: "",
      notes: "",
    },
  });

  // Client-side description search on already-fetched rows
  const allRows: Transaction[] = txData?.data ?? [];
  const filteredRows = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(
      (tx) =>
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q)
    );
  }, [allRows, search]);

  // Period summary
  const summary = useMemo(() => {
    const income = filteredRows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
    const expense = filteredRows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
    return { income, expense, net: income - expense, count: filteredRows.length, total: txData?.total ?? 0 };
  }, [filteredRows, txData]);

  const hasFilters = !!(filterAccountId || filterType || filterMonth || filterCategory || search);

  const clearFilters = () => {
    setFilterAccountId(undefined);
    setFilterType("");
    setFilterMonth("");
    setFilterCategory("");
    setSearch("");
  };

  // ── Form handlers ──────────────────────────────────────────────────────────
  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    form.reset({
      accountId: tx.accountId,
      date: tx.date.split("T")[0],
      description: tx.description,
      amount: Math.abs(tx.amount),
      type: tx.type,
      category: tx.category,
      notes: tx.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    // If a month filter is active, default to the last day of that month so
    // the new record stays visible in the current filtered view.
    let defaultDate = new Date().toISOString().split("T")[0];
    if (filterMonth) {
      const [y, m] = filterMonth.split("-").map(Number);
      const lastDay = new Date(y, m, 0); // day 0 of next month = last day of this month
      defaultDate = lastDay.toISOString().split("T")[0];
    }
    form.reset({
      accountId: accounts[0]?.id || 0,
      date: defaultDate,
      description: "",
      amount: 0,
      type: "expense",
      category: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: TxFormValues) => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data });
        toast({ title: "Transaction updated" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "Transaction created" });
      }
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setIsDialogOpen(false);
    } catch (error) {
      toast({ title: "Operation failed", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      toast({ title: "Transaction deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground mt-1">View and manage all your financial records.</p>
        </div>
        <Button onClick={handleOpenNew} className="font-semibold shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" />
          Add Record
        </Button>
      </div>

      {/* Period summary bar — only shown when any filter is active */}
      {(hasFilters || filteredRows.length > 0) && !isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Income</p>
                <p className="text-sm font-semibold text-emerald-600 truncate">{formatCurrency(summary.income)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-4 h-4 text-rose-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Expenses</p>
                <p className="text-sm font-semibold text-rose-600 truncate">{formatCurrency(summary.expense)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${summary.net >= 0 ? "bg-primary/10" : "bg-rose-500/10"}`}>
                <Minus className={`w-4 h-4 ${summary.net >= 0 ? "text-primary" : "text-rose-500"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Net</p>
                <p className={`text-sm font-semibold truncate ${summary.net >= 0 ? "text-primary" : "text-rose-600"}`}>
                  {summary.net >= 0 ? "+" : ""}{formatCurrency(Math.abs(summary.net))}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Showing</p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {summary.count} <span className="font-normal text-muted-foreground">/ {summary.total}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main table card */}
      <Card className="flex-1 flex flex-col shadow-sm border-border/50 overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-border/50 flex flex-wrap gap-2 bg-muted/20">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              className="pl-9 bg-card border-border/80 h-9 text-sm"
              placeholder="Search description or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Month filter */}
          <Select value={filterMonth || "all"} onValueChange={(v) => setFilterMonth(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px] bg-card border-border/80 h-9 text-sm">
              <CalendarDays className="w-3.5 h-3.5 mr-1.5 text-muted-foreground flex-shrink-0" />
              <SelectValue placeholder="All months" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">All months</SelectItem>
              {MONTH_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Account filter */}
          <Select
            value={filterAccountId ? String(filterAccountId) : "all"}
            onValueChange={(v) => setFilterAccountId(v === "all" ? undefined : Number(v))}
          >
            <SelectTrigger className="w-[150px] bg-card border-border/80 h-9 text-sm">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type filter */}
          <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[120px] bg-card border-border/80 h-9 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[140px] bg-card border-border/80 h-9 text-sm">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear */}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground gap-1 px-2" onClick={clearFilters}>
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-card sticky top-0 z-10 shadow-sm">
              <TableRow className="border-border/50">
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden sm:table-cell">Account</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(8).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="h-12 bg-muted/20 animate-pulse border-b border-border/30" />
                  </TableRow>
                ))
              ) : filteredRows.length > 0 ? (
                filteredRows.map((tx) => (
                  <TableRow key={tx.id} className="group border-border/30 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(tx.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tx.type === "income"   ? <ArrowUpRight   className="w-4 h-4 text-emerald-500 flex-shrink-0" /> :
                         tx.type === "expense"  ? <ArrowDownRight className="w-4 h-4 text-rose-500    flex-shrink-0" /> :
                                                  <Activity       className="w-4 h-4 text-blue-500    flex-shrink-0" />}
                        <span className="font-medium text-sm leading-tight">{tx.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {accounts.find((a) => a.id === tx.accountId)?.name ?? `Acc #${tx.accountId}`}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="font-normal text-xs bg-muted/70 text-muted-foreground border-transparent">
                        {tx.category}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold text-sm ${
                      tx.type === "income"   ? "text-emerald-600" :
                      tx.type === "expense"  ? "text-rose-600"    : "text-foreground"
                    }`}>
                      {tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}
                      {formatCurrency(tx.amount)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => handleEdit(tx)}>
                            <Pencil className="h-4 w-4 mr-2 text-muted-foreground" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(tx.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {hasFilters ? "No transactions match the current filters." : "No transactions yet. Add one or upload a statement."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="accountId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input placeholder="Vendor, client, or details" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-[260px]">
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Save Changes" : "Create Record"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
