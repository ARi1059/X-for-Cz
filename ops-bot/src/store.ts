/** 数据访问层。所有 SQL 集中在这里，处理器只调用方法。 */

import type { DatabaseSync } from 'node:sqlite';
import type { PostPayload } from './format.ts';
import type { Lang } from './i18n.ts';

export const DAY_MS = 86_400_000;

export type PostStatus = 'baseline' | 'pending' | 'publishing' | 'published' | 'skipped' | 'expired' | 'failed';

export type PostRecord = {
  tweetId: string;
  status: PostStatus;
  payload: PostPayload;
  messageId: number | null;
  decidedBy: number | null;
  decidedAt: number | null;
  error: string | null;
  createdAt: number;
};

export type PreviewRecord = { adminId: number; messageId: number };

export type UserRecord = { id: number; lang: Lang; createdAt: number; lastSeenAt: number };

export type MemberDay = { day: string; members: number; joins: number; leaves: number };

type RawRow = Record<string, unknown>;

function toPost(row: RawRow): PostRecord {
  return {
    tweetId: String(row.tweet_id),
    status: String(row.status) as PostStatus,
    payload: JSON.parse(String(row.payload)) as PostPayload,
    messageId: row.message_id === null ? null : Number(row.message_id),
    decidedBy: row.decided_by === null ? null : Number(row.decided_by),
    decidedAt: row.decided_at === null ? null : Number(row.decided_at),
    error: row.error === null ? null : String(row.error),
    createdAt: Number(row.created_at),
  };
}

