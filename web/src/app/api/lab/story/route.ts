import { NextResponse } from 'next/server';
import {
  FALLBACK_FEED, FALLBACK_POSTS, FALLBACK_STATS, formatCount,
  type StoryFeed, type StoryPost, type StoryStat,
} from '../../../../components/story-content.ts';

export const dynamic = 'force-dynamic';

type XResult = { followers: number; username: string; posts: StoryPost[] } | null;
type TelegramResult = { count: number } | null;
type Cache = { at: number; value: StoryFeed };
const CACHE_MS = 5 * 60_000;
let cache: Cache | null = null;

const timeout = () => AbortSignal.timeout(6000);

async function fetchX(): Promise<XResult> {
  const token = process.env.X_BEARER_TOKEN?.trim();
  const username = process.env.X_USERNAME?.trim();
  if (!token || !username) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const userResponse = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics`, { headers, signal: timeout(), cache: 'no-store' });
  if (!userResponse.ok) return null;
  const userBody = await userResponse.json() as { data?: { id?: string; username?: string; public_metrics?: { followers_count?: number } } };
  const userId = userBody.data?.id;
  const followers = userBody.data?.public_metrics?.followers_count;
  if (!userId || typeof followers !== 'number') return null;

  const tweetsUrl = new URL(`https://api.x.com/2/users/${userId}/tweets`);
  tweetsUrl.searchParams.set('max_results', '5');
  tweetsUrl.searchParams.set('exclude', 'retweets,replies');
  tweetsUrl.searchParams.set('tweet.fields', 'created_at,text,attachments');
  tweetsUrl.searchParams.set('expansions', 'attachments.media_keys');
  tweetsUrl.searchParams.set('media.fields', 'url,preview_image_url,type,alt_text');
  const tweetsResponse = await fetch(tweetsUrl, { headers, signal: timeout(), cache: 'no-store' });
  if (!tweetsResponse.ok) return { followers, username, posts: [] };

  const tweetBody = await tweetsResponse.json() as {
    data?: Array<{ id: string; text?: string; created_at?: string; attachments?: { media_keys?: string[] } }>;
    includes?: { media?: Array<{ media_key: string; type?: string; url?: string; preview_image_url?: string }> };
  };
  const media = new Map((tweetBody.includes?.media ?? []).map(item => [item.media_key, item]));
  const posts: StoryPost[] = [];
  for (const tweet of tweetBody.data ?? []) {
    const key = tweet.attachments?.media_keys?.[0];
    const asset = key ? media.get(key) : undefined;
    if (!asset) continue;
    const isVideo = asset.type !== 'photo';
    const image = isVideo ? asset.preview_image_url : asset.url;
    if (!image) continue;
    posts.push({
      id: tweet.id,
      text: (tweet.text ?? '').replace(/https:\/\/t\.co\/\S+/g, '').trim().slice(0, 180),
      url: `https://x.com/${username}/status/${tweet.id}`,
      image,
      mediaType: isVideo ? 'video' : 'image',
      createdAt: tweet.created_at ?? new Date().toISOString(),
      demo: false,
    });
    if (posts.length === 4) break;
  }
  return { followers, username, posts };
}

async function fetchTelegram(chat: string | undefined): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !chat?.trim()) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${encodeURIComponent(chat.trim())}`, { signal: timeout(), cache: 'no-store' });
  if (!response.ok) return null;
  const body = await response.json() as { ok?: boolean; result?: number };
  return body.ok && typeof body.result === 'number' ? { count: body.result } : null;
}

function stat(key: string, fallback: StoryStat, count: number | null, source: string, now: string): StoryStat {
  if (count === null) return { ...fallback, updatedAt: now, demo: true };
  return { ...fallback, count, display: formatCount(count), updatedAt: now, source, demo: false };
}

async function build(): Promise<StoryFeed> {
  const [x, tgAnti, tgPreview] = await Promise.allSettled([
    fetchX(),
    fetchTelegram(process.env.TELEGRAM_ANTI_LOSS_CHAT),
    fetchTelegram(process.env.TELEGRAM_PREVIEW_CHAT),
  ]);
  const xValue = x.status === 'fulfilled' ? x.value : null;
  const antiValue = tgAnti.status === 'fulfilled' ? tgAnti.value : null;
  const previewValue = tgPreview.status === 'fulfilled' ? tgPreview.value : null;
  const now = new Date().toISOString();
  const stats: StoryStat[] = [
    stat('x', FALLBACK_STATS[0]!, xValue?.followers ?? null, 'X API', now),
    stat('tg_anti', FALLBACK_STATS[1]!, antiValue?.count ?? null, 'Telegram Bot API', now),
    stat('tg_preview', FALLBACK_STATS[2]!, previewValue?.count ?? null, 'Telegram Bot API', now),
  ];
  const posts = xValue?.posts.length ? xValue.posts : FALLBACK_POSTS;
  const demo = stats.some(item => item.demo) || posts.some(item => item.demo);
  return {
    stats,
    posts,
    updatedAt: now,
    demo,
    notice: demo ? '部分数据为示例 · 配置 X / Telegram API 后自动更新' : null,
  };
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') return new NextResponse('Not found', { status: 404 });
  if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.value, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const value = await build();
    cache = { at: Date.now(), value };
    return NextResponse.json(value, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(FALLBACK_FEED, { headers: { 'Cache-Control': 'no-store' } });
  }
}
