import { Router, type IRouter, Request, Response } from "express";
import { db, transactionsTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  category: string;
  reference?: string;
}

function guessCategory(description: string, amount: number): string {
  const desc = description.toLowerCase();
  if (desc.includes("salary") || desc.includes("payroll") || desc.includes("wage")) return "Salary";
  if (desc.includes("rent") || desc.includes("lease") || desc.includes("mortgage")) return "Rent";
  if (desc.includes("electric") || desc.includes("water") || desc.includes("gas") || desc.includes("utility") || desc.includes("internet")) return "Utilities";
  if (desc.includes("food") || desc.includes("restaurant") || desc.includes("cafe") || desc.includes("grocery") || desc.includes("supermarket")) return "Food";
  if (desc.includes("transport") || desc.includes("taxi") || desc.includes("uber") || desc.includes("train") || desc.includes("flight") || desc.includes("fuel")) return "Travel";
  if (desc.includes("tax") || desc.includes("vat") || desc.includes("iva")) return "Tax";
  if (desc.includes("insurance")) return "Insurance";
  if (desc.includes("office") || desc.includes("supplies") || desc.includes("stationery")) return "Office Supplies";
  if (desc.includes("software") || desc.includes("subscription") || desc.includes("license")) return "Software";
  if (desc.includes("health") || desc.includes("medical") || desc.includes("pharmacy") || desc.includes("doctor")) return "Healthcare";
  if (desc.includes("entertainment") || desc.includes("cinema") || desc.includes("sport")) return "Entertainment";
  if (desc.includes("sales") || desc.includes("invoice") || desc.includes("payment received")) return "Sales";
  if (desc.includes("refund") || desc.includes("reimbursement")) return "Refund";
  return amount > 0 ? "Income" : "Other";
}

function parseDateFlexible(raw: string): string | null {
  if (!raw) return null;
  // Try ISO format
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return raw.slice(0, 10);
  // Try DD/MM/YYYY or DD-MM-YYYY
  const euMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (euMatch) return `${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;
  // Try MM/DD/YYYY
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  return null;
}

function parseCsvStatement(buffer: Buffer): ParsedRow[] {
  const text = buffer.toString("utf-8");
  let records: Record<string, string>[];
  try {
    records = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch {
    return [];
  }

  const rows: ParsedRow[] = [];
  for (const rec of records) {
    const keys = Object.keys(rec).map((k) => k.toLowerCase());

    const dateKey = keys.find((k) => k.includes("date") || k === "datum" || k === "data");
    const descKey = keys.find((k) => k.includes("desc") || k.includes("narr") || k.includes("detail") || k.includes("concept") || k.includes("memo") || k.includes("note"));
    const amountKey = keys.find((k) => k.includes("amount") || k.includes("importe") || k.includes("value") || k === "credit" || k === "debit" || k === "importe");
    const creditKey = keys.find((k) => k === "credit" || k.includes("credit") || k.includes("inflow") || k.includes("income"));
    const debitKey = keys.find((k) => k === "debit" || k.includes("debit") || k.includes("outflow") || k.includes("expense"));
    const refKey = keys.find((k) => k.includes("ref") || k.includes("id") || k.includes("transaction"));

    const getRaw = (key: string | undefined) => (key ? rec[Object.keys(rec).find((k) => k.toLowerCase() === key) ?? ""] ?? "" : "");

    const rawDate = getRaw(dateKey);
    const parsedDate = parseDateFlexible(rawDate);
    if (!parsedDate) continue;

    const desc = getRaw(descKey) || "Imported transaction";

    let amount = 0;
    let type: "income" | "expense" | "transfer" = "expense";

    if (creditKey && debitKey) {
      const credit = parseFloat(getRaw(creditKey).replace(/[, ]/g, "") || "0");
      const debit = parseFloat(getRaw(debitKey).replace(/[, ]/g, "") || "0");
      if (credit > 0) { amount = credit; type = "income"; }
      else if (debit > 0) { amount = debit; type = "expense"; }
      else continue;
    } else if (amountKey) {
      const raw = getRaw(amountKey).replace(/[, ]/g, "");
      amount = parseFloat(raw);
      if (isNaN(amount)) continue;
      if (amount > 0) type = "income";
      else { amount = Math.abs(amount); type = "expense"; }
    } else {
      continue;
    }

    rows.push({
      date: parsedDate,
      description: desc,
      amount,
      type,
      category: guessCategory(desc, type === "income" ? amount : -amount),
      reference: getRaw(refKey) || undefined,
    });
  }
  return rows;
}

router.post("/statements/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const accountId = parseInt((req.body as { accountId?: string }).accountId ?? "");
    if (isNaN(accountId)) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }

    const account = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
    if (!account.length) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    let rows: ParsedRow[] = [];

    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      rows = parseCsvStatement(file.buffer);
    } else if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      // For PDFs we use a simple text extraction approach
      // In production you'd use pdf-parse or similar; here we return a helpful message
      // We'll try to extract text from the PDF buffer as a best-effort
      const text = file.buffer.toString("latin1");
      // PDF text extraction is complex; we'll attempt basic line extraction
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 5);
      // Heuristic: look for lines with dates and amounts
      for (const line of lines) {
        const dateMatch = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}-\d{2}-\d{2})/);
        const amountMatch = line.match(/(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/);
        if (dateMatch && amountMatch) {
          const parsedDate = parseDateFlexible(dateMatch[1]);
          if (!parsedDate) continue;
          const amountStr = amountMatch[1].replace(/\./g, "").replace(",", ".");
          const amount = parseFloat(amountStr);
          if (isNaN(amount)) continue;
          const desc = line.replace(dateMatch[0], "").replace(amountMatch[0], "").replace(/\s+/g, " ").trim() || "Imported transaction";
          const absAmount = Math.abs(amount);
          const type: "income" | "expense" = amount > 0 ? "income" : "expense";
          rows.push({ date: parsedDate, description: desc, amount: absAmount, type, category: guessCategory(desc, amount) });
        }
      }
    } else {
      res.status(400).json({ error: "Unsupported file type. Please upload a CSV or PDF file." });
      return;
    }

    if (rows.length === 0) {
      res.json({ imported: 0, skipped: 0, transactions: [], message: "No transactions could be parsed from the file. Ensure your CSV has date, description, and amount columns." });
      return;
    }

    const inserted = await db
      .insert(transactionsTable)
      .values(
        rows.map((r) => ({
          accountId,
          date: r.date,
          description: r.description,
          amount: String(r.amount),
          type: r.type,
          category: r.category,
          reference: r.reference ?? null,
          importedFromStatement: true,
        }))
      )
      .returning();

    // Update account balance
    const incomeTotal = rows.filter((r) => r.type === "income").reduce((sum, r) => sum + r.amount, 0);
    const expenseTotal = rows.filter((r) => r.type === "expense").reduce((sum, r) => sum + r.amount, 0);
    const net = incomeTotal - expenseTotal;
    if (net !== 0) {
      await db
        .update(accountsTable)
        .set({ balance: sql`${accountsTable.balance} + ${String(net)}` })
        .where(eq(accountsTable.id, accountId));
    }

    res.json({
      imported: inserted.length,
      skipped: rows.length - inserted.length,
      transactions: inserted.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
    });
  } catch (err) {
    console.error("Error uploading statement:", err);
    res.status(500).json({ error: "Failed to process statement" });
  }
});

export default router;
