import { Router, type IRouter } from "express";
import { db, transactionsTable, accountsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;

    const conditions = [];
    if (accountId) conditions.push(eq(transactionsTable.accountId, parseInt(accountId)));
    if (startDate) conditions.push(gte(transactionsTable.date, startDate));
    if (endDate) conditions.push(lte(transactionsTable.date, endDate));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [summaryRows, accountsResult, recentRows] = await Promise.all([
      db
        .select({
          type: transactionsTable.type,
          total: sql<number>`sum(${transactionsTable.amount}::numeric)`,
          count: sql<number>`count(*)::int`,
        })
        .from(transactionsTable)
        .where(where)
        .groupBy(transactionsTable.type),
      db.select({ count: sql<number>`count(*)::int` }).from(accountsTable),
      db
        .select()
        .from(transactionsTable)
        .where(where)
        .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
        .limit(5),
    ]);

    const income = summaryRows.find((r) => r.type === "income");
    const expense = summaryRows.find((r) => r.type === "expense");
    const totalCount = summaryRows.reduce((sum, r) => sum + r.count, 0);

    // Get top spending category
    const catRows = await db
      .select({
        category: transactionsTable.category,
        total: sql<number>`sum(${transactionsTable.amount}::numeric)`,
      })
      .from(transactionsTable)
      .where(and(where, eq(transactionsTable.type, "expense")))
      .groupBy(transactionsTable.category)
      .orderBy(sql`sum(${transactionsTable.amount}::numeric) desc`)
      .limit(1);

    const totalIncome = parseFloat(String(income?.total ?? 0));
    const totalExpenses = parseFloat(String(expense?.total ?? 0));

    res.json({
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      transactionCount: totalCount,
      accountsCount: accountsResult[0].count,
      topCategory: catRows[0]?.category ?? null,
      recentTransactions: recentRows.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
    });
  } catch (err) {
    console.error("Error getting dashboard summary:", err);
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

router.get("/dashboard/monthly", async (req, res) => {
  try {
    const { accountId, months = "12" } = req.query as Record<string, string>;
    const numMonths = parseInt(months);

    const conditions = [];
    if (accountId) conditions.push(eq(transactionsTable.accountId, parseInt(accountId)));
    conditions.push(gte(transactionsTable.date, sql`(current_date - interval '${sql.raw(String(numMonths))} months')::date`));
    const where = and(...conditions);

    const rows = await db
      .select({
        month: sql<string>`to_char(${transactionsTable.date}::date, 'YYYY-MM')`,
        type: transactionsTable.type,
        total: sql<number>`sum(${transactionsTable.amount}::numeric)`,
      })
      .from(transactionsTable)
      .where(where)
      .groupBy(sql`to_char(${transactionsTable.date}::date, 'YYYY-MM')`, transactionsTable.type)
      .orderBy(sql`to_char(${transactionsTable.date}::date, 'YYYY-MM')`);

    // Aggregate by month
    const byMonth: Record<string, { income: number; expenses: number }> = {};
    for (const row of rows) {
      if (!byMonth[row.month]) byMonth[row.month] = { income: 0, expenses: 0 };
      if (row.type === "income") byMonth[row.month].income += parseFloat(String(row.total));
      else if (row.type === "expense") byMonth[row.month].expenses += parseFloat(String(row.total));
    }

    const result = Object.entries(byMonth).map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      net: data.income - data.expenses,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error getting monthly data:", err);
    res.status(500).json({ error: "Failed to get monthly data" });
  }
});

router.get("/dashboard/categories", async (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query as Record<string, string>;

    const conditions = [eq(transactionsTable.type, "expense")];
    if (accountId) conditions.push(eq(transactionsTable.accountId, parseInt(accountId)));
    if (startDate) conditions.push(gte(transactionsTable.date, startDate));
    if (endDate) conditions.push(lte(transactionsTable.date, endDate));
    const where = and(...conditions);

    const rows = await db
      .select({
        category: transactionsTable.category,
        amount: sql<number>`sum(${transactionsTable.amount}::numeric)`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(where)
      .groupBy(transactionsTable.category)
      .orderBy(sql`sum(${transactionsTable.amount}::numeric) desc`);

    const totalAmount = rows.reduce((sum, r) => sum + parseFloat(String(r.amount)), 0);

    const result = rows.map((r) => {
      const amount = parseFloat(String(r.amount));
      return {
        category: r.category,
        amount,
        count: r.count,
        percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 10000) / 100 : 0,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Error getting category breakdown:", err);
    res.status(500).json({ error: "Failed to get category breakdown" });
  }
});

export default router;
