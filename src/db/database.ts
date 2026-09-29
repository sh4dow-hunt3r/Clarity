import * as SQLite from 'expo-sqlite';
import { Transaction, FoodItem, CategoryDef } from '../types';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Many screens call getDb() concurrently on mount (each firing off its own
// Promise.all of queries). Without caching the in-flight init promise, each
// concurrent call would see `db` as null and race to open + migrate the
// database independently — which is exactly how the schema migration below
// ended up running twice in parallel and hit "duplicate column" errors.
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('clarity.db');
      await initSchema(database);
      db = database;
      return database;
    })();
  }
  return initPromise;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT NOT NULL,
      amount          REAL NOT NULL,
      description     TEXT NOT NULL,
      category        TEXT NOT NULL,
      subcategory     TEXT,
      shop            TEXT,
      source          TEXT NOT NULL DEFAULT 'manual',
      notes           TEXT,
      import_batch    TEXT,
      import_filename TEXT,
      raw_description TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS food_items (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      subcategory    TEXT NOT NULL DEFAULT 'other',
      quantity_g     REAL NOT NULL DEFAULT 0,
      protein_g      REAL NOT NULL DEFAULT 0,
      fat_g          REAL NOT NULL DEFAULT 0,
      carbs_g        REAL NOT NULL DEFAULT 0,
      fibre_g        REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custom_categories (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      key    TEXT NOT NULL UNIQUE,
      label  TEXT NOT NULL,
      icon   TEXT NOT NULL DEFAULT 'shape',
      color  TEXT NOT NULL DEFAULT '#607D8B'
    );

    CREATE TABLE IF NOT EXISTS ignored_subscriptions (
      subscription_key TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS merchant_aliases (
      raw_key    TEXT PRIMARY KEY,
      clean_name TEXT NOT NULL,
      category   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_food_items_txn        ON food_items(transaction_id);
  `);

  // Migration: existing installs created the transactions table before these
  // columns existed, and CREATE TABLE IF NOT EXISTS won't retroactively add
  // columns to it.
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
  const columnNames = new Set(columns.map(c => c.name));
  for (const col of ['import_batch', 'import_filename', 'raw_description']) {
    if (columnNames.has(col)) continue;
    // Belt-and-suspenders: getDb()'s init-promise cache is the real fix for
    // concurrent-call races, but swallowing "duplicate column" specifically
    // means this migration can never hard-crash the app even if some other
    // path re-runs it.
    try {
      await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col} TEXT`);
    } catch (e: any) {
      if (!String(e?.message ?? e).includes('duplicate column')) throw e;
    }
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function insertTransaction(
  t: Omit<Transaction, 'id'>,
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO transactions (date, amount, description, category, subcategory, shop, source, notes, import_batch, import_filename, raw_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.date, t.amount, t.description, t.category,
    t.subcategory ?? null, t.shop ?? null, t.source, t.notes ?? null,
    t.import_batch ?? null, t.import_filename ?? null, t.raw_description ?? null,
  );
  return result.lastInsertRowId;
}

export async function updateTransaction(t: Transaction): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE transactions SET date=?, amount=?, description=?, category=?,
     subcategory=?, shop=?, notes=? WHERE id=?`,
    t.date, t.amount, t.description, t.category,
    t.subcategory ?? null, t.shop ?? null, t.notes ?? null, t.id,
  );
}

// Used by the "Clean Up Merchant Names" pass to rewrite an already-imported
// transaction's display fields without touching its date/amount/notes.
// Backfills raw_description with the exact text that was used as the cache
// key (COALESCE keeps it if already set) — without this, a transaction that
// predates the raw_description column would have its already-cleaned
// `description` mistaken for raw statement text on the next cleanup run,
// producing a different (and wrong) name each time it's re-processed.
export async function updateTransactionMerchant(id: number, cleanName: string, category: string, rawKeyUsed: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE transactions SET description=?, shop=?, category=?, raw_description=COALESCE(raw_description, ?) WHERE id=?',
    cleanName, cleanName, category, rawKeyUsed, id,
  );
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id=?', id);
}

// Deletes every transaction in a given month (or, if month is omitted, the
// entire year) — used for bulk-clearing a period from the Transactions screen.
export async function deleteTransactionsByPeriod(year: number, month?: number): Promise<number> {
  const db = await getDb();
  const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;
  const ids = await db.getAllAsync<{ id: number }>('SELECT id FROM transactions WHERE date LIKE ?', `${prefix}%`);
  if (ids.length === 0) return 0;
  const idList = ids.map(r => r.id);
  await db.runAsync(
    `DELETE FROM food_items WHERE transaction_id IN (${idList.map(() => '?').join(',')})`,
    ...idList,
  );
  await db.runAsync('DELETE FROM transactions WHERE date LIKE ?', `${prefix}%`);
  return ids.length;
}

export async function getTransactions(filters?: {
  year?: number;
  month?: number;
  category?: string;
  shop?: string;
}): Promise<Transaction[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.year && filters?.month) {
    const prefix = `${filters.year}-${String(filters.month).padStart(2, '0')}`;
    conditions.push("date LIKE ?");
    params.push(`${prefix}%`);
  } else if (filters?.year) {
    conditions.push("date LIKE ?");
    params.push(`${filters.year}%`);
  }
  if (filters?.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  if (filters?.shop) {
    conditions.push('shop = ?');
    params.push(filters.shop);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.getAllAsync<Transaction>(
    `SELECT * FROM transactions ${where} ORDER BY date DESC`,
    ...params,
  );
}

export async function getTransactionById(id: number): Promise<Transaction | null> {
  const db = await getDb();
  return db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id=?', id);
}

// ── Food items ────────────────────────────────────────────────────────────────

export async function insertFoodItems(items: Omit<FoodItem, 'id'>[]): Promise<void> {
  const db = await getDb();
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO food_items (transaction_id, name, subcategory, quantity_g, protein_g, fat_g, carbs_g, fibre_g)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      item.transaction_id, item.name, item.subcategory,
      item.quantity_g, item.protein_g, item.fat_g, item.carbs_g, item.fibre_g,
    );
  }
}

export async function getFoodItemsForTransaction(txnId: number): Promise<FoodItem[]> {
  const db = await getDb();
  return db.getAllAsync<FoodItem>('SELECT * FROM food_items WHERE transaction_id=?', txnId);
}

// ── Monthly summary ───────────────────────────────────────────────────────────

export async function getMonthlySummary(year: number, month: number) {
  const db = await getDb();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  const rows = await db.getAllAsync<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM transactions
     WHERE date LIKE ? GROUP BY category`,
    `${prefix}%`,
  );

  const totalRow = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(amount) as total FROM transactions WHERE date LIKE ?`,
    `${prefix}%`,
  );

  const by_category: Record<string, number> = {};
  for (const r of rows) by_category[r.category] = r.total;

  return { year, month, total: totalRow?.total ?? 0, by_category };
}

export async function getAvailableMonths(): Promise<{ year: number; month: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ ym: string }>(
    `SELECT DISTINCT substr(date, 1, 7) as ym FROM transactions ORDER BY ym DESC`,
  );
  return rows.map(r => ({
    year: parseInt(r.ym.split('-')[0]),
    month: parseInt(r.ym.split('-')[1]),
  }));
}

// ── Custom categories ─────────────────────────────────────────────────────────

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export async function getCustomCategories(): Promise<CategoryDef[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; label: string; icon: string; color: string }>(
    'SELECT key, label, icon, color FROM custom_categories ORDER BY id ASC',
  );
  return rows.map(r => ({ ...r, isCustom: true }));
}

export async function insertCustomCategory(label: string, icon: string, color: string): Promise<CategoryDef> {
  const db = await getDb();
  const key = slugify(label);
  await db.runAsync(
    'INSERT INTO custom_categories (key, label, icon, color) VALUES (?, ?, ?, ?)',
    key, label.trim(), icon, color,
  );
  return { key, label: label.trim(), icon, color, isCustom: true };
}

// ── Ignored subscriptions ──────────────────────────────────────────────────────

export async function getIgnoredSubscriptionKeys(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ subscription_key: string }>(
    'SELECT subscription_key FROM ignored_subscriptions',
  );
  return new Set(rows.map(r => r.subscription_key));
}

export async function ignoreSubscription(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO ignored_subscriptions (subscription_key) VALUES (?)',
    key,
  );
}

export async function unignoreSubscription(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM ignored_subscriptions WHERE subscription_key = ?', key);
}

// ── Import batches ─────────────────────────────────────────────────────────────

export interface ImportBatch {
  batch: string;
  filename: string | null;
  count: number;
  total: number;
  importedAt: string;
}

export async function getImportBatches(): Promise<ImportBatch[]> {
  const db = await getDb();
  return db.getAllAsync<ImportBatch>(
    `SELECT import_batch as batch, import_filename as filename,
            COUNT(*) as count, SUM(amount) as total, MAX(created_at) as importedAt
     FROM transactions
     WHERE import_batch IS NOT NULL
     GROUP BY import_batch
     ORDER BY importedAt DESC`,
  );
}

export async function deleteImportBatch(batch: string): Promise<void> {
  const db = await getDb();
  // food_items has ON DELETE CASCADE, but that only fires with foreign_keys
  // pragma on — delete explicitly first so orphaned rows can't linger.
  await db.runAsync(
    `DELETE FROM food_items WHERE transaction_id IN (SELECT id FROM transactions WHERE import_batch = ?)`,
    batch,
  );
  await db.runAsync('DELETE FROM transactions WHERE import_batch = ?', batch);
}

// ── Merchant alias cache ──────────────────────────────────────────────────────
//
// Caches AI-resolved "IMAGINUS CANADA LIMITE TORONTO ON" -> "Imaginus" style
// cleanups keyed by the raw statement text, so the same merchant is only ever
// sent to the AI once, no matter how many times it shows up across imports.

export function normalizeMerchantKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function getMerchantAlias(rawDescription: string): Promise<{ cleanName: string; category: string | null } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ clean_name: string; category: string | null }>(
    'SELECT clean_name, category FROM merchant_aliases WHERE raw_key = ?',
    normalizeMerchantKey(rawDescription),
  );
  return row ? { cleanName: row.clean_name, category: row.category } : null;
}

export async function setMerchantAlias(rawDescription: string, cleanName: string, category: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO merchant_aliases (raw_key, clean_name, category) VALUES (?, ?, ?)',
    normalizeMerchantKey(rawDescription), cleanName, category,
  );
}
