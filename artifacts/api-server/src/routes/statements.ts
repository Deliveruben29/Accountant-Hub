import { Router, type IRouter, Request, Response } from "express";
import { db, transactionsTable, accountsTable, statementImportsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
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
  // Swiss mobile / telecoms
  if (desc.includes("salt mobile") || desc.includes("sunrise") || desc.includes("swisscom") || desc.includes("electric") || desc.includes("water") || desc.includes("utility") || desc.includes("internet") || desc.includes("telefon")) return "Utilities";
  // Swiss groceries & supermarkets
  if (desc.includes("volg") || desc.includes("coop") || desc.includes("migros") || desc.includes("denner") || desc.includes("spar") || desc.includes("manor") || desc.includes("aldi") || desc.includes("lidl") || desc.includes("dallmayr") || desc.includes("mercadona")) return "Food";
  // Restaurants / fast food
  if (desc.includes("burger king") || desc.includes("mcdonald") || desc.includes("rest.bar") || desc.includes("restaurant") || desc.includes("gastro") || desc.includes("cafe") || desc.includes("grocery") || desc.includes("supermarket") || desc.includes("lolly shop") || desc.includes("jingling")) return "Food";
  // Swiss transport
  if (desc.includes("schweizerische bundesb") || desc.includes("sbb") || desc.includes("taxi") || desc.includes("sumup *taxi") || desc.includes("flight") || desc.includes("train") || desc.includes("uber") || desc.includes("swiss air") || desc.includes("flixbus") || desc.includes("trainline") || desc.includes("transport") || desc.includes("getyourguide")) return "Travel";
  if (desc.includes("hotel") || desc.includes("booking.com") || desc.includes("airbnb")) return "Travel";
  if (desc.includes("tax") || desc.includes("vat") || desc.includes("iva")) return "Tax";
  if (desc.includes("insurance") || desc.includes("seguro") || desc.includes("versicherung")) return "Insurance";
  // Swiss pharmacy / healthcare
  if (desc.includes("apotheke") || desc.includes("amavita") || desc.includes("health") || desc.includes("medical") || desc.includes("pharmacy") || desc.includes("doctor") || desc.includes("farmacia") || desc.includes("selecta")) return "Healthcare";
  if (desc.includes("replit") || desc.includes("anthropic") || desc.includes("google") || desc.includes("saas") || desc.includes("software") || desc.includes("capcut") || desc.includes("envato") || desc.includes("paypal") || desc.includes("viggle") || desc.includes("lipsync") || desc.includes("personality") || desc.includes("surfshark") || desc.includes("landr") || desc.includes("ardour")) return "Software";
  if (desc.includes("tinder") || desc.includes("dating") || desc.includes("parship")) return "Entertainment";
  if (desc.includes("card reload") || desc.includes("transfer") || desc.includes("traspaso")) return "Transfer";
  if (desc.includes("night") || desc.includes("leisure") || desc.includes("cinema") || desc.includes("club") || desc.includes("bar")) return "Entertainment";
  if (desc.includes("furniture") || desc.includes("matratzen") || desc.includes("ikea")) return "Household";
  if (desc.includes("vpn")) return "Software";
  // Bank fees
  if (desc.includes("bankpaket") || desc.includes("kontoführung") || desc.includes("gebühr")) return "Other";
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

// ─── POSTFINANCE PDF PARSER ──────────────────────────────────────────────────

function isPostFinanceFormat(text: string): boolean {
  return (
    text.includes("PostFinance") ||
    text.includes("POFICHBEXXX") ||
    (text.includes("Gutschrift") && text.includes("Lastschrift") &&
      /KAUF\/DIENSTLEISTUNG|BARGELDBEZUG|LASTSCHRIFT/.test(text))
  );
}

function parsePostFinancePdfText(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // Convert DD.MM.YY → YYYY-MM-DD
  const toDate = (d: string, m: string, y: string) => {
    const year = parseInt(y) <= 50 ? `20${y}` : `19${y}`;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  };

  // Swiss amount: digits with optional space-thousands, e.g. "11.80", "2 019.95"
  const parseSwissAmt = (s: string) => parseFloat(s.replace(/ /g, ""));

  // The dedicated AMOUNT line that closes each transaction block.
  //
  // FORMAT A (older statements – space-separated):
  //   "01.05.25 11.80 30.04.25"          → booking-date AMOUNT valuta-date
  //   "21.50 01.05.25"                   → AMOUNT valuta-date
  //   "04.05.25 1.10 04.05.25 1 691.20"  → booking-date AMOUNT valuta-date saldo
  //
  // FORMAT B (Aug 2025+ – tab-separated, dates first then amount):
  //   "31.07.25\t150.00"                 → valuta-date TAB amount
  //   "01.08.25 31.07.25\t12.85"         → booking-date valuta-date TAB amount
  //   "02.08.25 02.08.25\t7.80 1 959.29" → booking-date valuta-date TAB amount saldo
  //
  // Format A: optional booking-date, AMOUNT, valuta-date, optional saldo
  const AMOUNT_LINE_A = /^(?:(\d{2})\.(\d{2})\.(\d{2})\s+)?(\d{1,3}(?: \d{3})*\.\d{2})\s+(\d{2}\.\d{2}\.\d{2})(?:\s+\d{1,3}(?: \d{3})*\.\d{2})?$/;
  // Format B: booking-date [valuta-date] TAB amount [saldo]
  const AMOUNT_LINE_B = /^(\d{2})\.(\d{2})\.(\d{2})(?:\s+\d{2}\.\d{2}\.\d{2})?\t(\d{1,3}(?: \d{3})*\.\d{2})(?:\s+\d{1,3}(?: \d{3})*\.\d{2})?$/;

  // Lines to skip globally (page headers, footers, personal data, barcodes)
  const GLOBAL_SKIP: RegExp[] = [
    /PostFinanceAG|PostFinance AG/,
    /Siewerdenbetreutvon|Sie werden betreut/,
    /OscarMananesundTeam/,
    /Telefon\+41|Telefon \+41/,
    /www\.postfinance\.ch/,
    /Kontoauszug\d|Kontoauszug \d/i,
    /IBANCH\d|IBAN CH\d/i,
    /Kontonummer\s*\d/i,
    /BIC POFICH|BICPOFICH/i,
    /Datum Saldo|Datum\s+Saldo/i,
    /Seite[: ]\d|Seite\d/i,
    /Datum:\s*\d{2}\.\d{2}\.\d{4}/i,
    /Online-Einkäufe/i,
    /Voraussetzung für/i,
    /postfinance\.ch\/3dsecure/i,
    /Privatkonto/,
    /^-- \d+ of \d+ --$/,
    /CH-\d{4} /,
    /^A-PRIORITY$/,
    /^P\.P\.\s*$/,
    /^Post CH AG$/,
    /^Herr$|^Frau$/i,
    /Hohlgass|Wil ZH/i,
    /Moya Giner|Ruben Moya/i,
    /^8196 Wil ZH$/,
    /^00\d{3,4}$/,            // barcode stamp (00656)
    /^DE \d{6}\./,            // barcode stamp (DE 000030.)
    /^\d{1,2}$/,              // lone 1-2 digit lines
    /\bKontostand\b/i,        // opening / closing balance
    /^Total\s+\d/i,           // totals row
    /Auskunft darüber/i,
    /Bitte überprüfen/i,
    /^Freundliche Grüsse$/i,
    /^CH-\d{4}/,
  ];

  // Transaction type → credit/debit classification
  const TX_TYPES: Array<[RegExp, "income" | "expense" | "transfer"]> = [
    [/^KAUF\//i, "expense"],                         // KAUF/DIENSTLEISTUNG, KAUF/ONLINE-SHOPPING, etc.
    [/^BARGELDBEZUG/i, "expense"],                   // ATM withdrawal
    [/^TWINT GELD SENDEN/i, "expense"],              // TWINT outgoing payment
    [/^TWINT GELD EMPFANGEN/i, "income"],            // TWINT incoming payment
    [/^TWINT ZAHLUNG/i, "expense"],                  // TWINT shop payment
    [/^LASTSCHRIFT$/i, "expense"],
    [/^GUTSCHRIFT$/i, "income"],
    [/^DAUERAUFTRAG/i, "expense"],
    [/^BONIFIKATION/i, "income"],
    [/^VERGÜTUNG|^VERGUETUNG/i, "income"],
    [/^ÜBERTRAG|^UBERTRAG/i, "transfer"],
    [/^BELASTUNG/i, "expense"],
    [/^PREIS FÜR|^PREIS FUER/i, "expense"],         // bank fees
    [/^POSTSCHALTERGESCHÄFT|^POSTSCHALTERGESCHAFT/i, "expense"], // post-office counter
    [/^RÜCKÜBERWEISUNG|^RUCKUBERWEISUNG/i, "income"],
    [/^EINZAHLUNG/i, "income"],
  ];

  // Noise patterns within a description block (lines to drop)
  const DESC_NOISE: RegExp[] = [
    /^KARTEN NR\./i,
    /^CH\d{2}[\d ]{10,}/,   // IBAN (CH19 0900 ...)
    /^\d{4} [A-ZÄÖÜ]/,      // Swiss/French ZIP + city (8098 ZÜRICH, 1020 RENENS VD)
    /^\d{6,}$/,              // pure long numbers
    /^[A-Z0-9_]{15,}$/,     // reference codes (25031400039348_MAERZ)
    /^[0-9]{14,}/,           // timestamp strings
    /^UBS SWITZERLAND|^UBS AG$/i,
    /^CREDIT SUISSE/i,
    /^RAIFFEISEN/i,
    /^ZÜRCHER KANTONALBANK|^ZKB/i,
    /^BAHNHOFSTRASSE\s+\d/i,
    /^PARADEPLATZ/i,
    /^FILIALE /i,            // PostFinance branches (FILIALE AUSSERSIHL)
    /^SENDER REFERENZ/i,
    /^AUFTRAGGEBER:?$/i,   // GUTSCHRIFT field label
    /^MITTEILUNGEN:?$/i,   // GUTSCHRIFT / TWINT field label
    /^REFERENZEN:?$/i,     // GUTSCHRIFT field label
    /^AN TELEFON-NR\./i,   // TWINT recipient phone number line
    /^, [A-Z]/,            // TWINT recipient name prefix line (", SANDRINE")
    /^PAYMENT ID\s/i,      // online shopping payment reference
    /^BESTELLNUMMER\s/i,   // online shopping order number
  ];

  // State
  let currentDate = "";
  let txType: "income" | "expense" | "transfer" = "expense";
  let descLines: string[] = [];
  let inTx = false;
  let skipNext = 0;

  const commit = (amount: number, date: string) => {
    if (!inTx || amount <= 0 || !date) { inTx = false; descLines = []; return; }
    const description = descLines
      .filter((l) => !DESC_NOISE.some((p) => p.test(l)))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || "PostFinance transaction";
    rows.push({
      date,
      description,
      amount,
      type: txType,
      category: guessCategory(description, txType !== "income"),
    });
    descLines = [];
    inTx = false;
  };

  for (const raw of lines) {
    if (GLOBAL_SKIP.some((p) => p.test(raw))) continue;
    if (skipNext > 0) { skipNext--; continue; }

    // SENDER REFERENZ: skip this line + next 2 (the reference codes)
    if (/^SENDER REFERENZ:/i.test(raw)) { skipNext = 2; continue; }

    // ── Amount line? ─────────────────────────────────────────────────────────
    const amtMatchA = raw.match(AMOUNT_LINE_A);
    const amtMatchB = !amtMatchA ? raw.match(AMOUNT_LINE_B) : null;

    if (amtMatchA) {
      // Format A: [1-3]=optional booking date D/M/Y, [4]=amount, [5]=valuta DD.MM.YY
      const amount = parseSwissAmt(amtMatchA[4]);
      let bookingDate = currentDate;
      if (amtMatchA[1]) {
        bookingDate = toDate(amtMatchA[1], amtMatchA[2], amtMatchA[3]);
        currentDate = bookingDate;
      }
      if (!bookingDate && amtMatchA[5]) {
        const [vd, vm, vy] = amtMatchA[5].split(".");
        bookingDate = toDate(vd, vm, vy);
      }
      commit(amount, bookingDate);
      continue;
    }

    if (amtMatchB) {
      // Format B: [1-3]=booking date D/M/Y, [4]=amount (valuta date is group 4-6 but we captured D/M/Y)
      const amount = parseSwissAmt(amtMatchB[4]);
      const bookingDate = toDate(amtMatchB[1], amtMatchB[2], amtMatchB[3]);
      currentDate = bookingDate;
      commit(amount, bookingDate);
      continue;
    }

    // ── New transaction type line? ────────────────────────────────────────────
    let detectedType: "income" | "expense" | "transfer" | null = null;
    for (const [pattern, t] of TX_TYPES) {
      if (pattern.test(raw)) { detectedType = t; break; }
    }

    if (detectedType !== null) {
      // Orphan tx without amount line (shouldn't happen but be safe)
      if (inTx) { inTx = false; descLines = []; }
      txType = detectedType;
      inTx = true;
      descLines = [];
      // Some tx types carry useful description text on the same line
      // e.g. "PREIS FÜR" → next line has "BANKPAKET SMART 04.2025"
      // Nothing to extract from this line itself.
      continue;
    }

    // ── Description continuation line ─────────────────────────────────────────
    if (inTx && raw.length > 1) {
      descLines.push(raw);
    }
  }

  return rows;
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

// ─── FUZZY MATCHING & DEDUPLICATION ──────────────────────────────────────────

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .replace(/[^\w\s-]/g, "") // Remove special chars except hyphen
    .trim();
}

// Calculate Levenshtein distance between two strings
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,      // deletion
        matrix[i - 1][j] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

// Check if two strings are similar (fuzzy match, >80% similarity threshold)
function areSimilar(a: string, b: string, threshold: number = 0.8): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return true;
  const distance = levenshteinDistance(a, b);
  const similarity = 1 - distance / maxLen;
  return similarity >= threshold;
}

// ─── STATEMENT IMPORTS: LIST & DELETE ────────────────────────────────────────

router.get("/statement-imports", async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
    const where = accountId ? eq(statementImportsTable.accountId, accountId) : undefined;
    const imports = await db
      .select()
      .from(statementImportsTable)
      .where(where)
      .orderBy(desc(statementImportsTable.importedAt));
    res.json(imports);
  } catch (err) {
    console.error("Error listing imports:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Failed to list imports" });
  }
});

