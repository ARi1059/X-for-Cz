/** X API v2 只读客户端：账号 ID 与最近原创帖（含媒体）。 */

import type { MediaKind, PostPayload } from './format.ts';

export type XErrorKind = 'unauthorized' | 'forbidden' | 'rate_limited' | 'not_found' | 'invalid' | 'network';

export class XError extends Error {
  readonly kind: XErrorKind;
  readonly retryAt: number | null;

  constructor(kind: XErrorKind, message: string, retryAt: number | null = null) {
    super(message);
    this.name = 'XError';
    this.kind = kind;
    this.retryAt = retryAt;
  }
}

type Options = {
  bearerToken: string;
  username: string;
  apiRoot: string;
  fetchImpl?: typeof fetch;
};

type MediaItem = { media_key?: string; type?: string; url?: string; preview_image_url?: string };
type Tweet = { id?: string; text?: string; created_at?: string; attachments?: { media_keys?: string[] } };

const TIMEOUT_MS = 8_000;
const MAX_POSTS = 5;

/** 只代理 X 自己的图片域名，并请求 large 尺寸。 */
export function safeImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com') return null;
    url.searchParams.set('name', 'large');
    return url.toString();
  } catch {
    return null;
  }
}

function retryTime(response: Response): number | null {
  const raw = response.headers.get('x-rate-limit-reset');
  const epoch = Number(raw);
  if (Number.isSafeInteger(epoch) && epoch > 0) return epoch * 1000;
  return null;
}

export class XClient {
  private readonly bearerToken: string;
  private readonly username: string;
  private readonly apiRoot: string;
  private readonly fetchImpl: typeof fetch;
  private userId: string | null = null;

  constructor(options: Options) {
    this.bearerToken = options.bearerToken;
    this.username = options.username;
    this.apiRoot = options.apiRoot.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async get(path: string): Promise<unknown> {
    const url = new URL(`${this.apiRoot}${path}`);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.bearerToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new XError('network', 'X API 网络请求失败');
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new XError('invalid', 'X API 返回了无效内容');
      }
    }

    const retryAt = retryTime(response);
    if (response.status === 401) throw new XError('unauthorized', 'X API 凭据无效');
    if (response.status === 403) throw new XError('forbidden', 'X API 拒绝访问（检查 App 是否挂在 Project 上）', retryAt);
    if (response.status === 404) throw new XError('not_found', 'X 账号不存在');
    if (response.status === 429) throw new XError('rate_limited', 'X API 请求超出限额', retryAt);
    throw new XError('network', `X API 返回 ${response.status}`);
  }

  async resolveUserId(): Promise<string> {
    if (this.userId) return this.userId;
    const body = await this.get(`/2/users/by/username/${encodeURIComponent(this.username)}`) as {
      data?: { id?: string };
    };
    const id = body.data?.id;
    if (typeof id !== 'string' || !id) throw new XError('invalid', 'X API 用户字段缺失');
    this.userId = id;
    return id;
  }

  /** 返回最近 5 条原创帖，最新在前。 */
  async fetchTimeline(): Promise<PostPayload[]> {
    const id = await this.resolveUserId();
    const params = new URLSearchParams({
      max_results: String(MAX_POSTS),
      exclude: 'retweets,replies',
      'tweet.fields': 'created_at,text,attachments',
      expansions: 'attachments.media_keys',
      'media.fields': 'url,preview_image_url,type',
    });
    const body = await this.get(`/2/users/${encodeURIComponent(id)}/tweets?${params.toString()}`) as {
      data?: Tweet[];
      includes?: { media?: MediaItem[] };
    };

    const media = new Map<string, MediaItem>();
    for (const item of body.includes?.media ?? []) {
      if (typeof item.media_key === 'string') media.set(item.media_key, item);
    }

    const posts: PostPayload[] = [];
    const seen = new Set<string>();
    for (const tweet of body.data ?? []) {
      if (typeof tweet.id !== 'string' || seen.has(tweet.id)) continue;
      seen.add(tweet.id);

      const assets = (tweet.attachments?.media_keys ?? [])
        .map(key => media.get(key))
        .filter((item): item is MediaItem => item !== undefined);

      const video = assets.find(item => item.type === 'video' || item.type === 'animated_gif');
      const photos = assets
        .filter(item => item.type === 'photo')
        .map(item => safeImageUrl(item.url))
        .filter((url): url is string => url !== null)
        .slice(0, 9);

      let mediaKind: MediaKind = 'text';
      let images: string[] = [];
      if (video) {
        const cover = safeImageUrl(video.preview_image_url) ?? photos[0] ?? null;
        mediaKind = 'video';
        images = cover ? [cover] : [];
      } else if (photos.length > 0) {
        mediaKind = 'image';
        images = photos;
      }

      posts.push({
        text: typeof tweet.text === 'string' ? tweet.text : '',
        url: `https://x.com/${encodeURIComponent(this.username)}/status/${encodeURIComponent(tweet.id)}`,
        createdAt: typeof tweet.created_at === 'string' ? tweet.created_at : new Date().toISOString(),
        images,
        mediaKind,
      });
    }
    return posts;
  }
}
