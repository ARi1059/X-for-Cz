import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrate } from '../src/storage/database.ts';
import { readDraft, saveDraft } from '../src/storage/site-store.ts';
import { importMedia, removeMedia } from '../src/server/media.ts';

interface ManifestItem { source: string; role: 'avatar' | 'gallery'; position: number; suggestedId: string; alt: string; caption: string | null; focalPoint: { x: number; y: number } }
const args = process.argv.slice(2);
const argument = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
if (args.some((value, i) => i % 2 === 0 && !['--db', '--media-root'].includes(value)) || args.length % 2 !== 0) {
  throw new Error('Usage: tsx scripts/import-design-media.ts [--db PATH] [--media-root PATH] (or DATABASE_PATH/MEDIA_ROOT)');
}
const databasePath = argument('--db') ?? process.env.DATABASE_PATH;
const mediaRoot = argument('--media-root') ?? process.env.MEDIA_ROOT;
if (!databasePath || !mediaRoot) throw new Error('Provide an explicit database path and private media root.');
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../config/media-import-manifest.json', import.meta.url), 'utf8')) as { items: ManifestItem[] };
const db = openDatabase(databasePath);
const created: string[] = [];
try {
  migrate(db);
  const draft = readDraft(db);
  // Never replace a partially configured or administrator-managed media library.
  const existing = Number(db.prepare('SELECT COUNT(*) AS total FROM media_assets').get()!.total);
  if (draft.config.site.avatarMediaId || draft.config.gallery.photos.length || existing > 0) {
    console.log(JSON.stringify({ imported: false, reason: 'Existing media or draft images retained.', draftRevision: draft.revision }));
  } else {
    for (const item of manifest.items) {
      const asset = await importMedia(db, mediaRoot, readFileSync(resolve(projectRoot, item.source)), { purpose: 'controlled', neutralConfirmed: false });
      created.push(asset.id);
      if (item.role === 'avatar') draft.config.site.avatarMediaId = asset.id;
      else draft.config.gallery.photos.push({ id: item.suggestedId, mediaId: asset.id, alt: item.alt, caption: item.caption,
        position: item.position, visible: true, focalPoint: item.focalPoint });
    }
    draft.config.gallery.enabled = true;
    const saved = saveDraft(db, draft.config, { expectedRevision: draft.revision });
    console.log(JSON.stringify({ imported: true, assets: created.length, draftRevision: saved.revision, published: false }));
  }
} catch (error) {
  // A changed draft or failed source does not leave a half-imported media library.
  for (const id of created) removeMedia(db, mediaRoot, id);
  throw error;
} finally { db.close(); }
