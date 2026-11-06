import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Runtime } from '../src/server/runtime.ts';
import { readPublicVersion } from '../src/server/publication.ts';
import { migrate, openDatabase } from '../src/storage/database.ts';
import { readDraft, readPublished, saveDraft, seedSite } from '../src/storage/site-store.ts';

function withEnvironment<T>(environment: string | undefined, action: () => T): T {
  const variables: Record<string, string | undefined> = process.env;
  const previous = variables.NODE_ENV;
  try {
    if (environment === undefined) delete variables.NODE_ENV;
    else variables.NODE_ENV = environment;
    return action();
  } finally {
    if (previous === undefined) delete variables.NODE_ENV;
    else variables.NODE_ENV = previous;
  }
}

function fixture() {
  const db = openDatabase(':memory:');
  migrate(db);
  seedSite(db, JSON.parse(readFileSync(new URL('../config/initial-site.json', import.meta.url), 'utf8')));
  const draft = readDraft(db);
  draft.config.site.name = '未发布的本地草稿';
  draft.config.gallery.enabled = true;
  saveDraft(db, draft.config, { expectedRevision: draft.revision });
  const runtime: Runtime = {
    db, mediaRoot: '/unused-private-media', origin: 'http://localhost:3000',
    ageSecret: 'a'.repeat(64), sessionSecret: 'b'.repeat(64), secureCookies: false,
  };
  return { db, runtime };
}

test('default public reads keep the published snapshot even during development', () => {
  const { db, runtime } = fixture();
  try {
    const before = readPublished(db);
    assert.deepEqual(withEnvironment('development', () => readPublicVersion(runtime)), before);
    runtime.localDraftPreview = false;
    assert.deepEqual(withEnvironment('development', () => readPublicVersion(runtime)), before);
    assert.equal(before.config.gallery.enabled, false);
  } finally { db.close(); }
});

test('explicit loopback development reads the current draft and versions every save without publishing', () => {
  const { db, runtime } = fixture();
  try {
    runtime.localDraftPreview = true;
    const publishedBefore = readPublished(db);
    const version = withEnvironment('development', () => readPublicVersion(runtime));
    assert.equal(version.versionId, 'local-draft-2');
    assert.equal(version.sourceRevision, 2);
    assert.equal(version.createdAt, readDraft(db).updatedAt);
    assert.equal(version.config.site.name, '未发布的本地草稿');
    assert.equal(version.config.gallery.enabled, true);
    const next = readDraft(db);
    next.config.site.name = '下一个本地草稿';
    saveDraft(db, next.config, { expectedRevision: next.revision });
    const changed = withEnvironment('development', () => readPublicVersion(runtime));
    assert.equal(changed.versionId, 'local-draft-3');
    assert.equal(changed.config.site.name, '下一个本地草稿');
    assert.deepEqual(readPublished(db), publishedBefore);
    assert.equal(db.prepare('SELECT count(*) AS count FROM published_versions').get()!.count, 1);
  } finally { db.close(); }
});

test('production and nondevelopment environments always retain published reads with the preview flag set', () => {
  const { db, runtime } = fixture();
  try {
    runtime.localDraftPreview = true;
    for (const environment of ['production', 'test', '', undefined]) {
      assert.deepEqual(withEnvironment(environment, () => readPublicVersion(runtime)), readPublished(db));
    }
  } finally { db.close(); }
});

test('remote, malformed and HTTPS origins retain published reads even when marked as preview', () => {
  const { db, runtime } = fixture();
  try {
    runtime.localDraftPreview = true;
    for (const origin of ['https://localhost:3000', 'http://localhost.attacker.invalid:3000', 'http://192.0.2.1:3000', 'http://localhost:3000/path', 'http://localhost:3000/', 'malformed']) {
      assert.deepEqual(withEnvironment('development', () => readPublicVersion({ ...runtime, origin })), readPublished(db));
    }
    assert.deepEqual(withEnvironment('development', () => readPublicVersion({ ...runtime, secureCookies: true })), readPublished(db));
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      assert.equal(withEnvironment('development', () => readPublicVersion({ ...runtime, origin })).versionId, 'local-draft-2');
    }
  } finally { db.close(); }
});
