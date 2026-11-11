/**
 * Telegram Bot API 只读客户端：仅用于读取频道成员数。
 *
 * 这不是「前台 Bot 的数据接口」：不读订单、不读会员状态、不发送消息，
 * 也不接触 Bot 的数据库。建议用一个只加入频道、没有管理权限的独立
 * Bot token，避免把前台 Bot 的 token 复制到网站服务器。
 */

import { IntegrationError } from './integration-error.ts';

export type TelegramCredentials = { token: string; chat: string };

const API_ROOT = 'https://api.telegram.org';
const TIMEOUT_MS = 8_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

let blockedUntil = 0;

/** 仅测试使用：清空 429 冷却。 */
export function resetTelegramApiCooldown(): void {
  blockedUntil = 0;
}

type TelegramBody = {
  ok?: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

export async function fetchChatMemberCount(credentials: TelegramCredentials, fetchImpl: typeof fetch = fetch): Promise<number> {
  const now = Date.now();
  if (blockedUntil > now) throw new IntegrationError('telegram', 'rate_limited', 'Telegram API 请求超出限额', blockedUntil);

  const url = new URL(`${API_ROOT}/bot${credentials.token}/getChatMemberCount`);
  url.searchParams.set('chat_id', credentials.chat);

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch {
    throw new IntegrationError('telegram', 'network', 'Telegram API 网络请求失败');
  }

  let body: TelegramBody;
  try {
    body = await response.json() as TelegramBody;
  } catch {
    throw new IntegrationError('telegram', 'invalid_response', 'Telegram API 返回了无效内容');
  }

  if (response.ok && body.ok === true && typeof body.result === 'number') return body.result;

  const code = body.error_code ?? response.status;
  if (code === 401) throw new IntegrationError('telegram', 'unauthorized', 'Telegram Bot token 无效');
  if (code === 429) {
    const retryAfter = body.parameters?.retry_after;
    const wait = typeof retryAfter === 'number' && retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_COOLDOWN_MS;
    blockedUntil = Date.now() + wait;
    throw new IntegrationError('telegram', 'rate_limited', 'Telegram API 请求超出限额', blockedUntil);
  }
  if (code === 400) throw new IntegrationError('telegram', 'invalid_chat', 'Telegram 频道不存在或不可读');
  if (code === 403) throw new IntegrationError('telegram', 'forbidden', 'Bot 无权读取该频道');
  throw new IntegrationError('telegram', 'network', `Telegram API 返回 ${code}`);
}
