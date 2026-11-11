/** 消息排版（纯函数）：去短链、截断、转义、固定头尾。测试不依赖 Telegram。 */

export type MediaKind = 'text' | 'image' | 'video';

export type PostPayload = {
  text: string;
  url: string;
  createdAt: string;
  images: string[];
  mediaKind: MediaKind;
};

export type FormattedPost = {
  /** 完整消息；带图时同时用作 caption。 */
  html: string;
  buttonUrl: string;
};

const BODY_LIMIT = 300;
const TCO = /https?:\/\/t\.co\/\S+/giu;

export function stripTracking(text: string): string {
  return text
    .replace(TCO, ' ')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\s*\n\s*/gu, '\n')
    .trim();
}

/** 从文案里提取「系列 03」或「Series 3」；提取不到返回 null。 */
export function extractSeries(text: string): string | null {
  const match = /(?:系列|series)\s*([0-9]{1,3})/iu.exec(text);
  if (!match?.[1]) return null;
  return `系列 ${match[1].padStart(2, '0')}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function truncate(text: string, limit: number): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return `${chars.slice(0, limit).join('')}…`;
}

/** 转义后仍要控制长度：全是 `&` 的极端文本会膨胀成 5 倍。 */
function fitBody(text: string): string {
  let limit = BODY_LIMIT;
  let escaped = escapeHtml(truncate(text, limit));
  while (escaped.length > 900 && limit > 50) {
    limit -= 50;
    escaped = escapeHtml(truncate(text, limit));
  }
  return escaped;
}

/** 北京时间 `YYYY-MM-DD HH:mm`；无法解析时返回空串。 */
export function formatTime(iso: string, timeZone = 'Asia/Shanghai'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const raw = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return raw.replace(', ', ' ');
}

function safePostUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'x.com' && url.hostname !== 'twitter.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 固定模板：
 * 🎬 新作 · 系列 03
 *
 * <正文，最多 300 字>
 *
 * 🕘 2026-11-08 21:00
 * 🔞 仅限成年人 · 完整版尚未开放
 */
export function formatPost(payload: PostPayload, timeZone = 'Asia/Shanghai'): FormattedPost {
  const clean = stripTracking(payload.text);
  const series = extractSeries(clean);
  const header = series ? `🎬 新作 · ${series}` : '🎬 新作';
  const body = truncate(clean, BODY_LIMIT);

  const blocks: string[] = [`<b>${header}</b>`];
  if (body) blocks.push(fitBody(body));
  if (payload.mediaKind === 'video') blocks.push('🎥 视频见原帖');

  const time = formatTime(payload.createdAt, timeZone);
  if (time) blocks.push(`🕘 ${time}`);
  blocks.push('🔞 仅限成年人 · 完整版尚未开放');

  const buttonUrl = safePostUrl(payload.url);
  return {
    html: blocks.join('\n\n'),
    buttonUrl: buttonUrl ?? '',
  };
}
