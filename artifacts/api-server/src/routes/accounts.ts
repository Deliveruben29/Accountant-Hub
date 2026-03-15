import { Router, type IRouter } from "express";
import { db, accountsTable, transactionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { CreateAccountBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/accounts", async (_req, res) => {
  try {
    const accounts = await db.select().from(accountsTable).orderBy(accountsTable.createdAt);
    const formatted = accounts.map((a) => ({
      ...a,
      balance: parseFloat(a.balance),
    }));
    res.json(formatted);
  } catch (err) {
    console.error("Error listing accounts:", err);
    res.status(500).json({ error: "Failed to list accounts" });
  }
});

router.post("/accounts", async (req, res) => {
  try {
    const body = CreateAccountBody.parse(req.body);
    const [account] = await db
      .insert(accountsTable)
      .values({
        name: body.name,
        type: body.type,
        currency: body.currency ?? "CHF",
        balance: String(body.balance ?? 0),
        description: body.description ?? null,
      })
      .returning();
    res.status(201).json({ ...account, balance: parseFloat(account.balance) });
  } catch (err) {
    console.error("Error creating account:", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.put("/accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const body = req.body as Partial<{ name: string; type: string; currency: string; balance: number; description: string }>;
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.type !== undefined) updates.type = body.type;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.balance !== undefined) updates.balance = String(body.balance);
    if (body.description !== undefined) updates.description = body.description;
    if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    const [updated] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Account not found" }); return; }
    res.json({ ...updated, balance: parseFloat(updated.balance) });
  } catch (err) {
    console.error("Error updating account:", err);
    res.status(500).json({ error: "Failed to update account" });
  }
});

router.post("/accounts/:id/recalculate", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    // Fix legacy misclassification: statement-imported "transfer" transactions were
    // card reloads (negative amounts in TBF format = money coming in = income)
    const fixed = await db
      .update(transactionsTable)
      .set({ type: "income" })
      .where(
        and(
          eq(transactionsTable.accountId, id),
          eq(transactionsTable.type, "transfer"),
          eq(transactionsTable.importedFromStatement, true)
        )
      )
      .returning();

    // Recalculate balance from all transactions (idempotent)
    const [updated] = await db
      .update(accountsTable)
      .set({
        balance: sql`(
          SELECT COALESCE(SUM(
            CASE WHEN ${transactionsTable.type} = 'income'
              THEN ${transactionsTable.amount}::numeric
              ELSE -${transactionsTable.amount}::numeric
            END
          ), 0)
          FROM ${transactionsTable}
          WHERE ${transactionsTable.accountId} = ${id}
        )`,
      })
      .where(eq(accountsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Account not found" }); return; }
    res.json({ ...updated, balance: parseFloat(updated.balance), fixedTransactions: fixed.length });
  } catch (err) {
    console.error("Error recalculating balance:", err);
    res.status(500).json({ error: "Failed to recalculate balance" });
  }
});

router.delete("/accounts/:id/transactions", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const deleted = await db
      .delete(transactionsTable)
      .where(eq(transactionsTable.accountId, id))
      .returning({ id: transactionsTable.id });
    // Reset balance to 0
    await db.update(accountsTable).set({ balance: "0" }).where(eq(accountsTable.id, id));
    res.json({ deleted: deleted.length });
  } catch (err) {
    console.error("Error clearing transactions:", err);
    res.status(500).json({ error: "Failed to clear transactions" });
  }
});

router.delete("/accounts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(accountsTable).where(eq(accountsTable.id, id));
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting account:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
