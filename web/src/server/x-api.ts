/**
 * X API v2 只读客户端：账号公开指标 + 最近帖文与媒体缩略图。
 *
 * - 只接受 bearer token，token 只在服务端读取，不进入响应。
 * - 429 按 `x-rate-limit-reset` 冷却；403（套餐/权限不足）冷却 30 分钟，
 *   避免每次刷新都消耗一次请求。
 * - 返回的媒体地址只保留 pbs.twimg.com 的 https 链接。
 */

import { IntegrationError } from './integration-error.ts';

export type XCredentials = { bearerToken: string; username: string };

export type XProfile = { id: string; username: string; followers: number };

export type XPost = {
  id: string;
  text: string;
  url: string;
  image: string;
  mediaType: 'image' | 'video';
  createdAt: string;
};

const API_ROOT = 'https://api.x.com/2';
const TIMEOUT_MS = 8_000;
const MAX_POSTS = 4;
const FORBIDDEN_COOLDOWN_MS = 30 * 60_000;

let blockedUntil = 0;
let blockedKind: 'forbidden' | 'rate_limited' | null = null;
// 时间线 403 时只冷却 posts，粉丝数仍可继续刷新；账号级失败才冷却全部。
let blockedScope: 'all' | 'posts' = 'all';

function allowRequest(now: number, scope: 'profile' | 'posts'): void {
  if (blockedUntil <= now || !blockedKind) return;
  if (blockedScope === 'all' || scope === 'posts') {
    throw new IntegrationError('x', blockedKind, blockedKind === 'forbidden' ? 'X API 暂不可用' : 'X API 请求超出限额', blockedUntil);
  }
}

function clearBlock(scope: 'profile' | 'posts'): void {
  if (blockedScope === 'posts' && scope !== 'posts') return;
  blockedUntil = 0;
  blockedKind = null;
  blockedScope = 'all';
}

/** 仅测试使用：清空 403/429 冷却。 */
export function resetXApiCooldown(): void {
  blockedUntil = 0;
  blockedKind = null;
  blockedScope = 'all';
}

function rateLimitReset(response: Response, now: number): number {
  const raw = response.headers.get('x-rate-limit-reset');
  const epoch = Number(raw);
  if (Number.isSafeInteger(epoch) && epoch > 0) return Math.max(now + 60_000, epoch * 1000);
  return now + 15 * 60_000;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new IntegrationError('x', 'invalid_response', 'X API 返回了无效内容');
  }
}

async function getJson(url: URL, credentials: XCredentials, fetchImpl: typeof fetch, scope: 'profile' | 'posts'): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${credentials.bearerToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new IntegrationError('x', 'network', 'X API 网络请求失败');
  }

  if (response.ok) {
    clearBlock(scope);
    return readJson(response);
  }

  const now = Date.now();
  const retryAt = rateLimitReset(response, now);
  if (response.status === 401) throw new IntegrationError('x', 'unauthorized', 'X API 凭据无效');
  if (response.status === 403) {
    blockedUntil = now + FORBIDDEN_COOLDOWN_MS;
    blockedKind = 'forbidden';
    blockedScope = scope === 'posts' ? 'posts' : 'all';
    throw new IntegrationError('x', 'forbidden', 'X API 拒绝访问', blockedUntil);
  }
  if (response.status === 429) {
    blockedUntil = retryAt;
    blockedKind = 'rate_limited';
    blockedScope = 'all';
    throw new IntegrationError('x', 'rate_limited', 'X API 请求超出限额', retryAt);
  }
  if (response.status === 404) throw new IntegrationError('x', 'not_found', 'X 账号不存在');
  throw new IntegrationError('x', 'network', `X API 返回 ${response.status}`);
}

function cleanText(value: string): string {
  return value
    .replace(/https:\/\/t\.co\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

/** 只代理 X 自己的图片域名；附加 `name=small` 缩小预览体积。 */
export function safeImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com') return null;
    if (!url.searchParams.has('name')) url.searchParams.set('name', 'small');
    return url.toString();
  } catch {
    return null;
  }
}

/** 读取账号粉丝数与稳定 id。401/403/429 会抛出 IntegrationError。 */
export async function fetchXProfile(credentials: XCredentials, fetchImpl: typeof fetch = fetch): Promise<XProfile> {
  allowRequest(Date.now(), 'profile');
  const url = new URL(`${API_ROOT}/users/by/username/${encodeURIComponent(credentials.username)}`);
  url.searchParams.set('user.fields', 'public_metrics');
  const body = await getJson(url, credentials, fetchImpl, 'profile') as {
    data?: { id?: string; username?: string; public_metrics?: { followers_count?: number } };
  };
  const id = body.data?.id;
  const followers = body.data?.public_metrics?.followers_count;
  if (typeof id !== 'string' || !Number.isSafeInteger(followers) || (followers ?? -1) < 0) {
    throw new IntegrationError('x', 'invalid_response', 'X API 用户字段缺失');
  }
  return { id, username: body.data?.username ?? credentials.username, followers: followers as number };
}

/** 读取最近帖文（排除转推与回复），只保留带图片或视频封面的条目。 */
export async function fetchXPosts(credentials: XCredentials, userId: string, fetchImpl: typeof fetch = fetch): Promise<XPost[]> {
  allowRequest(Date.now(), 'posts');
  const url = new URL(`${API_ROOT}/users/${encodeURIComponent(userId)}/tweets`);
  url.searchParams.set('max_results', '5');
  url.searchParams.set('exclude', 'retweets,replies');
  url.searchParams.set('tweet.fields', 'created_at,text,attachments');
  url.searchParams.set('expansions', 'attachments.media_keys');
  url.searchParams.set('media.fields', 'url,preview_image_url,type');
  const body = await getJson(url, credentials, fetchImpl, 'posts') as {
    data?: Array<{ id?: string; text?: string; created_at?: string; attachments?: { media_keys?: string[] } }>;
    includes?: { media?: Array<{ media_key?: string; type?: string; url?: string; preview_image_url?: string }> };
  };

  const media = new Map<string, { type?: string; url?: string; preview_image_url?: string }>();
  for (const item of body.includes?.media ?? []) {
    if (typeof item.media_key === 'string') media.set(item.media_key, item);
  }

  const posts: XPost[] = [];
  const seen = new Set<string>();
  for (const tweet of body.data ?? []) {
    if (typeof tweet.id !== 'string' || seen.has(tweet.id)) continue;
    const keys = tweet.attachments?.media_keys ?? [];
    const asset = keys.map(key => media.get(key)).find(item => item !== undefined);
    if (!asset) continue;
    const image = safeImageUrl(asset.url ?? asset.preview_image_url);
    if (!image) continue;
    seen.add(tweet.id);
    const isVideo = asset.type === 'video' || asset.type === 'animated_gif';
    posts.push({
      id: tweet.id,
      text: cleanText(tweet.text ?? ''),
      url: `https://x.com/${encodeURIComponent(credentials.username)}/status/${encodeURIComponent(tweet.id)}`,
      image,
      mediaType: isVideo ? 'video' : 'image',
      createdAt: typeof tweet.created_at === 'string' ? tweet.created_at : new Date().toISOString(),
    });
    if (posts.length >= MAX_POSTS) break;
  }
  return posts;
}
