import { createHash, randomUUID } from 'node:crypto';
import { parseSiteConfig, validateForPublish, type SiteConfig, type ValidationIssue } from '../contracts/site-config.ts';
import { immediateTransaction, type Database } from './database.ts';

export class RevisionConflictError extends Error {
  readonly code = 'REVISION_CONFLICT';
  constructor() { super('Draft changed; reload the current revision before saving or publishing'); }
}

export class PublishValidationError extends Error {
  readonly code = 'PUBLISH_VALIDATION_FAILED';
  constructor(readonly issues: ValidationIssue[]) { super('Draft is not ready to publish'); }
}

export interface Draft { revision: number; config: SiteConfig; updatedAt: number }
export interface Published { versionId: string; sourceRevision: number; config: SiteConfig; createdAt: number; bootstrap: boolean }
export interface WriteOptions { expectedRevision: number; actorId?: number }

function mediaIds(config: SiteConfig): string[] {
  return [...new Set([
    config.site.avatarMediaId,
    config.meta.shareMediaId,
    ...config.gallery.photos.map(photo => photo.mediaId),
  ].filter((id): id is string => typeof id === 'string'))];
}

function assertRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Expected revision must be a positive integer');
}

function replaceDraftMedia(db: Database, config: SiteConfig): void {
  db.prepare('DELETE FROM draft_media_refs WHERE draft_id = 1').run();
  const add = db.prepare('INSERT INTO draft_media_refs(draft_id, media_id) VALUES (1, ?)');
  for (const id of mediaIds(config)) add.run(id);
}

export function readDraft(db: Database): Draft {
  const row = db.prepare('SELECT revision, config_json, updated_at FROM site_draft WHERE id = 1').get();
  if (!row) throw new Error('Site is not initialized');
  return { revision: Number(row.revision), config: parseSiteConfig(JSON.parse(String(row.config_json))), updatedAt: Number(row.updated_at) };
}

export function readPublished(db: Database): Published {
  const row = db.prepare(`SELECT v.* FROM published_versions v
    JOIN published_pointer p ON p.version_id = v.id WHERE p.id = 1`).get();
  if (!row) throw new Error('Site is not initialized');
  return {
    versionId: String(row.id), sourceRevision: Number(row.source_revision),
    config: parseSiteConfig(JSON.parse(String(row.config_json))),
    createdAt: Number(row.created_at), bootstrap: row.bootstrap === 1,
  };
}

/** Bootstrap is a closed, media-free starting page, never a shortcut for publishing. */
export function seedSite(db: Database, input: unknown): { created: boolean; draft: Draft; published: Published } {
  const config = parseSiteConfig(input);
  if (config.links.some(link => link.url !== null || link.enabled)
    || config.ageGate.exitUrl !== null || config.footer.contactEmail !== null
    || mediaIds(config).length > 0 || config.gallery.photos.length > 0) {
    throw new Error('Bootstrap must contain no real targets, enabled entries, contact email, or media');
  }
  return immediateTransaction(db, () => {
    const draft = db.prepare('SELECT id FROM site_draft WHERE id = 1').get();
    const published = db.prepare('SELECT id FROM published_pointer WHERE id = 1').get();
    if (draft && published) return { created: false, draft: readDraft(db), published: readPublished(db) };
    if (draft || published) throw new Error('Incomplete site state; restore a consistent backup before seeding');
    const json = JSON.stringify(config);
    const now = Date.now();
    db.prepare('INSERT INTO site_draft(id, revision, config_json, updated_at) VALUES (1, 1, ?, ?)').run(json, now);
    const version = db.prepare(`INSERT INTO published_versions(source_revision, config_json, config_sha256, bootstrap, created_at)
      VALUES (1, ?, ?, 1, ?)`).run(json, createHash('sha256').update(json).digest('hex'), now);
    db.prepare('INSERT INTO published_pointer(id, version_id) VALUES (1, ?)').run(version.lastInsertRowid);
    return { created: true, draft: readDraft(db), published: readPublished(db) };
  });
}

export function saveDraft(db: Database, input: unknown, options: WriteOptions): Draft {
  assertRevision(options.expectedRevision);
  const config = parseSiteConfig(input);
  return immediateTransaction(db, () => {
    const now = Date.now();
    const result = db.prepare(`UPDATE site_draft SET revision = revision + 1, config_json = ?, updated_at = ?
      WHERE id = 1 AND revision = ?`).run(JSON.stringify(config), now, options.expectedRevision);
    if (Number(result.changes) !== 1) throw new RevisionConflictError();
    replaceDraftMedia(db, config);
    db.prepare('INSERT INTO audit_log(action, actor_id, draft_revision, created_at) VALUES (?, ?, ?, ?)')
      .run('draft_saved', options.actorId ?? null, options.expectedRevision + 1, now);
    return readDraft(db);
  });
}