router.delete("/statement-imports/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleteOnlyImported = req.query.deleteOnlyImported === "true";
    
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    // Fetch the import record first so we know which account to recalculate
    const [record] = await db
      .select()
      .from(statementImportsTable)
      .where(eq(statementImportsTable.id, id))
      .limit(1);

    if (!record) { res.status(404).json({ error: "Import not found" }); return; }

    // Check if there are manual (non-imported) transactions in overlapping date range
    // Manual transactions have statementImportId = NULL
    const manualTransactions = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.accountId, record.accountId),
          sql`${transactionsTable.statementImportId} IS NULL`,
          gte(transactionsTable.date, record.dateFrom),
          lte(transactionsTable.date, record.dateTo)
        )
      );

    // If manual transactions exist and user hasn't confirmed deletion of only imported ones
    if (manualTransactions.length > 0 && !deleteOnlyImported) {
      return res.status(409).json({
        error: "Cannot delete: manual transactions exist in this date range",
        code: "MANUAL_TRANSACTIONS_EXIST",
        manualCount: manualTransactions.length,
        importedCount: record.txImported,
        dateFrom: record.dateFrom,
        dateTo: record.dateTo,
        message: `There are ${manualTransactions.length} manually created transaction(s) in the range ${record.dateFrom} to ${record.dateTo}. To delete only the ${record.txImported} imported transaction(s), add ?deleteOnlyImported=true to your request.`,
      });
    }

    // Delete: either all linked to import, or only the ones with statementImportId (if deleteOnlyImported)
    if (deleteOnlyImported) {
      await db
        .delete(transactionsTable)
        .where(
          and(
            eq(transactionsTable.statementImportId, id),
            eq(transactionsTable.accountId, record.accountId)
          )
        );
    } else {
      // No manual transactions exist, safe to delete all linked to import
      await db
        .delete(transactionsTable)
        .where(eq(transactionsTable.statementImportId, id));
    }

    // Delete the import record itself
    await db.delete(statementImportsTable).where(eq(statementImportsTable.id, id));

    // Recalculate account balance
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
          WHERE ${transactionsTable.accountId} = ${record.accountId}
        )`,
      })
      .where(eq(accountsTable.id, record.accountId));

    res.json({
      deleted: true,
      importId: id,
      accountId: record.accountId,
      deletedOnlyImported: deleteOnlyImported,
      manualTransactionsPreserved: deleteOnlyImported ? manualTransactions.length : 0,
    });
  } catch (err) {
    console.error("Error deleting import:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Failed to delete import" });
  }
});

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
      try {
        rows = parseCsvStatement(file.buffer);
      } catch (err) {
        console.error("CSV parsing failed:", err);
        res.status(422).json({ error: "Could not parse the CSV file. Ensure it has valid columns: date, description (or concept), and amount." });
        return;
      }
    } else if (file.mimetype === "application/pdf" || ext.endsWith(".pdf")) {
      let pdfText = "";
      try {
        pdfText = await extractPdfText(file.buffer);
      } catch (err) {
        console.error("PDF extraction failed:", err);
        res.status(422).json({ error: "Could not read the PDF. Ensure it is a valid, non-password-protected PDF." });
        return;
      }
      try {
        rows = isPostFinanceFormat(pdfText)
          ? parsePostFinancePdfText(pdfText)
          : parsePdfText(pdfText);
      } catch (err) {
        console.error("PDF parsing failed:", err);
        res.status(422).json({ error: "Could not parse the PDF content. Ensure amounts include currency codes (CHF, EUR, USD, etc.)." });
        return;
      }
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

    // ── Deduplication ────────────────────────────────────────────────────────
    // Fetch all existing transactions for this account that fall within the
    // date range of the parsed file so we can skip exact duplicates.
    // A duplicate is defined as same (date, amount rounded to 2dp, type).
    // This makes re-uploading any statement completely safe.
    const dates = rows.map((r) => r.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    // For large imports (>500 rows), limit the deduplication window to avoid memory issues
    // We still check all rows in the import against each other (batch deduplication)
    const DEDUP_LIMIT = rows.length > 500 ? 5000 : undefined;

    const existing = await db
      .select({
        id: transactionsTable.id,
        date: transactionsTable.date,
        amount: transactionsTable.amount,
        type: transactionsTable.type,
        description: transactionsTable.description,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.accountId, accountId),
          gte(transactionsTable.date, minDate),
          lte(transactionsTable.date, maxDate)
        )
      )
      .limit(DEDUP_LIMIT || 10000);

    // ── Deduplication (Smart) ───────────────────────────────────────────────
    // Supports:
    //  - Exact match rejection: same date|amount|type|description
    //  - Fuzzy match rejection: same date|amount + very similar descriptions
    //  - Force import: skip fuzzy check (only reject exact duplicates)
    const forceImport = req.body.forceImport === "true" || req.body.forceImport === true;

    // Build exact and fuzzy match maps
    const exactMatchMap = new Map<string, { id: number; amount: string; description: string }>();
    const fuzzyMatchMap = new Map<string, Array<{ id: number; description: string; normalized: string }>>();

    for (const e of existing) {
      // Exact match: date|amount|type|description
      const exactKey = `${e.date}|${parseFloat(e.amount).toFixed(2)}|${e.type}|${e.description}`;
      exactMatchMap.set(exactKey, { id: e.id ?? 0, amount: e.amount, description: e.description });

      // Fuzzy match map: date|amount|type → list of existing entries
      const fuzzyKey = `${e.date}|${parseFloat(e.amount).toFixed(2)}|${e.type}`;
      if (!fuzzyMatchMap.has(fuzzyKey)) fuzzyMatchMap.set(fuzzyKey, []);
      fuzzyMatchMap.get(fuzzyKey)!.push({
        id: e.id ?? 0,
        description: e.description,
        normalized: normalizeDescription(e.description),
      });
    }

    // Batch tracking (same-file deduplication)
    const batchSeen = new Set<string>();
    const rejected: Array<{
      date: string;
      description: string;
      amount: number;
      type: string;
      category: string;
      reason: string;
      conflictingTransactionId?: number;
      fuzzyMatch?: boolean;
    }> = [];

    const newRows = rows.filter((r, index) => {
      // Progress logging for large imports
      if (rows.length > 500 && index % 100 === 0) {
        console.log(`Processing row ${index + 1}/${rows.length}...`);
      }

      const exactKey = `${r.date}|${r.amount.toFixed(2)}|${r.type}|${r.description}`;
      const fuzzyKey = `${r.date}|${r.amount.toFixed(2)}|${r.type}`;

      // 1. Check exact match in batch (same file)
      if (batchSeen.has(exactKey)) {
        rejected.push({
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          category: r.category,
          reason: `Duplicate within this file: same transaction already in batch`,
        });
        return false;
      }

      // 2. Check exact match in database
      if (exactMatchMap.has(exactKey)) {
        const existing = exactMatchMap.get(exactKey)!;
        rejected.push({
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          category: r.category,
          reason: `Exact duplicate: already imported on ${r.date}`,
          conflictingTransactionId: existing.id,
        });
        return false;
      }

      // 3. Check fuzzy match in database (unless forceImport is true)
      // Skip fuzzy matching for very large imports to improve performance
      if (!forceImport && rows.length <= 1000 && fuzzyMatchMap.has(fuzzyKey)) {
        const similar = fuzzyMatchMap.get(fuzzyKey)!;
        const normalizedNew = normalizeDescription(r.description);
        
        for (const existing of similar) {
          if (areSimilar(normalizedNew, existing.normalized, 0.75)) {
            rejected.push({
              date: r.date,
              description: r.description,
              amount: r.amount,
              type: r.type,
              category: r.category,
              reason: `Similar transaction already exists: "${existing.description}" (${(1 - levenshteinDistance(normalizedNew, existing.normalized) / Math.max(normalizedNew.length, existing.normalized.length)) * 100 | 0}% match). Use forceImport=true to override.`,
              conflictingTransactionId: existing.id,
              fuzzyMatch: true,
            });
            return false;
          }
        }
      }

      batchSeen.add(exactKey);
      return true;
    });

    const skipped = rejected.length;

    if (newRows.length === 0) {
      const fuzzySkipped = rows.length > 1000 ? " (fuzzy matching was disabled for performance)" : "";
      res.json({
        imported: 0,
        skipped,
        rejected,
        transactions: [],
        message: `All ${skipped} transaction(s) from this file were rejected (see 'rejected' array for details)${fuzzySkipped}.`,
      });
      return;
    }

    console.log(`Importing ${newRows.length} new transactions (${skipped} skipped)...`);

    // Record the import batch
    const [importRecord] = await db
      .insert(statementImportsTable)
      .values({
        accountId,
        filename: file.originalname,
        txImported: newRows.length,
        txSkipped: skipped,
        dateFrom: minDate,
        dateTo: maxDate,
      })
      .returning();

    const inserted = await db
      .insert(transactionsTable)
      .values(
        newRows.map((r) => ({
          accountId,
          date: r.date,
          description: r.description,
          amount: String(r.amount),
          type: r.type,
          category: r.category,
          reference: r.reference ?? null,
          importedFromStatement: true,
          statementImportId: importRecord.id,
        }))
      )
      .returning();

    // Recalculate account balance from ALL transactions (idempotent)
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
      skipped,
      statementImportId: importRecord.id,
      rejected,
      transactions: inserted.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
    });
  } catch (err) {
    console.error("Error uploading statement:", err);
    res.status(500).json({ error: "Failed to process statement" });
  }
});

export default router;
