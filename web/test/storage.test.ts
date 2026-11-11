import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { openDatabase, migrate, type Database } from '../src/storage/database.ts';
import { seedSite, readDraft, readPublished, saveDraft, publishDraft, registerMedia, deleteMedia,
  incrementStatistic, RevisionConflictError, PublishValidationError } from '../src/storage/site-store.ts';
import { parseSiteConfig, type SiteConfig } from '../src/contracts/site-config.ts';

const initial = (): SiteConfig => parseSiteConfig(JSON.parse(readFileSync(new URL('../config/initial-site.json', import.meta.url), 'utf8')));
function fresh(): Database { const db = openDatabase(':memory:'); migrate(db); seedSite(db, initial()); return db; }
function publishable(): SiteConfig {
  const config = initial();
  config.ageGate.exitUrl = 'https://www.wikipedia.org/';
  config.footer.contactEmail = 'contact@example.org';
  config.links[0]!.url = 'https://x.com/sample_creator';
  config.links[0]!.enabled = true;
  return config;
}

test('migration and seed are idempotent; bootstrap is closed and creates no account', () => {
  const db = fresh();
  try {
    assert.deepEqual(migrate(db), []);
    assert.equal(seedSite(db, initial()).created, false);
    assert.equal(readDraft(db).revision, 1);
    assert.equal(readPublished(db).bootstrap, true);
    assert.equal(readPublished(db).config.links.filter(link => link.enabled).length, 0);
    assert.equal(db.prepare('SELECT count(*) AS total FROM administrators').get()!.total, 0);
    const next = initial(); next.site.name = '已编辑名称';
    saveDraft(db, next, { expectedRevision: 1 });
    seedSite(db, initial());
    assert.equal(readDraft(db).config.site.name, '已编辑名称');
    assert.equal(readDraft(db).revision, 2);
    assert.throws(() => seedSite(db, publishable()), /Bootstrap/);
  } finally { db.close(); }
});

