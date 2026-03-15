import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Landmark, Plus, CreditCard, PiggyBank, Landmark as InvestmentIcon, Building, RefreshCw } from "lucide-react";
import { 
  useListAccounts, 
  useCreateAccount,
  AccountType
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAccountsQueryKey } from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

const accountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  type: z.enum([AccountType.checking, AccountType.savings, AccountType.credit, AccountType.investment, AccountType.other]),
  currency: z.string().default("CHF"),
  balance: z.coerce.number().default(0),
  description: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const createMutation = useCreateAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recalculating, setRecalculating] = useState<number | null>(null);

  const recalculateBalance = async (accountId: number) => {
    setRecalculating(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/recalculate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      const msg = data.fixedTransactions > 0
        ? `Balance updated. Also fixed ${data.fixedTransactions} transaction(s) from "transfer" to "income".`
        : "Balance recalculated from all transactions.";
      toast({ title: "Balance recalculated", description: msg });
    } catch {
      toast({ title: "Recalculation failed", variant: "destructive" });
    } finally {
      setRecalculating(null);
    }
  };

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      type: "checking",
      currency: "CHF",
      balance: 0,
      description: "",
    }
  });

  const onSubmit = async (data: AccountFormValues) => {
    try {
      await createMutation.mutateAsync({ data });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      toast({ title: "Account created successfully" });
      setIsDialogOpen(false);
      form.reset();
    } catch (error) {
      toast({ title: "Failed to create account", variant: "destructive" });
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'checking': return <Building className="w-5 h-5" />;
      case 'savings': return <PiggyBank className="w-5 h-5" />;
      case 'credit': return <CreditCard className="w-5 h-5" />;
      case 'investment': return <InvestmentIcon className="w-5 h-5" />;
      default: return <Landmark className="w-5 h-5" />;
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage your bank accounts and credit cards.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-semibold shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform duration-200">
              <Plus className="w-4 h-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Account</DialogTitle>
              <DialogDescription>
                Create a new financial account to track transactions.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Business Checking" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="checking">Checking</SelectItem>
                            <SelectItem value="savings">Savings</SelectItem>
                            <SelectItem value="credit">Credit Card</SelectItem>
                            <SelectItem value="investment">Investment</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="CHF">CHF (Fr.)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="GBP">GBP (£)</SelectItem>
                            <SelectItem value="JPY">JPY (¥)</SelectItem>
                            <SelectItem value="CAD">CAD ($)</SelectItem>
                            <SelectItem value="AUD">AUD ($)</SelectItem>
                            <SelectItem value="SEK">SEK (kr)</SelectItem>
                            <SelectItem value="NOK">NOK (kr)</SelectItem>
                            <SelectItem value="DKK">DKK (kr)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Starting Balance</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Account"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse h-48" />
          ))
        ) : accounts?.length ? (
          accounts.map((account, index) => (
            <motion.div 
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="shadow-sm border-border/50 hover:shadow-lg transition-all duration-300 group h-full flex flex-col relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/80 group-hover:bg-primary transition-colors" />
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                      {account.name}
                    </CardTitle>
                    <Badge variant="outline" className="capitalize text-xs font-normal">
                      {account.type}
                    </Badge>
                  </div>
                  <div className="p-2 bg-muted rounded-lg text-primary">
                    {getAccountIcon(account.type)}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 mt-4">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Current Balance</p>
                  <div className="text-3xl font-display font-bold tracking-tight text-foreground">
                    {formatCurrency(account.balance, account.currency)}
                  </div>
                </CardContent>
                <CardFooter className="pt-0 pb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    disabled={recalculating === account.id}
                    onClick={() => recalculateBalance(account.id)}
                  >
                    <RefreshCw className={`w-3 h-3 mr-1.5 ${recalculating === account.id ? "animate-spin" : ""}`} />
                    {recalculating === account.id ? "Recalculating…" : "Fix & Recalculate Balance"}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-16 text-center bg-card rounded-2xl border border-dashed border-border flex flex-col items-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Landmark className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No accounts yet</h3>
            <p className="text-muted-foreground max-w-sm mt-1">Add your first checking or savings account to start tracking your finances.</p>
            <Button className="mt-6" onClick={() => setIsDialogOpen(true)}>Add Account</Button>
          </div>
        )}
      </div>
    </div>
  );
}
