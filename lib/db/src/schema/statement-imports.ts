import { pgTable, serial, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts";

export const statementImportsTable = pgTable("statement_imports", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  txImported: integer("tx_imported").notNull().default(0),
  txSkipped: integer("tx_skipped").notNull().default(0),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StatementImport = typeof statementImportsTable.$inferSelect;