test('applied migration checksums prevent silent schema-history changes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gf-migration-'));
  const db = openDatabase(':memory:');
  try {
    const source = fileURLToPath(new URL('../migrations/001_initial.sql', import.meta.url));
    const target = join(folder, '001_initial.sql'); copyFileSync(source, target);
    assert.deepEqual(migrate(db, folder), ['001_initial.sql']);
    writeFileSync(target, readFileSync(target, 'utf8') + '\n-- tampered history\n');
    assert.throws(() => migrate(db, folder), /checksum mismatch/);
    assert.equal(db.prepare('SELECT count(*) AS total FROM schema_migrations').get()!.total, 1);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('CAS rejects stale saves and stale publishes without discarding current draft', () => {
  const db = fresh();
  try {
    const valid = publishable();
    const saved = saveDraft(db, valid, { expectedRevision: 1 });
    assert.equal(saved.revision, 2);
    assert.throws(() => saveDraft(db, initial(), { expectedRevision: 1 }), RevisionConflictError);
    assert.throws(() => publishDraft(db, { expectedRevision: 1 }), RevisionConflictError);
    assert.equal(readDraft(db).revision, 2);
    assert.equal(readDraft(db).config.links[0]!.url, valid.links[0]!.url);
  } finally { db.close(); }
});

test('failed validation keeps old pointer; successful publication stores an immutable snapshot', () => {
  const db = fresh();
  try {
    const bootstrap = readPublished(db);
    assert.throws(() => publishDraft(db, { expectedRevision: 1 }), PublishValidationError);
    assert.equal(readPublished(db).versionId, bootstrap.versionId);
    saveDraft(db, publishable(), { expectedRevision: 1 });
    const published = publishDraft(db, { expectedRevision: 2, siteOrigin: 'https://creator.example.org' });
    assert.notEqual(published.versionId, bootstrap.versionId);
    assert.equal(published.bootstrap, false);
    const next = readDraft(db).config; next.site.name = '新的未发布名称';
    saveDraft(db, next, { expectedRevision: 2 });
    assert.equal(readPublished(db).config.site.name, '教父');
    assert.throws(() => db.prepare('UPDATE published_versions SET config_json = ? WHERE id = ?').run('{}', published.versionId), /immutable/);
    assert.throws(() => db.prepare('DELETE FROM published_versions WHERE id = ?').run(published.versionId), /retained/);
    assert.equal(db.prepare('SELECT count(*) AS total FROM published_versions').get()!.total, 2);
  } finally { db.close(); }
});

test('database failure inside publication rolls back snapshot, pointer and audit together', () => {
  const db = fresh();
  try {
    saveDraft(db, publishable(), { expectedRevision: 1 });
    const before = readPublished(db).versionId;
    db.exec("CREATE TRIGGER injected_publish_failure BEFORE INSERT ON audit_log WHEN NEW.action='site_published' BEGIN SELECT RAISE(ABORT, 'injected transaction failure'); END;");
    assert.throws(() => publishDraft(db, { expectedRevision: 2 }), /injected transaction failure/);
    assert.equal(readPublished(db).versionId, before);
    assert.equal(db.prepare('SELECT count(*) AS total FROM published_versions').get()!.total, 1);
    assert.equal(readDraft(db).revision, 2);
  } finally { db.close(); }
});

test('media foreign keys protect drafts and all retained published versions', () => {
  const db = fresh();
  try {
    const mediaId = registerMedia(db, { storageKey: 'processed/portrait.webp', mimeType: 'image/webp', byteSize: 2048,
      width: 500, height: 600, sha256: createHash('sha256').update('fixture metadata only').digest('hex'), status: 'ready' });
    const config = publishable(); config.site.avatarMediaId = mediaId;
    saveDraft(db, config, { expectedRevision: 1 });
    assert.throws(() => deleteMedia(db, mediaId), /FOREIGN KEY/);
    const first = publishDraft(db, { expectedRevision: 2 });
    config.site.avatarMediaId = null;
    saveDraft(db, config, { expectedRevision: 2 });
    const second = publishDraft(db, { expectedRevision: 3 });
    assert.notEqual(first.versionId, second.versionId);
    assert.throws(() => deleteMedia(db, mediaId), /FOREIGN KEY/);
    assert.throws(() => db.prepare("UPDATE media_assets SET storage_key='changed.webp' WHERE id=?").run(mediaId), /immutable/);
    config.site.avatarMediaId = '00000000-0000-4000-8000-000000000000';
    assert.throws(() => saveDraft(db, config, { expectedRevision: 3 }), /FOREIGN KEY/);
    assert.equal(readDraft(db).revision, 3);
    const orphan = registerMedia(db, { storageKey: 'processed/unused.webp', mimeType: 'image/webp', byteSize: 100,
      width: 10, height: 10, sha256: 'a'.repeat(64), status: 'pending' });
    assert.equal(deleteMedia(db, orphan), true);
  } finally { db.close(); }
});

test('not-ready media prevents publishing without losing the saved draft', () => {
  const db = fresh();
  try {
    const mediaId = registerMedia(db, { storageKey: 'pending/item.png', mimeType: 'image/png', byteSize: 100,
      width: 100, height: 100, sha256: 'b'.repeat(64), status: 'pending' });
    const config = publishable(); config.site.avatarMediaId = mediaId;
    saveDraft(db, config, { expectedRevision: 1 });
    assert.throws(() => publishDraft(db, { expectedRevision: 2 }), PublishValidationError);
    assert.equal(readPublished(db).bootstrap, true);
    assert.equal(readDraft(db).config.site.avatarMediaId, mediaId);
  } finally { db.close(); }
});

test('public share media and age-gated imagery stay separate at publication', () => {
  const db = fresh();
  try {
    const controlled = registerMedia(db, { storageKey: 'controlled/portrait.webp', mimeType: 'image/webp', byteSize: 100,
      width: 100, height: 100, sha256: 'c'.repeat(64), status: 'ready' });
    const share = registerMedia(db, { storageKey: 'shares/neutral.webp', mimeType: 'image/webp', byteSize: 100,
      width: 100, height: 100, sha256: 'd'.repeat(64), status: 'ready', purpose: 'public_share' });
    const config = publishable(); config.meta.shareMediaId = controlled;
    saveDraft(db, config, { expectedRevision: 1 });
    assert.throws(() => publishDraft(db, { expectedRevision: 2 }), (error: unknown) =>
      error instanceof PublishValidationError && error.issues.some(issue => issue.code === 'SHARE_MEDIA_NOT_NEUTRAL'));
    config.meta.shareMediaId = share; config.site.avatarMediaId = controlled;
    saveDraft(db, config, { expectedRevision: 2 });
    const published = publishDraft(db, { expectedRevision: 3 });
    assert.equal(published.config.meta.shareMediaId, share);
    config.site.avatarMediaId = share;
    saveDraft(db, config, { expectedRevision: 3 });
    assert.throws(() => publishDraft(db, { expectedRevision: 4 }), (error: unknown) =>
      error instanceof PublishValidationError && error.issues.some(issue => issue.code === 'MEDIA_PURPOSE_CONFLICT'));
    assert.equal(readPublished(db).versionId, published.versionId);
  } finally { db.close(); }
});

test('restart preserves draft, published pointer and only finite aggregate dimensions', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gf-persist-')); const path = join(folder, 'site.sqlite');
  let db = openDatabase(path);
  try {
    migrate(db); seedSite(db, initial());
    saveDraft(db, publishable(), { expectedRevision: 1 });
    const versionId = publishDraft(db, { expectedRevision: 2 }).versionId;
    incrementStatistic(db, { day: '2026-10-29', source: 'untrusted-source', event: 'link_click', linkId: 'x_profile' });
    incrementStatistic(db, { day: '2026-10-29', source: 'another-source', event: 'link_click', linkId: 'x_profile' });
    assert.throws(() => incrementStatistic(db, { day: '2026-02-30', source: 'profile', event: 'gate_view' }), /valid UTC date/);
    assert.throws(() => incrementStatistic(db, { day: '2026-10-29', source: 'profile', event: 'link_click' }), /CHECK constraint/);
    db.close(); db = openDatabase(path); migrate(db);
    assert.equal(readPublished(db).versionId, versionId);
    assert.equal(readDraft(db).revision, 2);
    const counts = db.prepare('SELECT day, source, event, link_id, count FROM daily_statistics').all();
    assert.equal(counts.length, 1); assert.equal(counts[0]!.source, 'other'); assert.equal(counts[0]!.count, 2);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});
