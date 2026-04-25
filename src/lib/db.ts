import { createClient, Client } from "@libsql/client";

let client: Client | null = null;
let initialized = false;

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL || "file:lottery.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export async function ensureDb(): Promise<Client> {
  const db = getDb();
  if (!initialized) {
    await initDb(db);
    initialized = true;
  }
  return db;
}

async function initDb(db: Client) {
  // Create tables - execute each statement separately since libsql doesn't support multi-statement exec
  await db.execute(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      import_batch TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS troops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      leader_name TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      draft_position INTEGER,
      max_one_per_weekend INTEGER NOT NULL DEFAULT 0,
      max_booths INTEGER NOT NULL DEFAULT 0,
      no_same_day INTEGER NOT NULL DEFAULT 0,
      no_same_time INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      troop_id INTEGER NOT NULL REFERENCES troops(id) ON DELETE CASCADE,
      slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      UNIQUE(troop_id, slot_id),
      UNIQUE(troop_id, rank)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      troop_id INTEGER NOT NULL REFERENCES troops(id) ON DELETE CASCADE,
      slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
      round INTEGER NOT NULL DEFAULT 1,
      pick_number INTEGER NOT NULL DEFAULT 0,
      UNIQUE(slot_id)
    )
  `);

  // Migrations - use try/catch for ALTER TABLE (ignore "duplicate column" errors)
  try { await db.execute("ALTER TABLE troops ADD COLUMN max_one_per_weekend INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await db.execute("ALTER TABLE troops ADD COLUMN email TEXT NOT NULL DEFAULT ''"); } catch {}
  try { await db.execute("ALTER TABLE troops ADD COLUMN max_booths INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await db.execute("ALTER TABLE locations ADD COLUMN import_batch TEXT"); } catch {}
  try { await db.execute("ALTER TABLE troops ADD COLUMN no_same_day INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await db.execute("ALTER TABLE troops ADD COLUMN no_same_time INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await db.execute("ALTER TABLE assignments ADD COLUMN pick_number INTEGER NOT NULL DEFAULT 0"); } catch {}
}
