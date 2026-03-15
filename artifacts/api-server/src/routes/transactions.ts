import { Router, type IRouter } from "express";
import { db, transactionsTable, accountsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { CreateTransactionBody, UpdateTransactionBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    amount: parseFloat(t.amount),
  };
}

router.get("/transactions", async (req, res) => {
  try {
    const { accountId, category, type, startDate, endDate, limit = "100", offset = "0" } = req.query as Record<string, string>;

    const conditions = [];
    if (accountId) conditions.push(eq(transactionsTable.accountId, parseInt(accountId)));
    if (category) conditions.push(eq(transactionsTable.category, category));
    if (type) conditions.push(eq(transactionsTable.type, type));
    if (startDate) conditions.push(gte(transactionsTable.date, startDate));
    if (endDate) conditions.push(lte(transactionsTable.date, endDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable).where(where),
      db
        .select()
        .from(transactionsTable)
        .where(where)
        .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
    ]);

    res.json({
      data: rows.map(formatTransaction),
      total: countResult[0].count,
      offset: parseInt(offset),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error("Error listing transactions:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Failed to list transactions" });
  }
});

router.post("/transactions", async (req, res) => {
  try {
    const body = CreateTransactionBody.parse(req.body);
    const [transaction] = await db
      .insert(transactionsTable)
      .values({
        accountId: body.accountId,
        date: body.date,
        description: body.description,
        amount: String(body.amount),
        type: body.type,
        category: body.category,
        notes: body.notes ?? null,
        reference: body.reference ?? null,
        importedFromStatement: false,
      })
      .returning();

    // Update account balance
    const multiplier = body.type === "income" ? 1 : -1;
    await db
      .update(accountsTable)
      .set({ balance: sql`${accountsTable.balance} + ${String(body.amount * multiplier)}` })
      .where(eq(accountsTable.id, body.accountId));

    res.status(201).json(formatTransaction(transaction));
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("Error creating transaction:", msg);
    res.status(400).json({ error: msg });
  }
});

router.put("/transactions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = UpdateTransactionBody.parse(req.body);

    const updateData: Record<string, unknown> = {};
    if (body.date !== undefined) updateData.date = body.date;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.amount !== undefined) updateData.amount = String(body.amount);
    if (body.type !== undefined) updateData.type = body.type;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.reference !== undefined) updateData.reference = body.reference;

    const [updated] = await db
      .update(transactionsTable)
      .set(updateData)
      .where(eq(transactionsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    res.json(formatTransaction(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("Error updating transaction:", msg);
    res.status(400).json({ error: msg });
  }
});

router.delete("/transactions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(transactionsTable).where(eq(transactionsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting transaction:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

export default router;
