import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import sharp from 'sharp';
import { migrate, openDatabase } from '../src/storage/database.ts';
import { seedSite, readDraft, saveDraft, publishDraft } from '../src/storage/site-store.ts';
import { importMedia, listMedia, readMedia, removeMedia, MediaError, MEDIA_LIMITS } from '../src/server/media.ts';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gf-media-'));
  const db = openDatabase(join(root, 'site.sqlite')); migrate(db);
  seedSite(db, JSON.parse(readFileSync(new URL('../config/initial-site.json', import.meta.url), 'utf8')));
  return { db, root, mediaRoot: join(root, 'media'), close: () => { db.close(); rmSync(root, { recursive: true, force: true }); } };
}
const image = async (width = 320, height = 500) => sharp({ create: { width, height, channels: 3, background: '#c7a678' } }).jpeg().toBuffer();
const controlled = { purpose: 'controlled' as const, neutralConfirmed: false };
const status = (expected: number, code?: string) => (error: unknown): boolean => error instanceof MediaError && error.status === expected && (code === undefined || error.code === code);

test('actual decode strips metadata, keeps aspect, generates private derivatives and path-free records', async () => {
  const f = fixture();
  try {
    const source = await sharp(await image()).withExif({ IFD0: { Artist: 'private artist', Orientation: '1' } }).jpeg().toBuffer();
    const record = await importMedia(f.db, f.mediaRoot, source, controlled);
    assert.equal(record.status, 'ready'); assert.equal(record.purpose, 'controlled'); assert.equal(record.mimeType, 'image/webp');
    assert.equal(record.width / record.height, 320 / 500);
    assert.deepEqual(record.references, { draft: false, publishedVersionCount: 0 });
    assert.match(record.lqip ?? '', /^data:image\/webp;base64,/);
    const lqip = await sharp(Buffer.from(record.lqip!.split(',')[1]!, 'base64')).metadata();
    assert.ok((lqip.width ?? 0) > 0 && (lqip.width ?? 0) <= 48);
    assert.ok((lqip.height ?? 0) > 0 && (lqip.height ?? 0) <= 60);
    assert.equal('storageKey' in record, false); assert.equal('sha256' in record, false);
    for (const variant of ['thumbnail', 'display'] as const) {
      const result = readMedia(f.db, f.mediaRoot, record.id, variant);
      assert.equal(result.mimeType, 'image/webp');
      const metadata = await sharp(result.bytes).metadata();
      assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
      assert.equal(statSync(join(f.mediaRoot, record.id, `${variant}.webp`)).mode & 0o777, 0o600);
    }
    assert.equal(statSync(join(f.mediaRoot, record.id)).mode & 0o777, 0o700);
    assert.equal((await sharp(readMedia(f.db, f.mediaRoot, record.id, 'thumbnail').bytes).metadata()).height, 400);
  } finally { f.close(); }
});


test('display derivative uses the 2500px long edge for 4:5 images', async () => {
  const f = fixture();
  try {
    const record = await importMedia(f.db, f.mediaRoot, await image(2000, 2500), controlled);
    assert.equal(record.width, 2000);
    assert.equal(record.height, 2500);
    const display = await sharp(readMedia(f.db, f.mediaRoot, record.id, 'display').bytes).metadata();
    assert.equal(display.width, 2000);
    assert.equal(display.height, 2500);
  } finally { f.close(); }
});

