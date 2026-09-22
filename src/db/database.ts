import * as SQLite from 'expo-sqlite';
import { Transaction, FoodItem, CategoryDef } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('clarity.db');
    await initSchema(db);
  }
  return db;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL,
      amount      REAL NOT NULL,
      description TEXT NOT NULL,
      category    TEXT NOT NULL,
      subcategory TEXT,
      shop        TEXT,
      source      TEXT NOT NULL DEFAULT 'manual',
      notes       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_food_items_txn        ON food_items(transaction_id);
  `);
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function insertTransaction(
  t: Omit<Transaction, 'id'>,
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO transactions (date, amount, description, category, subcategory, shop, source, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    t.date, t.amount, t.description, t.category,
    t.subcategory ?? null, t.shop ?? null, t.source, t.notes ?? null,
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

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id=?', id);
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
