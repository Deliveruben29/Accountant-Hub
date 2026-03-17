import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { join } from "path";

// SQLite database file path (dev.db en la raíz del proyecto)
const dbPath = process.env.DATABASE_URL || join(process.cwd(), "dev.db");

// Crear conexión SQLite
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL"); // Write-Ahead Logging para mejor rendimiento

export const db = drizzle(sqlite, { schema });

export * from "./schema";
