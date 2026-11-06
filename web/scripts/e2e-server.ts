import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { openDatabase, migrate } from '../src/storage/database.ts';
import { seedSite, saveDraft } from '../src/storage/site-store.ts';
import { hashPassword } from '../src/server/auth.ts';
import { importMedia } from '../src/server/media.ts';
import { fixtureAccount } from '../e2e/fixture.ts';

// Browser tests own a new database and media directory on every run.
const directory = mkdtempSync(join(tmpdir(), 'guqingtang-e2e-'));
const filename = join(directory, 'site.sqlite');
const mediaRoot = join(directory, 'media');
try {
  const db = openDatabase(filename);
  try {
    migrate(db);
    const { draft } = seedSite(db, JSON.parse(readFileSync('config/initial-site.json', 'utf8')));
    const now = Date.now();
    db.prepare('INSERT INTO administrators(id,username,password_hash,auth_version,created_at,updated_at) VALUES(1,?,?,1,?,?)')
      .run(fixtureAccount.username, await hashPassword(fixtureAccount.password), now, now);
    const { items } = JSON.parse(readFileSync('config/media-import-manifest.json', 'utf8'));
    for (const item of items) {
      const asset = await importMedia(db, mediaRoot, readFileSync(resolve('..', item.source)), { purpose: 'controlled', neutralConfirmed: false });
      if (item.role === 'avatar') draft.config.site.avatarMediaId = asset.id;
      else draft.config.gallery.photos.push({ id: item.suggestedId, mediaId: asset.id, alt: item.alt, caption: item.caption,
        position: item.position, visible: true, focalPoint: item.focalPoint });
    }
    draft.config.gallery.enabled = true;
    saveDraft(db, draft.config, { expectedRevision: draft.revision });
  } finally { db.close(); }
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', 'localhost', '--port', '3103'], {
    stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', APP_ORIGIN: 'http://localhost:3103', DATABASE_PATH: filename,
      MEDIA_ROOT: mediaRoot, AGE_SIGNING_SECRET: randomBytes(48).toString('base64url'), SESSION_HASH_SECRET: randomBytes(48).toString('base64url'), LOCAL_DRAFT_PREVIEW: '0' },
  });
  process.on('SIGTERM', () => server.kill('SIGTERM'));
  process.on('SIGINT', () => server.kill('SIGTERM'));
  server.on('exit', code => { rmSync(directory, { recursive: true, force: true }); process.exit(code ?? 0); });
  server.on('error', error => { console.error(error.message); rmSync(directory, { recursive: true, force: true }); process.exit(1); });
} catch (error) {
  rmSync(directory, { recursive: true, force: true });
  throw error;
}
