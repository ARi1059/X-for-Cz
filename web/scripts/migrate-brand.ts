import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { backup } from 'node:sqlite';
import sharp from 'sharp';
import { importMedia } from '../src/server/media.ts';
import { openDatabase } from '../src/storage/database.ts';
import { migrateBrand } from '../src/storage/brand-migration.ts';
import { readDraft, readPublished } from '../src/storage/site-store.ts';

const args = process.argv.slice(2);
if (args.some(value => value !== '--apply')) throw new Error('Usage: npm run brand:migrate [-- --apply]');
const apply = args.includes('--apply');
const filename = process.env.DATABASE_PATH;
const mediaRoot = process.env.MEDIA_ROOT;
if (!filename || !mediaRoot || !existsSync(filename)) throw new Error('An initialized DATABASE_PATH and MEDIA_ROOT are required');
const db = openDatabase(filename, { readOnly: !apply });
try {
  const draft = readDraft(db);
  const published = readPublished(db);
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', draftRevision: draft.revision, publishedVersion: published.versionId,
      target: '教父', draftsRemainSeparate: true }));
  } else {
    const backupPath = process.env.BRAND_BACKUP_PATH ?? resolve(`${filename}.before-brand-${Date.now()}.sqlite`);
    if (existsSync(backupPath)) throw new Error('Use a new backup path; existing backups are retained');
    await backup(db, backupPath);
    chmodSync(backupPath, 0o600);
    const image = readFileSync(new URL('../public/brand/godfather-personal.png', import.meta.url));
    const normalized = await sharp(image).rotate().toColourspace('srgb')
      .resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    const hash = createHash('sha256').update(normalized).digest('hex');
    const previous = db.prepare("SELECT id FROM media_assets WHERE sha256=? AND status='ready' AND purpose='controlled'").get(hash);
    const avatar = previous ? String(previous.id) : (await importMedia(db, mediaRoot, image, { purpose: 'controlled', neutralConfirmed: false })).id;
    const result = migrateBrand(db, avatar);
    console.log(JSON.stringify({ mode: 'applied', ...result, avatar, backupPath, draftsRemainSeparate: true }));
  }
} finally { db.close(); }
