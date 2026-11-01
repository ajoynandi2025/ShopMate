import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { CURRENT_SCHEMA_VERSION, runMigrations } from './migrations';

let connection: Database.Database | null = null;

export function initializeDatabase(databasePath = path.join(app.getPath('userData'), 'shopmate.db')): Database.Database {
  if (connection) return connection;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  let db: Database.Database | null = null;
  try {
    db = new Database(databasePath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    runMigrations(db);
    connection = db;
    return db;
  } catch (error) {
    db?.close();
    throw new Error(`Failed to initialize ShopMate database at ${databasePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getDatabase(): Database.Database {
  if (!connection) throw new Error('Database has not been initialized.');
  return connection;
}

export function closeDatabase(): void {
  if (!connection) return;
  connection.close();
  connection = null;
}

export function getDatabaseStatus(): { path: string; schemaVersion: number; integrity: string; tableCount: number } {
  const db = getDatabase();
  const integrity = String((db.pragma('integrity_check', { simple: true }) as string) || 'unknown');
  const tableRow = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get() as { count: number };
  const tableCount = Number(tableRow.count);
  return { path: db.name, schemaVersion: Number(db.pragma('user_version', { simple: true })) || CURRENT_SCHEMA_VERSION, integrity, tableCount };
}
