/**
 * Story Lab 公开数据的组装层。
 *
 * 设计约束：
 * - 任何外部 API 失败都只影响对应的一块数据，不抛到路由；
 * - 生产环境不返回示例数字（避免把 12.8K 之类的假数据展示给访客）；
 * - 开发环境且完全未配置凭证时，保留示例数据供设计预览；
 * - 整个 feed 在进程内缓存，默认 5 分钟，避免每次访问都消耗 X 的读额度。
 */

import {
  FALLBACK_FEED, FALLBACK_POSTS, FALLBACK_STATS, formatCount,
  type StoryFeed, type StoryPost, type StoryStat,
} from '../components/story-content.ts';
import { toIntegrationError, type IntegrationError } from './integration-error.ts';
import { fetchChatMemberCount } from './telegram-api.ts';
import { fetchXPosts, fetchXProfile, type XPost, type XProfile } from './x-api.ts';

export type StoryConfig = {
  x: { bearerToken: string; username: string } | null;
  telegram: { token: string; antiLossChat: string | null; previewChat: string | null } | null;
  demo: boolean;
  ttlMs: number;
  issues: string[];
};

const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 3600;

/** 从环境变量解析接入配置；返回 issues 供自检脚本展示，不包含任何密钥内容。 */
export function readStoryConfig(env: NodeJS.ProcessEnv = process.env): StoryConfig {
  const issues: string[] = [];

  const token = (env.X_BEARER_TOKEN ?? '').trim();
  const rawUsername = (env.X_USERNAME ?? '').trim().replace(/^@/, '');
  const username = /^[A-Za-z0-9_]{1,15}$/.test(rawUsername) ? rawUsername : null;
  if (rawUsername && !username) issues.push('X_USERNAME 格式无效（1–15 位字母、数字或下划线）');
  if (token && !username) issues.push('X_USERNAME 缺失或无效');
  if (!token && username) issues.push('X_BEARER_TOKEN 缺失');
  const x = token && username ? { bearerToken: token, username } : null;

  const botToken = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const botTokenValid = /^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(botToken);
  if (botToken && !botTokenValid) issues.push('TELEGRAM_BOT_TOKEN 格式无效');
  const antiLossChat = parseChat(env.TELEGRAM_ANTI_LOSS_CHAT);
  const previewChat = parseChat(env.TELEGRAM_PREVIEW_CHAT);
  if ((env.TELEGRAM_ANTI_LOSS_CHAT ?? '').trim() && !antiLossChat) issues.push('TELEGRAM_ANTI_LOSS_CHAT 格式无效');
  if ((env.TELEGRAM_PREVIEW_CHAT ?? '').trim() && !previewChat) issues.push('TELEGRAM_PREVIEW_CHAT 格式无效');
  if (botToken && botTokenValid && !antiLossChat && !previewChat) issues.push('至少配置一个 Telegram 频道');
  const telegram = botTokenValid && (antiLossChat || previewChat)
    ? { token: botToken, antiLossChat, previewChat }
    : null;

  const rawTtl = (env.STORY_FEED_TTL_SECONDS ?? '').trim();
  let ttlSeconds = DEFAULT_TTL_SECONDS;
  if (rawTtl) {
    const value = Number(rawTtl);
    if (Number.isSafeInteger(value) && value >= MIN_TTL_SECONDS && value <= MAX_TTL_SECONDS) ttlSeconds = value;
    else issues.push(`STORY_FEED_TTL_SECONDS 必须是 ${MIN_TTL_SECONDS}–${MAX_TTL_SECONDS} 的整数`);
  }

  const demo = env.NODE_ENV !== 'production' && !x && !telegram;

  return { x, telegram, demo, ttlMs: ttlSeconds * 1000, issues };
}

/** 接受 @name、t.me/name、频道数字 id（-100...）；其他形式返回 null。 */
export function parseChat(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (/^-\d{6,20}$/.test(value)) return value;
  const link = /^https?:\/\/t\.me\/([A-Za-z0-9_]{4,32})\/?$/i.exec(value);
  const handle = link?.[1] ?? value.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{4,32}$/.test(handle)) return `@${handle}`;
  return null;
}

type XLoad = {
  followers: number | null;
  posts: StoryPost[];
  profileError: IntegrationError | null;
  postsError: IntegrationError | null;
};

type TelegramLoad = { count: number | null; error: IntegrationError | null };

async function loadX(config: StoryConfig, fetchImpl: typeof fetch): Promise<XLoad> {
  if (!config.x) return { followers: null, posts: [], profileError: null, postsError: null };
  let profile: XProfile;
  try {
    profile = await fetchXProfile(config.x, fetchImpl);
  } catch (error) {
    return { followers: null, posts: [], profileError: toIntegrationError(error, 'x'), postsError: null };
  }
  try {
    const posts = await fetchXPosts(config.x, profile.id, fetchImpl);
    return { followers: profile.followers, posts: posts.map(toStoryPost), profileError: null, postsError: null };
  } catch (error) {
    return { followers: profile.followers, posts: [], profileError: null, postsError: toIntegrationError(error, 'x') };
  }
}

