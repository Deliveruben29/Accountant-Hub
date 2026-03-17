// @ts-nocheck
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/users", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(users);
  } catch (err) {
    console.error("Error listing users:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.patch("/users/:id/role", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { id } = req.params;
  const { role } = req.body as { role: string };
  if (!["admin", "user"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'user'" });
    return;
  }
  if (id === req.user.id) {
    res.status(400).json({ error: "Cannot change your own role" });
    return;
  }
  try {
    const [updated] = await db
      .update(usersTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("Error updating role:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.patch("/users/me/language", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { language } = req.body as { language: string };
  if (!["en", "es", "de"].includes(language)) {
    res.status(400).json({ error: "Language must be en, es, or de" });
    return;
  }
  try {
    const [updated] = await db
      .update(usersTable)
      .set({ language, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user.id))
      .returning();
    // Update all sessions for this user to reflect new language
    const allSessions = await db.select().from(sessionsTable);
    for (const s of allSessions) {
      const sess = s.sess as { user?: { id?: string; language?: string } };
      if (sess?.user?.id === req.user.id) {
        sess.user.language = language;
        await db.update(sessionsTable).set({ sess: sess as Record<string, unknown> }).where(eq(sessionsTable.sid, s.sid));
      }
    }
    res.json({ language: updated.language });
  } catch (err) {
    console.error("Error updating language:", err);
    res.status(500).json({ error: "Failed to update language" });
  }
});

router.get("/users/stats", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(usersTable);
    const [{ admins }] = await db
      .select({ admins: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    res.json({ total, admins, users: total - admins });
  } catch (err) {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

export default router;
