import { Router, type IRouter } from "express";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
        currency: body.currency ?? "EUR",
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
