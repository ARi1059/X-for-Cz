import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRAND } from '../src/brand.ts';
import { openDatabase, migrate } from '../src/storage/database.ts';
import { migrateBrand } from '../src/storage/brand-migration.ts';
import { readDraft, readPublished, registerMedia, saveDraft, seedSite } from '../src/storage/site-store.ts';

test('brand migration preserves unpublished work, immutable history, targets and validation; repeated application is a no-op', () => {
  const db = openDatabase(':memory:');
  try {
    migrate(db);
    const initial = JSON.parse(readFileSync(new URL('../config/initial-site.json', import.meta.url), 'utf8'));
    initial.site.name = 'Legacy creator';
    seedSite(db, initial);
    const history = db.prepare('SELECT config_json, config_sha256 FROM published_versions WHERE id=1').get();
    const draft = readDraft(db);
    draft.config.info.body = 'Unpublished editorial work';
    draft.config.links[0]!.url = 'https://x.com/project_fixture';
    draft.config.links[0]!.enabled = true;
    saveDraft(db, draft.config, { expectedRevision: draft.revision });
    const avatar = registerMedia(db, { id: 'brand-avatar', storageKey: 'brand-avatar/display.webp', mimeType: 'image/webp',
      byteSize: 100, width: 512, height: 512, sha256: 'a'.repeat(64), status: 'ready' });
    const result = migrateBrand(db, avatar);
    assert.equal(result.draftChanged, true);
    assert.equal(result.publishedChanged, true);
    const nextDraft = readDraft(db);
    const nextPublic = readPublished(db);
    for (const config of [nextDraft.config, nextPublic.config]) {
      assert.equal(config.site.name, BRAND.name);
      assert.equal(config.site.avatarMediaId, avatar);
      assert.equal(config.links.find(link => link.id === 'tg_preview')!.label, BRAND.channels.preview);
    }
    assert.equal(nextDraft.config.info.body, 'Unpublished editorial work');
    assert.equal(nextDraft.config.links[0]!.url, 'https://x.com/project_fixture');
    assert.equal(nextPublic.config.info.body, null);
    assert.equal(nextPublic.config.links[0]!.url, null);
    assert.deepEqual(db.prepare('SELECT config_json, config_sha256 FROM published_versions WHERE id=1').get(), history);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('SELECT count(*) AS count FROM published_media_refs WHERE version_id=? AND media_id=?').get(result.versionId, avatar)!.count, 1);
    assert.equal(migrateBrand(db, avatar).draftChanged, false);
    assert.equal(readPublished(db).versionId, result.versionId);
    assert.throws(() => migrateBrand(db, 'missing-avatar'));
    assert.deepEqual(readDraft(db), nextDraft);
  } finally { db.close(); }
});
