import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Filter, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/format";

const CATEGORIES = ["Salary", "Sales", "Office Supplies", "Rent", "Utilities", "Travel", "Food", "Healthcare", "Entertainment", "Tax", "Other"];

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

export default function Transactions() {
  const [page] = useState(0);
  const [filterAccountId, setFilterAccountId] = useState<number | undefined>(undefined);
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: accountsData } = useListAccounts();
  const { data: txData, isLoading } = useListTransactions({
    offset: page * 100,
    limit: 100,
    ...(filterAccountId ? { accountId: filterAccountId } : {}),
    ...(filterType ? { type: filterType } : {}),
  });
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<TxFormValues>({
    resolver: zodResolver(txSchema),
    defaultValues: {
      accountId: 0,
      date: new Date().toISOString().split('T')[0],
      description: "",
      amount: 0,
      type: "expense",
      category: "",
      notes: "",
    }
  });

  const accounts = accountsData || [];

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    form.reset({
      accountId: tx.accountId,
      date: tx.date.split('T')[0],
      description: tx.description,
      amount: Math.abs(tx.amount), // Form expects positive number
      type: tx.type,
      category: tx.category,
      notes: tx.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleOpenNew = () => {
    setEditingId(null);
    form.reset({
      accountId: accounts[0]?.id || 0,
      date: new Date().toISOString().split('T')[0],
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
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground mt-1">View and manage all your financial records.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button onClick={handleOpenNew} className="font-semibold shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" />
            Add Record
          </Button>
          
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account</FormLabel>
                        <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {accounts.map(acc => (
                              <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Vendor, client, or details" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="expense">Expense</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

      <Card className="flex-1 flex flex-col shadow-sm border-border/50 overflow-hidden">
        <div className="p-4 border-b border-border/50 flex flex-wrap gap-3 bg-muted/20">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              className="pl-9 bg-card border-border/80"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterAccountId ? String(filterAccountId) : "all"} onValueChange={(v) => setFilterAccountId(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-[160px] bg-card border-border/80">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[130px] bg-card border-border/80">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          {(filterAccountId || filterType || search) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setFilterAccountId(undefined); setFilterType(""); setSearch(""); }}>
              <Filter className="w-3 h-3 mr-1" /> Clear filters
            </Button>
          )}
        </div>
        
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-card sticky top-0 z-10 shadow-sm">
              <TableRow className="border-border/50">
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6} className="h-14 bg-muted/20 animate-pulse border-b border-border/30" />
                  </TableRow>
                ))
              ) : txData?.data && txData.data.length > 0 ? (
                txData.data
                .filter(tx => !search || tx.description.toLowerCase().includes(search.toLowerCase()))
                .map((tx) => (
                  <TableRow key={tx.id} className="group border-border/30 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tx.type === 'income' ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : 
                         tx.type === 'expense' ? <ArrowDownRight className="w-4 h-4 text-rose-500" /> : <Activity className="w-4 h-4 text-blue-500" />}
                        <span className="font-medium">{tx.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {accounts.find(a => a.id === tx.accountId)?.name || `Acc #${tx.accountId}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground border-transparent">
                        {tx.category}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${
                      tx.type === 'income' ? 'text-emerald-600' :
                      tx.type === 'expense' ? 'text-rose-600' : 'text-foreground'
                    }`}>
                      {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="sr-only">Open menu</span>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
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
                    No transactions found. Add one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