/** Validation, immutable snapshot, media references and pointer move share one write lock. */
export function publishDraft(db: Database, options: WriteOptions & { siteOrigin?: string }): Published {
  assertRevision(options.expectedRevision);
  return immediateTransaction(db, () => {
    const draft = readDraft(db);
    if (draft.revision !== options.expectedRevision) throw new RevisionConflictError();
    const ready = db.prepare("SELECT id, purpose FROM media_assets WHERE status = 'ready'").all();
    const readyMediaIds = new Set(ready.map(row => String(row.id)));
    const publicShareMediaIds = new Set(ready.filter(row => row.purpose === 'public_share').map(row => String(row.id)));
    const publishOptions = { ...(options.siteOrigin === undefined ? {} : { siteOrigin: options.siteOrigin }), readyMediaIds, publicShareMediaIds };
    const issues = validateForPublish(draft.config, publishOptions);
    if (issues.length) throw new PublishValidationError(issues);
    const json = JSON.stringify(draft.config);
    const now = Date.now();
    const version = db.prepare(`INSERT INTO published_versions(source_revision, config_json, config_sha256, bootstrap, created_at, created_by)
      VALUES (?, ?, ?, 0, ?, ?)`).run(draft.revision, json, createHash('sha256').update(json).digest('hex'), now, options.actorId ?? null);
    const reference = db.prepare('INSERT INTO published_media_refs(version_id, media_id) VALUES (?, ?)');
    for (const id of mediaIds(draft.config)) reference.run(version.lastInsertRowid, id);
    db.prepare('UPDATE published_pointer SET version_id = ? WHERE id = 1').run(version.lastInsertRowid);
    db.prepare('INSERT INTO audit_log(action, actor_id, draft_revision, version_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('site_published', options.actorId ?? null, draft.revision, version.lastInsertRowid, now);
    return readPublished(db);
  });
}

export interface MediaInput {
  id?: string;
  storageKey: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  status: 'pending' | 'ready' | 'failed';
  purpose?: 'controlled' | 'public_share';
}

/** Metadata is supplied only after the upload pipeline verifies and processes the bytes. */
export function registerMedia(db: Database, input: MediaInput, actorId?: number): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(input.storageKey)
    || input.storageKey.split('/').some(part => part === '..' || part === '.' || part === '')) {
    throw new Error('Storage key must be a relative generated path');
  }
  const id = input.id ?? randomUUID();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid media id');
  return immediateTransaction(db, () => {
    const now = Date.now();
    db.prepare(`INSERT INTO media_assets(id, storage_key, mime_type, byte_size, width, height, sha256, status, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.storageKey, input.mimeType, input.byteSize,
        input.width, input.height, input.sha256, input.status, input.purpose ?? 'controlled', now);
    db.prepare('INSERT INTO audit_log(action, actor_id, media_id, created_at) VALUES (?, ?, ?, ?)')
      .run('media_registered', actorId ?? null, id, now);
    return id;
  });
}

/** FK restrictions retain any media still referenced by a draft or published snapshot. */
export function deleteMedia(db: Database, id: string, actorId?: number): boolean {
  return immediateTransaction(db, () => {
    const result = db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
    if (Number(result.changes) === 0) return false;
    db.prepare('INSERT INTO audit_log(action, actor_id, media_id, created_at) VALUES (?, ?, ?, ?)')
      .run('media_deleted', actorId ?? null, id, Date.now());
    return true;
  });
}

export function incrementStatistic(db: Database, input: {
  day: string;
  source: string;
  event: 'gate_view' | 'adult_confirm' | 'leave' | 'link_click';
  linkId?: 'x_profile' | 'tg_personal' | 'tg_preview' | 'onlyfans' | 'membership';
}): void {
  const date = new Date(`${input.day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== input.day) {
    throw new Error('Statistic day must be a valid UTC date');
  }
  const source = ['profile', 'pin', 'weekly'].includes(input.source) ? input.source : 'other';
  db.prepare(`INSERT INTO daily_statistics(day, source, event, link_id, count) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(day, source, event, link_id) DO UPDATE SET count = count + 1`)
    .run(input.day, source, input.event, input.linkId ?? '');
}
