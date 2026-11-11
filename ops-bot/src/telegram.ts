/** Telegram 发送与编辑：预览、频道发布、状态回写。 */

import type { Api } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import type { FormattedPost, PostPayload } from './format.ts';

export type PreviewTarget = { adminId: number; messageId: number };

export function postButton(url: string): InlineKeyboardMarkup | undefined {
  if (!url) return undefined;
  return { inline_keyboard: [[{ text: '在 X 查看原帖', url }]] };
}

export function approvalKeyboard(tweetId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ 发布', callback_data: `ap:${tweetId}` },
        { text: '⏭ 跳过', callback_data: `sk:${tweetId}` },
      ],
    ],
  };
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'description' in error) {
    return String((error as { description: unknown }).description);
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * 发送一条帖子到指定聊天。返回可作为状态回写目标的 message_id：
 * 单图/纯文字是主消息；多图是带按钮的补充消息。
 */
export async function sendPost(
  api: Api,
  chatId: number | string,
  payload: PostPayload,
  formatted: FormattedPost,
  keyboard: InlineKeyboardMarkup | undefined,
): Promise<number> {
  if (payload.images.length === 0) {
    const message = await api.sendMessage(chatId, formatted.html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
    return message.message_id;
  }

  if (payload.images.length === 1) {
    const message = await api.sendPhoto(chatId, payload.images[0]!, {
      caption: formatted.html,
      parse_mode: 'HTML',
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
    return message.message_id;
  }

  const media = payload.images.slice(0, 9).map((url, index) => ({
    type: 'photo' as const,
    media: url,
    ...(index === 0 ? { caption: formatted.html, parse_mode: 'HTML' as const } : {}),
  }));
  await api.sendMediaGroup(chatId, media);
  const anchor = await api.sendMessage(chatId, '🔗 原帖链接', {
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  return anchor.message_id;
}

/** 编辑预览消息；图片消息用 caption，纯文字用 text。 */
export async function editPreview(api: Api, adminId: number, messageId: number, text: string): Promise<void> {
  const options = { reply_markup: { inline_keyboard: [] } };
  try {
    await api.editMessageText(adminId, messageId, text, { ...options, parse_mode: 'HTML' });
    return;
  } catch (error) {
    if (errorText(error).includes('message is not modified')) return;
  }
  try {
    await api.editMessageCaption(adminId, messageId, { caption: text, ...options, parse_mode: 'HTML' });
  } catch (error) {
    if (errorText(error).includes('message is not modified')) return;
    throw error;
  }
}

export async function notify(api: Api, userId: number, text: string): Promise<boolean> {
  try {
    await api.sendMessage(userId, text, { link_preview_options: { is_disabled: true } });
    return true;
  } catch {
    return false;
  }
}

export { errorText };
