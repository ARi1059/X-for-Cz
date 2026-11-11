import { createHash } from 'node:crypto';
import { BRAND } from '../brand.ts';
import { parseSiteConfig, validateForPublish, type SiteConfig } from '../contracts/site-config.ts';
import { immediateTransaction, type Database } from './database.ts';
import { readDraft, readPublished } from './site-store.ts';

const refs = (config: SiteConfig) => [...new Set([
  config.site.avatarMediaId, config.meta.shareMediaId, ...config.gallery.photos.map(photo => photo.mediaId),
].filter((id): id is string => id !== null))];

function branded(config: SiteConfig, avatar: string): SiteConfig {
  const next = structuredClone(config);
  next.site = { name: BRAND.name, tagline: BRAND.tagline, description: BRAND.description, avatarMediaId: avatar };
  next.meta.title = '教父｜官方导航';
  next.meta.description = '教父官方入口与服务公告，仅限成年人。';
  next.meta.shareMediaId = null;
  next.links = next.links.map(link => ({ ...link, label: BRAND.linkLabels[link.id] }));
  return parseSiteConfig(next);
}

/** Brand-only migration: never promotes the administrator's unpublished draft. */
export function migrateBrand(db: Database, avatar: string) {
  return immediateTransaction(db, () => {
    const asset = db.prepare("SELECT id FROM media_assets WHERE id=? AND status='ready' AND purpose='controlled'").get(avatar);
    if (!asset) throw new Error('A ready, controlled brand avatar is required');
    const draft = readDraft(db);
    const published = readPublished(db);
    const draftConfig = branded(draft.config, avatar);
    const publicConfig = branded(published.config, avatar);
    const nextDraftJson = JSON.stringify(draftConfig);
    const nextPublicJson = JSON.stringify(publicConfig);
    const draftChanged = nextDraftJson !== JSON.stringify(draft.config);
    const publishedChanged = nextPublicJson !== JSON.stringify(published.config);
    // A brand migration may preserve an unready bootstrap, but may add no new
    // validation failures or silently relax normal publication requirements.
    const ready = db.prepare("SELECT id, purpose FROM media_assets WHERE status='ready'").all();
    const options = {
      readyMediaIds: new Set(ready.map(row => String(row.id))),
      publicShareMediaIds: new Set(ready.filter(row => row.purpose === 'public_share').map(row => String(row.id))),
    };
    const beforeIssues = new Set(validateForPublish(published.config, options).map(issue => issue.path + ':' + issue.code));
    if (validateForPublish(publicConfig, options).some(issue => !beforeIssues.has(issue.path + ':' + issue.code))) {
      throw new Error('Brand migration introduced a publication validation failure');
    }
    const now = Date.now();
    if (draftChanged) {
      db.prepare('UPDATE site_draft SET revision=revision+1, config_json=?, updated_at=? WHERE id=1').run(nextDraftJson, now);
      db.prepare('DELETE FROM draft_media_refs WHERE draft_id=1').run();
      for (const id of refs(draftConfig)) db.prepare('INSERT INTO draft_media_refs(draft_id,media_id) VALUES(1,?)').run(id);
      db.prepare("INSERT INTO audit_log(action,draft_revision,created_at) VALUES('draft_saved',?,?)").run(draft.revision + 1, now);
    }
    let versionId = published.versionId;
    if (publishedChanged) {
      const result = db.prepare(`INSERT INTO published_versions(source_revision,config_json,config_sha256,bootstrap,created_at)
        VALUES(?,?,?,0,?)`).run(published.sourceRevision, nextPublicJson, createHash('sha256').update(nextPublicJson).digest('hex'), now);
      versionId = String(result.lastInsertRowid);
      for (const id of refs(publicConfig)) db.prepare('INSERT INTO published_media_refs(version_id,media_id) VALUES(?,?)').run(versionId, id);
      db.prepare('UPDATE published_pointer SET version_id=? WHERE id=1').run(versionId);
      db.prepare("INSERT INTO audit_log(action,draft_revision,version_id,created_at) VALUES('site_published',?,?,?)")
        .run(published.sourceRevision, versionId, now);
    }
    return { draftChanged, publishedChanged, draftRevision: draft.revision + Number(draftChanged), versionId };
  });
}