async function loadTelegram(token: string | null, chat: string | null, fetchImpl: typeof fetch): Promise<TelegramLoad> {
  if (!token || !chat) return { count: null, error: null };
  try {
    return { count: await fetchChatMemberCount({ token, chat }, fetchImpl), error: null };
  } catch (error) {
    return { count: null, error: toIntegrationError(error, 'telegram') };
  }
}

function toStoryPost(post: XPost): StoryPost {
  return {
    id: post.id,
    text: post.text,
    url: post.url,
    image: post.image,
    mediaType: post.mediaType,
    createdAt: post.createdAt,
    demo: false,
  };
}

function stat(key: string, label: string, count: number | null, source: string, updatedAt: string): StoryStat {
  if (count === null) return { key, label, count: null, display: '—', updatedAt, source, state: 'unavailable' };
  return { key, label, count, display: formatCount(count), updatedAt, source, state: 'live' };
}

function noticeFor(config: StoryConfig, x: XLoad, anti: TelegramLoad, preview: TelegramLoad): string | null {
  if (!config.x && !config.telegram) return '实时数据暂不可用';
  const parts: string[] = [];
  if (!config.x) parts.push('X 数据暂未接入');
  else if (x.profileError) parts.push('X 数据暂不可用');
  else if (x.postsError) parts.push('X 最新内容暂不可用');
  if (!config.telegram) parts.push('Telegram 数据暂未接入');
  else if (anti.error || preview.error) parts.push('Telegram 数据暂不可用');
  return parts.length ? parts.join(' · ') : null;
}

export type StoryFeedDeps = {
  config: StoryConfig;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export async function buildStoryFeed({ config, fetchImpl = fetch, now = Date.now }: StoryFeedDeps): Promise<StoryFeed> {
  const updatedAt = new Date(now()).toISOString();

  if (config.demo) {
    return {
      ...FALLBACK_FEED,
      updatedAt,
      stats: FALLBACK_STATS.map(item => ({ ...item, updatedAt })),
      posts: FALLBACK_POSTS.map(item => ({ ...item })),
      demo: true,
    };
  }

  const [x, anti, preview] = await Promise.all([
    loadX(config, fetchImpl),
    loadTelegram(config.telegram?.token ?? null, config.telegram?.antiLossChat ?? null, fetchImpl),
    loadTelegram(config.telegram?.token ?? null, config.telegram?.previewChat ?? null, fetchImpl),
  ]);

  if (x.profileError) console.warn('[story] x profile unavailable:', x.profileError.kind);
  if (x.postsError) console.warn('[story] x posts unavailable:', x.postsError.kind);
  if (anti.error) console.warn('[story] telegram anti-loss channel unavailable:', anti.error.kind);
  if (preview.error) console.warn('[story] telegram preview channel unavailable:', preview.error.kind);

  return {
    stats: [
      stat('x', FALLBACK_STATS[0]!.label, x.followers, 'X API', updatedAt),
      stat('tg_anti', FALLBACK_STATS[1]!.label, anti.count, 'Telegram Bot API', updatedAt),
      stat('tg_preview', FALLBACK_STATS[2]!.label, preview.count, 'Telegram Bot API', updatedAt),
    ],
    posts: x.posts,
    updatedAt,
    demo: false,
    notice: noticeFor(config, x, anti, preview),
  };
}

export function emptyStoryFeed(updatedAt = new Date().toISOString()): StoryFeed {
  return {
    stats: [
      stat('x', FALLBACK_STATS[0]!.label, null, 'X API', updatedAt),
      stat('tg_anti', FALLBACK_STATS[1]!.label, null, 'Telegram Bot API', updatedAt),
      stat('tg_preview', FALLBACK_STATS[2]!.label, null, 'Telegram Bot API', updatedAt),
    ],
    posts: [],
    updatedAt,
    demo: false,
    notice: '实时数据暂不可用',
  };
}

let cache: { at: number; value: StoryFeed } | null = null;
let pending: Promise<StoryFeed> | null = null;

/** 进程内缓存；并发请求共享同一次上游刷新。 */
export async function getStoryFeed(): Promise<StoryFeed> {
  const config = readStoryConfig();
  const now = Date.now();
  if (cache && now - cache.at < config.ttlMs) return cache.value;
  if (pending) return pending;
  pending = buildStoryFeed({ config })
    .then(value => {
      cache = { at: now, value };
      return value;
    })
    .catch(error => {
      console.warn('[story] feed build failed:', error instanceof Error ? error.name : 'unknown');
      return cache?.value ?? emptyStoryFeed();
    })
    .finally(() => { pending = null; });
  return pending;
}

/** 仅测试使用。 */
export function resetStoryFeedCache(): void {
  cache = null;
  pending = null;
}
