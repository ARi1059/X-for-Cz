/** SQLite 打开与迁移。迁移用 PRAGMA user_version 做版本号，全部在一个事务里执行。 */

import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE posts (
    tweet_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('baseline', 'pending', 'publishing', 'published', 'skipped', 'expired', 'failed')),
    payload TEXT NOT NULL,
    message_id INTEGER,
    decided_by INTEGER,
    decided_at INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX posts_status_idx ON posts (status, created_at);

  CREATE TABLE previews (
    tweet_id TEXT NOT NULL,
    admin_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    PRIMARY KEY (tweet_id, admin_id),
    FOREIGN KEY (tweet_id) REFERENCES posts (tweet_id) ON DELETE CASCADE
  ) STRICT;

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE member_daily (
    day TEXT PRIMARY KEY,
    members INTEGER NOT NULL DEFAULT 0,
    joins INTEGER NOT NULL DEFAULT 0,
    leaves INTEGER NOT NULL DEFAULT 0
  ) STRICT;

  CREATE TABLE invite_sources (
    day TEXT NOT NULL,
    link TEXT NOT NULL,
    joins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, link)
  ) STRICT;

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    created_at INTEGER NOT NULL
  ) STRICT;
  `,
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    lang TEXT NOT NULL CHECK (lang IN ('zh', 'en')),
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  ) STRICT;
  `,
];

export function migrate(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  let version = Number(row?.user_version ?? 0);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('数据库版本号损坏');
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    version += 1;
  }
  return version;
}

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}
