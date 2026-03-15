import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Wallet, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useGetDashboardSummary, useGetMonthlyData, useGetCategoryBreakdown } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Badge } from "@/components/ui/badge";

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: monthlyData, isLoading: loadingMonthly } = useGetMonthlyData({ months: 6 });
  const { data: categoryData, isLoading: loadingCategories } = useGetCategoryBreakdown();

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
    >
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Financial Overview</h1>
        <p className="text-muted-foreground mt-1">Your accounts at a glance.</p>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {loadingSummary ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i} className="animate-pulse shadow-sm"><CardContent className="h-28" /></Card>
          ))
        ) : summary ? (
          <>
            <motion.div variants={itemVariants}>
              <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Net Balance</CardTitle>
                  <Wallet className="w-4 h-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{formatCurrency(summary.netBalance)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Across {summary.accountsCount} accounts</p>
                </CardContent>
              </Card>
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display text-emerald-600">{formatCurrency(summary.totalIncome)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Based on recent activity</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
                  <ArrowDownRight className="w-4 h-4 text-rose-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display text-rose-600">{formatCurrency(summary.totalExpenses)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Based on recent activity</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
                  <Activity className="w-4 h-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{summary.transactionCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Recorded to date</p>
                </CardContent>
              </Card>
            </motion.div>
          </>
        ) : null}
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <Card className="shadow-sm border-border/50 h-full flex flex-col">
            <CardHeader>
              <CardTitle>Income vs Expenses</CardTitle>
              <CardDescription>Last 6 months trailing</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-6 min-h-[300px]">
              {loadingMonthly ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
              ) : monthlyData && monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `€${val/1000}k`} />
                    <RechartsTooltip 
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(val: number) => formatCurrency(val)}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="income" name="Income" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="shadow-sm border-border/50 h-full flex flex-col">
            <CardHeader>
              <CardTitle>Expense Categories</CardTitle>
              <CardDescription>Where your money is going</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-6 min-h-[300px]">
              {loadingCategories ? (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
              ) : categoryData && categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="category"
                      stroke="none"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(val: number) => formatCurrency(val)}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={itemVariants}>
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="space-y-4">
                {Array(3).fill(0).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}
              </div>
            ) : summary?.recentTransactions && summary.recentTransactions.length > 0 ? (
              <div className="space-y-4">
                {summary.recentTransactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' :
                        tx.type === 'expense' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {tx.type === 'income' ? <ArrowUpRight className="w-5 h-5" /> : 
                         tx.type === 'expense' ? <ArrowDownRight className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(tx.date)} &bull; {tx.category}</p>
                      </div>
                    </div>
                    <div className={`font-semibold font-mono ${
                      tx.type === 'income' ? 'text-emerald-600' :
                      tx.type === 'expense' ? 'text-rose-600' : 'text-foreground'
                    }`}>
                      {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recent transactions found.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