/** 按配置时区切日，默认北京时间。 */
export function dayKey(now: number, timeZone = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** 首次轮询只记录基线，不把历史帖轰进频道。 */
  hasBaseline(): boolean {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('baseline') as { value?: string } | undefined;
    return row?.value === '1';
  }

  setBaseline(): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('baseline', '1');
  }

  getPost(tweetId: string): PostRecord | null {
    const row = this.db.prepare('SELECT * FROM posts WHERE tweet_id = ?').get(tweetId) as RawRow | undefined;
    return row ? toPost(row) : null;
  }

  /** 已存在返回 false；状态为 baseline/pending 时都不重复插入。 */
  insertPost(tweetId: string, status: PostStatus, payload: PostPayload, now: number = Date.now()): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO posts (tweet_id, status, payload, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(tweet_id) DO NOTHING`,
      )
      .run(tweetId, status, JSON.stringify(payload), now);
    return Number(result.changes) > 0;
  }

  listPending(limit = 20): PostRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM posts WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?")
      .all(limit) as RawRow[];
    return rows.map(toPost);
  }

  counts(): Record<PostStatus, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS count FROM posts GROUP BY status').all() as {
      status: string;
      count: number;
    }[];
    const result: Record<PostStatus, number> = {
      baseline: 0,
      pending: 0,
      publishing: 0,
      published: 0,
      skipped: 0,
      expired: 0,
      failed: 0,
    };
    for (const row of rows) {
      if (row.status in result) result[row.status as PostStatus] = Number(row.count);
    }
    return result;
  }

  /** 原子认领：只有从 pending 成功切到 publishing 的调用者才发送。 */
  claim(tweetId: string, adminId: number, now: number = Date.now()): boolean {
    const result = this.db
      .prepare("UPDATE posts SET status = 'publishing', decided_by = ?, decided_at = ? WHERE tweet_id = ? AND status = 'pending'")
      .run(adminId, now, tweetId);
    return Number(result.changes) > 0;
  }

  /** 启动时把上次崩溃留下的 publishing 放回 pending，避免卡死。 */
  resetPublishing(): number {
    const result = this.db.prepare("UPDATE posts SET status = 'pending' WHERE status = 'publishing'").run();
    return Number(result.changes);
  }

  finishPublished(tweetId: string, messageId: number, now: number = Date.now()): void {
    this.db
      .prepare("UPDATE posts SET status = 'published', message_id = ?, error = NULL, decided_at = ? WHERE tweet_id = ?")
      .run(messageId, now, tweetId);
  }

  finishFailed(tweetId: string, error: string, now: number = Date.now()): void {
    this.db
      .prepare("UPDATE posts SET status = 'failed', error = ?, decided_at = ? WHERE tweet_id = ?")
      .run(error.slice(0, 500), now, tweetId);
  }

  markSkipped(tweetId: string, adminId: number, now: number = Date.now()): boolean {
    const result = this.db
      .prepare("UPDATE posts SET status = 'skipped', decided_by = ?, decided_at = ? WHERE tweet_id = ? AND status = 'pending'")
      .run(adminId, now, tweetId);
    return Number(result.changes) > 0;
  }

  /** 待审超过 TTL 的帖子标记过期，返回被处理的推文 ID。 */
  expirePending(before: number, now: number = Date.now()): string[] {
    const rows = this.db
      .prepare(
        `UPDATE posts SET status = 'expired', decided_at = ?
         WHERE status = 'pending' AND created_at < ?
         RETURNING tweet_id`,
      )
      .all(now, before) as { tweet_id: string }[];
    return rows.map(row => String(row.tweet_id));
  }

  savePreview(tweetId: string, adminId: number, messageId: number): void {
    this.db
      .prepare(
        `INSERT INTO previews (tweet_id, admin_id, message_id) VALUES (?, ?, ?)
         ON CONFLICT(tweet_id, admin_id) DO UPDATE SET message_id = excluded.message_id`,
      )
      .run(tweetId, adminId, messageId);
  }

  previewsFor(tweetId: string): PreviewRecord[] {
    const rows = this.db
      .prepare('SELECT admin_id, message_id FROM previews WHERE tweet_id = ? ORDER BY admin_id')
      .all(tweetId) as { admin_id: number; message_id: number }[];
    return rows.map(row => ({ adminId: Number(row.admin_id), messageId: Number(row.message_id) }));
  }

  previewAdminIds(tweetId: string): number[] {
    return this.previewsFor(tweetId).map(row => row.adminId);
  }

  ensureUser(id: number, lang: Lang, now: number = Date.now()): UserRecord {
    this.db
      .prepare(
        `INSERT INTO users (id, lang, created_at, last_seen_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      )
      .run(id, lang, now, now);
    return this.getUser(id)!;
  }

  getUser(id: number): UserRecord | null {
    const row = this.db.prepare('SELECT id, lang, created_at, last_seen_at FROM users WHERE id = ?').get(id) as
      | { id: number; lang: string; created_at: number; last_seen_at: number }
      | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      lang: row.lang === 'zh' ? 'zh' : 'en',
      createdAt: Number(row.created_at),
      lastSeenAt: Number(row.last_seen_at),
    };
  }

  setLang(id: number, lang: Lang, now: number = Date.now()): void {
    this.db
      .prepare('UPDATE users SET lang = ?, last_seen_at = ? WHERE id = ?')
      .run(lang, now, id);
  }

  metaValue(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setMetaValue(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  /** 某天发布/跳过的数量；按配置时区切日。 */
  activityOn(day: string, timeZone: string): { published: number; skipped: number } {
    const rows = this.db
      .prepare("SELECT status, decided_at FROM posts WHERE status IN ('published', 'skipped') AND decided_at IS NOT NULL")
      .all() as { status: string; decided_at: number }[];
    let published = 0;
    let skipped = 0;
    for (const row of rows) {
      if (dayKey(Number(row.decided_at), timeZone) !== day) continue;
      if (row.status === 'published') published += 1;
      if (row.status === 'skipped') skipped += 1;
    }
    return { published, skipped };
  }

  audit(actorId: number, action: string, target: string | null = null, now: number = Date.now()): void {
    this.db
      .prepare('INSERT INTO audit_log (actor_id, action, target, created_at) VALUES (?, ?, ?, ?)')
      .run(actorId, action, target, now);
  }

  /** 成员数快照；同一天重复调用覆盖为最新值。 */
  setMemberCount(day: string, members: number): void {
    this.db
      .prepare(
        `INSERT INTO member_daily (day, members, joins, leaves) VALUES (?, ?, 0, 0)
         ON CONFLICT(day) DO UPDATE SET members = excluded.members`,
      )
      .run(day, members);
  }

  bumpJoin(day: string, inviteLink: string | null = null): void {
    this.db
      .prepare(
        `INSERT INTO member_daily (day, members, joins, leaves) VALUES (?, 0, 1, 0)
         ON CONFLICT(day) DO UPDATE SET joins = joins + 1`,
      )
      .run(day);
    if (inviteLink) {
      this.db
        .prepare(
          `INSERT INTO invite_sources (day, link, joins) VALUES (?, ?, 1)
           ON CONFLICT(day, link) DO UPDATE SET joins = joins + 1`,
        )
        .run(day, inviteLink);
    }
  }

  bumpLeave(day: string): void {
    this.db
      .prepare(
        `INSERT INTO member_daily (day, members, joins, leaves) VALUES (?, 0, 0, 1)
         ON CONFLICT(day) DO UPDATE SET leaves = leaves + 1`,
      )
      .run(day);
  }

  memberDay(day: string): MemberDay {
    const row = this.db
      .prepare('SELECT day, members, joins, leaves FROM member_daily WHERE day = ?')
      .get(day) as { day?: string; members?: number; joins?: number; leaves?: number } | undefined;
    return {
      day,
      members: Number(row?.members ?? 0),
      joins: Number(row?.joins ?? 0),
      leaves: Number(row?.leaves ?? 0),
    };
  }

  memberRange(fromDay: string, toDay: string): MemberDay[] {
    const rows = this.db
      .prepare('SELECT day, members, joins, leaves FROM member_daily WHERE day >= ? AND day <= ? ORDER BY day')
      .all(fromDay, toDay) as { day: string; members: number; joins: number; leaves: number }[];
    return rows.map(row => ({
      day: String(row.day),
      members: Number(row.members),
      joins: Number(row.joins),
      leaves: Number(row.leaves),
    }));
  }

  inviteSources(day: string): { link: string; joins: number }[] {
    const rows = this.db
      .prepare('SELECT link, joins FROM invite_sources WHERE day = ? ORDER BY joins DESC')
      .all(day) as { link: string; joins: number }[];
    return rows.map(row => ({ link: String(row.link), joins: Number(row.joins) }));
  }

  inviteSourcesRange(fromDay: string, toDay: string): { link: string; joins: number }[] {
    const rows = this.db
      .prepare(
        'SELECT link, SUM(joins) AS joins FROM invite_sources WHERE day >= ? AND day <= ? GROUP BY link ORDER BY joins DESC',
      )
      .all(fromDay, toDay) as { link: string; joins: number }[];
    return rows.map(row => ({ link: String(row.link), joins: Number(row.joins) }));
  }
}
