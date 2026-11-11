/** 轮询 X、入队、发预览、处理过期。发送动作拆到 telegram.ts。 */

import type { Api } from 'grammy';
import type { Config } from './config.ts';
import { formatPost } from './format.ts';
import type { Store, PostRecord } from './store.ts';
import { approvalKeyboard, editPreview, notify, sendPost } from './telegram.ts';
import { XError, type XClient } from './x-client.ts';

export type PollSummary = {
  checked: number;
  enqueued: number;
  expired: number;
  previews: number;
  error: string | null;
};

export type PollerDeps = {
  config: Config;
  store: Store;
  x: XClient;
  api: Api;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
};

const HOUR_MS = 3_600_000;

export class Poller {
  private readonly config: Config;
  private readonly store: Store;
  private readonly x: XClient;
  private readonly api: Api;
  private readonly now: () => number;
  private readonly log: (event: Record<string, unknown>) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly alertAt = new Map<string, number>();

  constructor(deps: PollerDeps) {
    this.config = deps.config;
    this.store = deps.store;
    this.x = deps.x;
    this.api = deps.api;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? (event => console.log(JSON.stringify(event)));
  }

  start(): void {
    if (this.timer) return;
    const tick = async (): Promise<void> => {
      await this.runOnce().catch(error => {
        this.log({ event: 'poll_failed', message: error instanceof Error ? error.message : String(error) });
      });
      this.timer = setTimeout(() => void tick(), this.config.pollMinutes * 60_000);
    };
    void tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<PollSummary> {
    if (this.running) return { checked: 0, enqueued: 0, expired: 0, previews: 0, error: 'already running' };
    this.running = true;
    const summary: PollSummary = { checked: 0, enqueued: 0, expired: 0, previews: 0, error: null };
    try {
      summary.expired = await this.expireOld();
      let posts;
      try {
        posts = await this.x.fetchTimeline();
      } catch (error) {
        summary.error = error instanceof Error ? error.message : String(error);
        this.log({ event: 'x_failed', kind: error instanceof XError ? error.kind : 'unknown', message: summary.error });
        await this.alert(`X 读取失败：${summary.error}`);
        return summary;
      }

      summary.checked = posts.length;
      const now = this.now();
      const fresh: PostRecord[] = [];

      if (!this.store.hasBaseline()) {
        const backfill = posts.slice(0, this.config.backfillCount);
        const backfillIds = new Set(backfill.map(post => post.url.split('/').pop() ?? ''));
        for (const post of posts) {
          const id = post.url.split('/').pop() ?? '';
          if (!id) continue;
          const status = backfillIds.has(id) ? 'pending' : 'baseline';
          if (this.store.insertPost(id, status, post, now) && status === 'pending') {
            const record = this.store.getPost(id);
            if (record) fresh.push(record);
          }
        }
        this.store.setBaseline();
      } else {
        // 时间线最新在前；按从旧到新入队，预览顺序更自然。
        for (const post of [...posts].reverse()) {
          const id = post.url.split('/').pop() ?? '';
          if (!id) continue;
          if (this.store.insertPost(id, 'pending', post, now)) {
            const record = this.store.getPost(id);
            if (record) fresh.push(record);
          }
        }
      }

      summary.enqueued = fresh.length;

      // 崩溃恢复：pending 但没有预览记录的，补发一次。
      for (const post of this.store.listPending(50)) {
        summary.previews += await this.ensurePreviews(post);
      }

      this.log({ event: 'poll_ok', ...summary });
      return summary;
    } finally {
      this.running = false;
    }
  }

  private async expireOld(): Promise<number> {
    const before = this.now() - this.config.approvalTtlHours * HOUR_MS;
    const ids = this.store.expirePending(before, this.now());
    for (const id of ids) {
      this.store.audit(0, 'expired', id, this.now());
      const post = this.store.getPost(id);
      const base = post ? formatPost(post.payload, this.config.timeZone).html : '';
      const text = base ? `${base}\n\n⌛ 已过期` : '⌛ 已过期';
      for (const preview of this.store.previewsFor(id)) {
        if (preview.messageId === 0) continue;
        await editPreview(this.api, preview.adminId, preview.messageId, text).catch(() => {});
      }
    }
    if (ids.length > 0) this.log({ event: 'expired', count: ids.length });
    return ids.length;
  }

  private async ensurePreviews(post: PostRecord): Promise<number> {
    const existing = new Set(this.store.previewAdminIds(post.tweetId));
    const formatted = formatPost(post.payload, this.config.timeZone);
    let sent = 0;
    for (const adminId of this.config.adminIds) {
      if (existing.has(adminId)) continue;
      try {
        const messageId = await sendPost(
          this.api,
          adminId,
          post.payload,
          formatted,
          approvalKeyboard(post.tweetId),
        );
        this.store.savePreview(post.tweetId, adminId, messageId);
        sent += 1;
      } catch (error) {
        // 记 0 表示尝试过但失败，避免每个周期重复轰炸。
        this.store.savePreview(post.tweetId, adminId, 0);
        this.log({
          event: 'preview_failed',
          tweet: post.tweetId,
          admin: adminId,
          message: error instanceof Error ? error.message : String(error),
        });
        await this.alert('预览发送失败，请检查管理员是否启动了 Bot');
      }
    }
    return sent;
  }

  private async alert(text: string): Promise<void> {
    const key = text.slice(0, 40);
    const now = this.now();
    const last = this.alertAt.get(key) ?? 0;
    if (now - last < HOUR_MS) return;
    this.alertAt.set(key, now);
    await notify(this.api, this.config.ownerId, `⚠️ ${text}`);
  }
}
