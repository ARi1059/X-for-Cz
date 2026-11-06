import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase, migrate, immediateTransaction } from '../src/storage/database.ts';
import { seedSite } from '../src/storage/site-store.ts';
import { hashPassword } from '../src/server/auth.ts';

// Secrets are local files, never command arguments or console output.
const reset = process.argv.slice(2).includes('--reset-admin');
if (process.argv.slice(2).some(value => value !== '--reset-admin')) throw new Error('Usage: npm run setup [-- --reset-admin]');
if (!existsSync('.env.local')) {
  writeFileSync('.env.local', [
    'APP_ORIGIN=http://localhost:3000',
    'DATABASE_PATH=./var/site.sqlite',
    'MEDIA_ROOT=./var/media',
    `AGE_SIGNING_SECRET=${randomBytes(48).toString('base64url')}`,
    `SESSION_HASH_SECRET=${randomBytes(48).toString('base64url')}`,
    '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
}
chmodSync('.env.local', 0o600);
process.loadEnvFile('.env.local');
const databasePath = process.env.DATABASE_PATH;
if (!databasePath) throw new Error('DATABASE_PATH required');
mkdirSync(resolve('var'), { recursive: true, mode: 0o700 });
const db = openDatabase(databasePath);
try {
  const migrationsApplied = migrate(db);
  const initial = JSON.parse(readFileSync('config/initial-site.json', 'utf8'));
  const result = seedSite(db, initial);
  const current = db.prepare('SELECT id, username FROM administrators WHERE id=1').get();
  if (!current || reset) {
    const username = current ? String(current.username) : `owner-${randomBytes(3).toString('hex')}`;
    const password = randomBytes(24).toString('base64url');
    const encoded = await hashPassword(password);
    const now = Date.now();
    // Save the generated credential before mutating the account. A failed DB write leaves it marked pending.
    const credentialPath = resolve('var/local-admin.json');
    writeFileSync(credentialPath, JSON.stringify({ username, password, createdAt: new Date(now).toISOString(), purpose: '本机管理登录；勿提交或分享。' }, null, 2) + '\n', { mode: 0o600 });
    chmodSync(credentialPath, 0o600);
    immediateTransaction(db, () => {
      if (current) {
        db.prepare('UPDATE administrators SET password_hash=?, auth_version=auth_version+1, updated_at=? WHERE id=1').run(encoded, now);
        db.prepare('DELETE FROM admin_sessions').run();
      } else {
        db.prepare('INSERT INTO administrators(id,username,password_hash,auth_version,created_at,updated_at) VALUES(1,?,?,1,?,?)').run(username, encoded, now, now);
      }
      db.prepare('INSERT INTO audit_log(action,actor_id,created_at) VALUES(?,1,?)').run(current ? 'password_changed' : 'administrator_initialized', now);
    });
    console.log(JSON.stringify({ administrator: current ? 'reset' : 'created', credentialsFile: 'var/local-admin.json', secretValuesPrinted: false }));
  } else console.log(JSON.stringify({ administrator: 'preserved' }));
  console.log(JSON.stringify({ migrationsApplied, initialized: result.created, draftRevision: result.draft.revision, publishedVersionId: result.published.versionId }));
} finally { db.close(); }
