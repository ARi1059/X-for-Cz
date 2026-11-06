import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrate } from '../src/storage/database.ts';
import { seedSite } from '../src/storage/site-store.ts';

const [command, ...args] = process.argv.slice(2);
const allowed = ['migrate', 'seed', 'status'];
if (!command || !allowed.includes(command) || (args.length !== 0 && (args.length !== 2 || args[0] !== '--db'))) {
  console.error('Usage: tsx scripts/db.ts <migrate|seed|status> [--db PATH] (or DATABASE_PATH)');
  process.exitCode = 1;
} else {
  const filename = args[1] ?? process.env.DATABASE_PATH;
  if (!filename) {
    console.error('Provide --db PATH or DATABASE_PATH; no implicit database is created.');
    process.exitCode = 1;
  } else {
    let db: ReturnType<typeof openDatabase> | undefined;
    try {
      db = openDatabase(filename, { readOnly: command === 'status' });
      if (command === 'migrate' || command === 'seed') {
        const names = migrate(db);
        console.log(JSON.stringify({ migrationsApplied: names }));
      }
      if (command === 'seed') {
        const source = fileURLToPath(new URL('../config/initial-site.json', import.meta.url));
        const result = seedSite(db, JSON.parse(readFileSync(source, 'utf8')));
        console.log(JSON.stringify({ initialized: result.created, draftRevision: result.draft.revision, publishedVersionId: result.published.versionId, bootstrap: result.published.bootstrap }));
      }
      if (command === 'status') {
        const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
        if (!table) console.log(JSON.stringify({ migrated: false, initialized: false }));
        else {
          const migrations = db.prepare('SELECT name, sha256 FROM schema_migrations ORDER BY name').all();
          const draft = db.prepare('SELECT revision FROM site_draft WHERE id=1').get();
          const pointer = db.prepare('SELECT version_id FROM published_pointer WHERE id=1').get();
          console.log(JSON.stringify({ migrated: true, migrations, initialized: Boolean(draft && pointer), draftRevision: draft?.revision ?? null, publishedVersionId: pointer ? String(pointer.version_id) : null }));
        }
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Database operation failed');
      process.exitCode = 1;
    } finally { db?.close(); }
  }
}
