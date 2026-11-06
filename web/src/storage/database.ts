import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;
// Application and CLI commands run from web/. A filesystem path also avoids
// treating the SQL directory as a browser/build asset in Next.js.
const defaultMigrations = resolve(process.cwd(), 'migrations');

export function openDatabase(filename: string, options: { readOnly?: boolean } = {}): Database {
  if (!filename.trim()) throw new Error('Database path must be explicit');
  if (filename !== ':memory:' && !options.readOnly) mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename, { readOnly: options.readOnly ?? false });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (!options.readOnly) db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  return db;
}

export function immediateTransaction<T>(db: Database, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Each migration is committed together with its hash; changed history is rejected. */
export function migrate(db: Database, directory = defaultMigrations): string[] {
  return immediateTransaction(db, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at INTEGER NOT NULL
    ) STRICT;`);
    const applied = db.prepare('SELECT name, sha256 FROM schema_migrations ORDER BY name').all();
    const files = readdirSync(/* turbopackIgnore: true */ directory).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const row of applied) {
      if (!files.includes(String(row.name))) throw new Error(`Missing applied migration: ${row.name}`);
    }
    const added: string[] = [];
    for (const name of files) {
      const source = readFileSync(/* turbopackIgnore: true */ resolve(directory, name), 'utf8');
      const sha256 = createHash('sha256').update(source).digest('hex');
      const previous = applied.find(row => row.name === name);
      if (previous) {
        if (previous.sha256 !== sha256) throw new Error(`Migration checksum mismatch: ${name}`);
        continue;
      }
      if (applied.some(row => String(row.name) > name)) throw new Error(`Out-of-order migration: ${name}`);
      db.exec(source);
      db.prepare('INSERT INTO schema_migrations(name, sha256, applied_at) VALUES (?, ?, ?)').run(name, sha256, Date.now());
      added.push(name);
    }
    return added;
  });
}
