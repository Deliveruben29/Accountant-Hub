import { Router, type IRouter, Request, Response } from "express";
import { db, transactionsTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
// pdf-parse v2 uses a class-based API: new PDFParse({ data: buffer }).getText()
// Dynamic import works in both ESM (tsx dev) and esbuild CJS (production bundle)
async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("pdf-parse");
  // v2 exports PDFParse as a named export; handle both ESM wrapper and raw CJS
  const PDFParse = mod.PDFParse ?? mod.default?.PDFParse;
  if (typeof PDFParse !== "function") {
    throw new Error(`pdf-parse PDFParse not found. Module keys: ${Object.keys(mod).join(", ")}`);
  }
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

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

// Map statement category names to our internal category names
const CATEGORY_MAP: Record<string, string> = {
  transfer: "Transfer",
  traspaso: "Transfer",
  personal: "Entertainment",
  transport: "Travel",
  household: "Household",
  leisure: "Entertainment",
  "it services": "Software",
  "hotel booking": "Travel",
  viajes: "Travel",
  salary: "Salary",
  sales: "Sales",
  rent: "Rent",
  utilities: "Utilities",
  insurance: "Insurance",
  healthcare: "Healthcare",
  tax: "Tax",
  "office supplies": "Office Supplies",
  refund: "Refund",
};

function mapCategory(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  return CATEGORY_MAP[key] ?? null;
}

function guessCategory(description: string, isExpense: boolean): string {
  const desc = description.toLowerCase();
  if (desc.includes("salary") || desc.includes("payroll") || desc.includes("wage") || desc.includes("nomina")) return "Salary";
  if (desc.includes("rent") || desc.includes("lease") || desc.includes("mortgage") || desc.includes("alquiler")) return "Rent";
  if (desc.includes("electric") || desc.includes("water") || desc.includes("utility") || desc.includes("internet") || desc.includes("telefon")) return "Utilities";
  if (desc.includes("restaurant") || desc.includes("cafe") || desc.includes("grocery") || desc.includes("supermarket") || desc.includes("mercadona") || desc.includes("aldi") || desc.includes("lidl") || desc.includes("dallmayr")) return "Food";
  if (desc.includes("flight") || desc.includes("train") || desc.includes("taxi") || desc.includes("uber") || desc.includes("sbb") || desc.includes("swiss air") || desc.includes("flixbus") || desc.includes("trainline") || desc.includes("transport") || desc.includes("getyourguide")) return "Travel";
  if (desc.includes("hotel") || desc.includes("booking.com") || desc.includes("airbnb")) return "Travel";
  if (desc.includes("tax") || desc.includes("vat") || desc.includes("iva")) return "Tax";
  if (desc.includes("insurance") || desc.includes("seguro")) return "Insurance";
  if (desc.includes("replit") || desc.includes("anthropic") || desc.includes("google") || desc.includes("saas") || desc.includes("software") || desc.includes("capcut") || desc.includes("envato") || desc.includes("paypal") || desc.includes("viggle") || desc.includes("lipsync") || desc.includes("personality") || desc.includes("surfshark") || desc.includes("landr") || desc.includes("ardour")) return "Software";
  if (desc.includes("tinder") || desc.includes("dating") || desc.includes("parship")) return "Entertainment";
  if (desc.includes("health") || desc.includes("medical") || desc.includes("pharmacy") || desc.includes("doctor") || desc.includes("farmacia")) return "Healthcare";
  if (desc.includes("card reload") || desc.includes("transfer") || desc.includes("traspaso")) return "Transfer";
  if (desc.includes("night") || desc.includes("leisure") || desc.includes("cinema") || desc.includes("club") || desc.includes("bar")) return "Entertainment";
  if (desc.includes("furniture") || desc.includes("matratzen") || desc.includes("ikea")) return "Household";
  if (desc.includes("vpn")) return "Software";
  return isExpense ? "Other" : "Income";
}

function parseDateFlexible(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();
  // ISO: YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return raw.slice(0, 10);
  // EU: D/M/YYYY or DD/MM/YYYY or with - or .
  const euMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (euMatch) return `${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;
  return null;
}

// Parse a currency amount like CHF50.00, -CHF50.00, -EUR1,234.56, $50, etc.
function parseCurrencyAmount(raw: string): { amount: number; negative: boolean } | null {
  const match = raw.trim().match(/^(-?)\s*(?:[A-Z]{2,3}|[$€£¥])\s*(-?)([0-9]{1,3}(?:[,.']\d{3})*(?:[.,]\d{1,2})?)$/i);
  if (!match) return null;
  const negative = match[1] === "-" || match[2] === "-";
  let numStr = match[3];
  // Determine decimal separator
  const lastDot = numStr.lastIndexOf(".");
  const lastComma = numStr.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // European: 1.234,56
      numStr = numStr.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56
      numStr = numStr.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const parts = numStr.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      numStr = numStr.replace(",", ".");
    } else {
      numStr = numStr.replace(/,/g, "");
    }
  } else if (lastDot !== -1) {
    const parts = numStr.split(".");
    // If decimal part has 3 digits it's a thousand separator (1.234)
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
      numStr = numStr.replace(/\./g, "");
    }
  }
  const amount = parseFloat(numStr);
  if (isNaN(amount)) return null;
  return { amount, negative };
}

// ─── PDF PARSER ─────────────────────────────────────────────────────────────

// Detect lines that are header rows (contain column name keywords)
const HEADER_KEYWORDS = /ID_Transacción|Fecha|Concepto|Categoría|Entidad|Ingreso|Gasto|Date|Description|Amount|Balance|Debit|Credit/i;

// Known category words found in typical statement formats — matched as words within a line
const KNOWN_CATEGORY_PATTERN = /\b(IT Services|Hotel Booking|Office Supplies|Transfer|Traspaso|Personal|Transport|Household|Leisure|Viajes|Salary|Rent|Utilities|Insurance|Healthcare|Tax|Refund|Sales)\b/gi;

function parsePdfText(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 3);

  for (const line of lines) {
    // Skip header lines
    if (HEADER_KEYWORDS.test(line)) continue;

    // Find a date in the line (D/M/YYYY or DD/MM/YYYY or YYYY-MM-DD)
    const dateMatch = line.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    if (!dateMatch) continue;
    const parsedDate = parseDateFlexible(dateMatch[1]);
    if (!parsedDate) continue;

    // Find a currency amount in the line (handles CHF, EUR, USD, GBP, $, €, £)
    const amountMatch = line.match(/(-?)\s*(CHF|EUR|USD|GBP|[$€£¥])\s*(-?)(\d{1,3}(?:[,.']\d{3})*(?:[.,]\d{1,2})?)/i);
    if (!amountMatch) continue;

    const isNegative = amountMatch[1] === "-" || amountMatch[3] === "-";
    let numStr = amountMatch[4];

    // Normalize decimal/thousand separators
    const lastDot = numStr.lastIndexOf(".");
    const lastComma = numStr.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) {
      numStr = lastComma > lastDot
        ? numStr.replace(/\./g, "").replace(",", ".")
        : numStr.replace(/,/g, "");
    } else if (lastComma !== -1) {
      const parts = numStr.split(",");
      numStr = (parts.length === 2 && parts[1].length <= 2)
        ? numStr.replace(",", ".")
        : numStr.replace(/,/g, "");
    } else if (lastDot !== -1) {
      const parts = numStr.split(".");
      if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
        numStr = numStr.replace(/\./g, "");
      }
    }
    const amount = parseFloat(numStr);
    if (isNaN(amount) || amount === 0) continue;

    // Extract reference ID (e.g. TBF-001, REF-1234)
    const refMatch = line.match(/\b([A-Z]{2,6}-\d{3,})/i);
    const reference = refMatch ? refMatch[1] : undefined;

    // Strip date, amount (with currency), reference, and month names from the line
    const MONTH_NAMES = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
    let remaining = line
      .replace(dateMatch[0], "")
      .replace(amountMatch[0], "")
      .replace(MONTH_NAMES, "")
      .replace(refMatch ? refMatch[0] : "", "")
      .replace(/\s+/g, " ")
      .trim();

    // Find a known category word within the remaining text (word-boundary match)
    KNOWN_CATEGORY_PATTERN.lastIndex = 0;
    const catMatch = KNOWN_CATEGORY_PATTERN.exec(remaining);
    let category: string | null = null;
    if (catMatch) {
      category = mapCategory(catMatch[1]);
      // Remove only that single category word from the remaining description
      remaining = remaining.replace(catMatch[0], "").replace(/\s+/g, " ").trim();
    }

    const description = remaining || "Imported transaction";

    // Determine type:
    //   Negative amount = money coming INTO the account (card reload, salary, refund) → income
    //   Positive amount = money going OUT (purchase, fee) → expense (unless clearly income by description)
    let type: "income" | "expense" | "transfer";
    if (isNegative) {
      type = "income";
    } else {
      const descLower = description.toLowerCase();
      const isIncome = descLower.includes("salary") || descLower.includes("wage") || descLower.includes("nomina")
        || descLower.includes("payment received") || descLower.includes("income")
        || category === "Salary" || category === "Sales";
      type = isIncome ? "income" : "expense";
    }

    if (!category) {
      category = guessCategory(description, type !== "income");
    }

    rows.push({ date: parsedDate, description, amount, type, category, reference });
  }

  return rows;
}

// ─── CSV PARSER ─────────────────────────────────────────────────────────────

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
    const originalKeys = Object.keys(rec);
    const keyMap: Record<string, string> = {};
    for (const k of originalKeys) keyMap[k.toLowerCase().trim()] = k;

    const getKey = (test: (k: string) => boolean) => Object.keys(keyMap).find(test);
    const getVal = (k: string | undefined) => (k ? rec[keyMap[k]] ?? "" : "").trim();

    const dateKey = getKey((k) => /fecha|date|datum|data/.test(k));
    const descKey = getKey((k) => /concepto|descripci|desc|narr|detail|memo|note/.test(k));
    const catKey = getKey((k) => /categor/.test(k));
    const refKey = getKey((k) => /id_trans|id|ref|transac/.test(k));
    const providerKey = getKey((k) => /entidad|proveedor|provider|merchant/.test(k));
    const amountKey = getKey((k) => /ingreso|gasto|importe|amount|value/.test(k));
    const creditKey = getKey((k) => k === "credit" || /inflow|income/.test(k));
    const debitKey = getKey((k) => k === "debit" || /outflow|expense/.test(k));

    const rawDate = getVal(dateKey);
    const parsedDate = parseDateFlexible(rawDate);
    if (!parsedDate) continue;

    const concept = getVal(descKey);
    const provider = getVal(providerKey);
    const description = [concept, provider].filter(Boolean).join(" – ") || "Imported transaction";
    const rawCategory = getVal(catKey);
    const reference = getVal(refKey) || undefined;

    let amount = 0;
    let type: "income" | "expense" | "transfer" = "expense";

    if (creditKey && debitKey) {
      const creditRaw = getVal(creditKey).replace(/[^\d.,-]/g, "");
      const debitRaw = getVal(debitKey).replace(/[^\d.,-]/g, "");
      const credit = parseFloat(creditRaw || "0");
      const debit = parseFloat(debitRaw || "0");
      if (credit > 0) { amount = credit; type = "income"; }
      else if (debit > 0) { amount = debit; type = "expense"; }
      else continue;
    } else if (amountKey) {
      // Strip currency prefix then parse
      const rawAmt = getVal(amountKey).replace(/[A-Z]{2,3}/gi, "").trim();
      const numStr = rawAmt.replace(/[^\d.,-]/g, "");
      // Detect sign
      const negative = rawAmt.startsWith("-") || getVal(amountKey).trimStart().startsWith("-");
      const parsed = parseFloat(numStr.replace(",", "."));
      if (isNaN(parsed) || parsed === 0) continue;
      amount = Math.abs(parsed);
      type = negative ? "transfer" : "expense";
      // Check for explicit income indicators
      const descLower = description.toLowerCase();
      if (!negative && (descLower.includes("salary") || descLower.includes("income") || descLower.includes("payment received"))) {
        type = "income";
      }
    } else {
      continue;
    }

    // Resolve category: use statement's own category first, then guess
    const category = mapCategory(rawCategory) ?? guessCategory(description, type !== "income");

    rows.push({ date: parsedDate, description, amount, type, category, reference });
  }
  return rows;
}

// ─── UPLOAD ROUTE ────────────────────────────────────────────────────────────

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
    const ext = file.originalname.toLowerCase();

    if (file.mimetype === "text/csv" || ext.endsWith(".csv")) {
      rows = parseCsvStatement(file.buffer);
    } else if (file.mimetype === "application/pdf" || ext.endsWith(".pdf")) {
      let pdfText = "";
      try {
        pdfText = await extractPdfText(file.buffer);
      } catch (err) {
        console.error("PDF extraction failed:", err);
        res.status(422).json({ error: "Could not read the PDF. Ensure it is a valid, non-password-protected PDF." });
        return;
      }
      rows = parsePdfText(pdfText);
    } else {
      res.status(400).json({ error: "Unsupported file type. Please upload a CSV or PDF." });
      return;
    }

    if (rows.length === 0) {
      res.json({
        imported: 0,
        skipped: 0,
        transactions: [],
        message: "No transactions found. For CSVs, ensure columns include date, description/concept, and amount. For PDFs, ensure amounts include a currency code (CHF, EUR, USD, etc.).",
      });
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

    // Recalculate account balance from ALL transactions (not just imported ones)
    // This is idempotent — safe to re-import the same statement
    await db
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
          WHERE ${transactionsTable.accountId} = ${accountId}
        )`,
      })
      .where(eq(accountsTable.id, accountId));

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