test('invalid, truncated, oversized, animated, over-dimension and wrong-purpose uploads leave no rows/files', async () => {
  const f = fixture();
  try {
    await assert.rejects(importMedia(f.db, f.mediaRoot, Buffer.from('<svg><script/></svg>'), controlled), status(415, 'MEDIA_FORMAT_INVALID'));
    await assert.rejects(importMedia(f.db, f.mediaRoot, Buffer.from([255, 216, 255, 0]), controlled), status(422, 'MEDIA_DECODE_FAILED'));
    await assert.rejects(importMedia(f.db, f.mediaRoot, Buffer.alloc(MEDIA_LIMITS.uploadBytes + 1), controlled), status(413));
    await assert.rejects(importMedia(f.db, f.mediaRoot, await image(6001, 1), controlled), status(413, 'MEDIA_DIMENSIONS_INVALID'));
    await assert.rejects(importMedia(f.db, f.mediaRoot, await image(5000, 5000), controlled), status(413, 'MEDIA_DIMENSIONS_INVALID'));
    await assert.rejects(importMedia(f.db, f.mediaRoot, await image(), { purpose: 'public_share', neutralConfirmed: false }), status(422, 'MEDIA_PURPOSE_INVALID'));
    await assert.rejects(importMedia(f.db, f.mediaRoot, await image(), { purpose: 'controlled', neutralConfirmed: true }), status(422, 'MEDIA_PURPOSE_INVALID'));
    const animation = Buffer.concat(await Promise.all(['red', 'blue'].map(background => sharp({ create: { width: 10, height: 10, channels: 3, background } }).raw().toBuffer())));
    const animated = await sharp(animation, { raw: { width: 10, height: 20, channels: 3, pageHeight: 10 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    await assert.rejects(importMedia(f.db, f.mediaRoot, animated, controlled), status(415, 'MEDIA_FORMAT_INVALID'));
    assert.deepEqual(listMedia(f.db).items, []);
  } finally { f.close(); }
});

test('pagination and referenced deletion protect drafts and retained published versions', async () => {
  const f = fixture();
  try {
    const a = await importMedia(f.db, f.mediaRoot, await image(), controlled);
    const b = await importMedia(f.db, f.mediaRoot, await image(), { purpose: 'public_share', neutralConfirmed: true });
    const first = listMedia(f.db, { limit: 1 }); const second = listMedia(f.db, { limit: 1, cursor: first.nextCursor! });
    assert.equal(first.items.length, 1); assert.equal(second.items.length, 1); assert.equal(second.nextCursor, null);
    assert.notEqual(first.items[0]!.id, second.items[0]!.id);
    const draft = readDraft(f.db); draft.config.site.avatarMediaId = a.id;
    draft.config.meta.shareMediaId = b.id;
    draft.config.ageGate.exitUrl = 'https://www.wikipedia.org/'; draft.config.footer.contactEmail = 'contact@example.org';
    draft.config.links[0]!.url = 'https://x.com/sample_creator'; draft.config.links[0]!.enabled = true;
    saveDraft(f.db, draft.config, { expectedRevision: draft.revision });
    assert.throws(() => removeMedia(f.db, f.mediaRoot, a.id), status(409, 'MEDIA_REFERENCED'));
    const published = publishDraft(f.db, { expectedRevision: 2 }); assert.ok(published.versionId);
    const next = readDraft(f.db); next.config.site.avatarMediaId = null; next.config.meta.shareMediaId = null;
    saveDraft(f.db, next.config, { expectedRevision: next.revision });
    assert.throws(() => removeMedia(f.db, f.mediaRoot, a.id), status(409));
    assert.equal(listMedia(f.db).items.find(item => item.id === a.id)!.references.publishedVersionCount, 1);
    const c = await importMedia(f.db, f.mediaRoot, await image(), controlled);
    removeMedia(f.db, f.mediaRoot, c.id); assert.throws(() => readMedia(f.db, f.mediaRoot, c.id), status(404));
    assert.throws(() => listMedia(f.db, { cursor: '../' }), status(400));
    assert.throws(() => readMedia(f.db, f.mediaRoot, '../passwd'), status(400));
  } finally { f.close(); }
});

test('transaction failure cleans newly written files; capacity check commits atomically', async () => {
  const f = fixture();
  try {
    f.db.exec("CREATE TRIGGER injected_media_failure BEFORE INSERT ON audit_log WHEN NEW.action='media_registered' BEGIN SELECT RAISE(ABORT, 'injected'); END;");
    await assert.rejects(importMedia(f.db, f.mediaRoot, await image(), controlled), status(500));
    assert.equal(listMedia(f.db).items.length, 0); assert.deepEqual(readdirSync(f.mediaRoot), []);
    f.db.exec('DROP TRIGGER injected_media_failure');
    const existing = await importMedia(f.db, f.mediaRoot, await image(), controlled);
    const nextBytes = existing.bytes;
    f.db.prepare('UPDATE media_assets SET byte_size=? WHERE id=?').run(MEDIA_LIMITS.storageBytes - nextBytes, existing.id);
    const outcomes = await Promise.allSettled([
      importMedia(f.db, f.mediaRoot, await image(), controlled),
      importMedia(f.db, f.mediaRoot, await image(), controlled),
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(status(507, 'MEDIA_STORAGE_FULL')(rejected.reason), true);
    assert.equal(listMedia(f.db).items.length, 2); assert.equal(readdirSync(f.mediaRoot).length, 2);
  } finally { f.close(); }
});

test('media file symlinks and replaced directories are never followed', async () => {
  const f = fixture();
  try {
    const record = await importMedia(f.db, f.mediaRoot, await image(), controlled);
    const file = join(f.mediaRoot, record.id, 'display.webp');
    rmSync(file); symlinkSync(join(f.root, 'site.sqlite'), file);
    assert.throws(() => readMedia(f.db, f.mediaRoot, record.id), status(404));
    rmSync(join(f.mediaRoot, record.id), { recursive: true }); symlinkSync(f.root, join(f.mediaRoot, record.id));
    assert.throws(() => readMedia(f.db, f.mediaRoot, record.id), status(500));
  } finally { f.close(); }
});
