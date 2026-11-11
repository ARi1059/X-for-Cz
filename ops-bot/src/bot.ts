/** 运营 Bot：访客菜单 + X 审核发布 + 成员统计 + 防丢频道公告。 */

import { Bot, type Api, type Context } from 'grammy';
import type { ChatMember, InlineKeyboardButton } from 'grammy/types';
import {
  TEMPLATE_FIELDS,
  TEMPLATE_TITLES,
  composeAnnouncement,
  isAnnounceTemplate,
  validFieldValue,
  type AnnounceTemplate,
} from './announcements.ts';
import type { Config } from './config.ts';
import { formatPost } from './format.ts';
import { detectLang, otherLang, t, type Lang } from './i18n.ts';
import { sendDailyReport, sendWeeklyReport } from './reports.ts';
import { dayKey, type Store } from './store.ts';
import { editPreview, errorText, notify, postButton, sendPost } from './telegram.ts';
import { contactView, menuView, overseasView, type View } from './views.ts';

export type BotOptions = {
  config: Config;
  store: Store;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
};

type AnnounceSession =
  | { step: 'announce'; template: AnnounceTemplate; index: number; values: string[] }
  | { step: 'confirm'; template: AnnounceTemplate; text: string };

const MAX_FIELD_LENGTH = 500;

function isPresent(member: ChatMember): boolean {
  if (member.status === 'creator' || member.status === 'administrator' || member.status === 'member') return true;
  if (member.status === 'restricted') return member.is_member === true;
  return false;
}

function isPreviewChat(chat: { id: number; username?: string }, target: string): boolean {
  if (target.startsWith('@')) return (chat.username ?? '').toLowerCase() === target.slice(1).toLowerCase();
  return String(chat.id) === target;
}

function ageText(ms: number): string {
  if (ms < 60_000) return '刚刚';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`;
  return `${Math.floor(ms / 3_600_000)} 小时前`;
}

function button(text: string, data: string): InlineKeyboardButton {
  return { text, callback_data: data };
}

function promptForField(template: AnnounceTemplate, index: number): string {
  const field = TEMPLATE_FIELDS[template][index]!;
  return `请发送${field.label}（${field.hint}）。发送 /cancel 取消。`;
}

async function editView(ctx: Context, view: View): Promise<void> {
  try {
    await ctx.editMessageText(view.text, { reply_markup: { inline_keyboard: view.keyboard } });
  } catch (error) {
    const description = errorText(error);
    if (description.includes('message is not modified')) return;
    if (/message to edit not found|message can't be edited/i.test(description)) {
      await ctx.reply(view.text, { reply_markup: { inline_keyboard: view.keyboard } });
      return;
    }
    throw error;
  }
}

/** 启动自检：频道可读、Bot 是管理员且有发帖权限。 */
export async function verifyChannel(api: Api, config: Config, botId: number): Promise<string[]> {
  const issues: string[] = [];
  try {
    const chat = await api.getChat(config.previewChannel);
    if (chat.type !== 'channel') issues.push('PREVIEW_CHANNEL_ID 不是频道');
  } catch (error) {
    issues.push(`无法读取预告频道（${errorText(error)}）`);
  }
  try {
    const member = await api.getChatMember(config.previewChannel, botId);
    if (member.status !== 'administrator') {
      issues.push('Bot 不是频道管理员');
    } else if (!member.can_post_messages) {
      issues.push('Bot 没有发帖权限');
    }
  } catch (error) {
    issues.push(`无法读取 Bot 的频道权限（${errorText(error)}）`);
  }
  return issues;
}

export function createBot(options: BotOptions): Bot {
  const { config, store } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? (event => console.log(JSON.stringify(event)));
  const bot = new Bot(config.botToken, config.apiRoot ? { client: { apiRoot: config.apiRoot } } : undefined);
  const sessions = new Map<number, AnnounceSession>();

  const isAdmin = (id: number): boolean => config.adminIds.includes(id);

  bot.command(['start', 'help'], async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private') return;
    const user = store.ensureUser(from.id, detectLang(from.language_code), now());
    const view = menuView(user.lang, config, isAdmin(from.id));
    await ctx.reply(view.text, {
      reply_markup: { inline_keyboard: view.keyboard },
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('whoami', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    await ctx.reply(`用户 ID：${from.id}\n会话 ID：${ctx.chat.id}\n管理员：是`);
  });

  bot.command('pending', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    const pending = store.listPending(10);
    if (pending.length === 0) {
      await ctx.reply('没有待审帖子。');
      return;
    }
    const lines = pending.map((post, index) => {
      const series = /系列\s*\d+/u.exec(post.payload.text)?.[0] ?? '未标系列';
      return `${index + 1}. ${series} · ${ageText(now() - post.createdAt)}\n   id: ${post.tweetId}`;
    });
    await ctx.reply([`待审 ${pending.length} 条：`, '', ...lines, '', '在预览消息里点「发布」或「跳过」。'].join('\n'), {
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('stats', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    const today = dayKey(now(), config.timeZone);
    const member = store.memberDay(today);
    const activity = store.activityOn(today, config.timeZone);
    const c = store.counts();
    const net = member.joins - member.leaves;
    await ctx.reply(
      [
        '频道统计',
        '',
        `当前成员：${member.members}`,
        `今日新增 ${member.joins} · 退出 ${member.leaves} · 净增 ${net >= 0 ? '+' : ''}${net}`,
        `今日发布 ${activity.published} · 跳过 ${activity.skipped}`,
        `待审 ${c.pending} · 过期 ${c.expired} · 累计失败 ${c.failed}`,
      ].join('\n'),
      { link_preview_options: { is_disabled: true } },
    );
  });

  bot.command('report', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    const kind = (typeof ctx.match === 'string' ? ctx.match : '').trim().toLowerCase();
    const deps = { config, store, api: ctx.api, log };
    const result = kind === 'weekly'
      ? await sendWeeklyReport(deps, now())
      : await sendDailyReport(deps, now());
    await ctx.reply(result.sent > 0 ? `已发送${kind === 'weekly' ? '周报' : '日报'}。` : '发送失败：没有可送达的管理员。');
  });

  bot.command('announce', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    if (!config.backupChannelId) {
      await ctx.reply('未配置 BACKUP_CHANNEL_ID，无法发布公告。');
      return;
    }
    sessions.delete(from.id);
    await ctx.reply('选择公告模板：', {
      reply_markup: {
        inline_keyboard: [
          [button('本周更新', 'an:t:weekly')],
          [button('入口变更', 'an:t:entry')],
          [button('频道异常', 'an:t:outage')],
          [button('取消', 'an:cancel')],
        ],
      },
    });
  });

  bot.command('cancel', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    sessions.delete(from.id);
    await ctx.reply('已取消当前操作。');
  });

  bot.on('callback_query:data', async (ctx: Context) => {
    const from = ctx.from;
    if (!from) return;
    if (ctx.callbackQuery?.message?.chat.type !== 'private') return;
    const data = ctx.callbackQuery?.data ?? '';

    if (data.startsWith('ap:') || data.startsWith('sk:')) {
      await ctx.answerCallbackQuery().catch(() => {});
      if (!isAdmin(from.id)) return;
      await handleApproval(ctx, from.id, data);
      return;
    }

    if (data.startsWith('an:')) {
      await ctx.answerCallbackQuery().catch(() => {});
      if (!isAdmin(from.id)) return;
      await handleAnnounceCallback(ctx, from.id, data);
      return;
    }

    if (data.startsWith('m:')) {
      await handleMenuCallback(ctx, from.id, data);
      return;
    }
  });

  bot.on('chat_member', async (ctx: Context) => {
    const update = ctx.update.chat_member;
    if (!update || !isPreviewChat(update.chat, config.previewChannel)) return;
    const was = isPresent(update.old_chat_member);
    const current = isPresent(update.new_chat_member);
    if (was === current) return;
    const today = dayKey(now(), config.timeZone);
    if (!was && current) {
      const link = update.invite_link?.invite_link ?? null;
      store.bumpJoin(today, link);
      log({ event: 'member_join', day: today, link });
    } else {
      store.bumpLeave(today);
      log({ event: 'member_leave', day: today });
    }
  });

  bot.on('message:text', async (ctx: Context) => {
    const from = ctx.from;
    if (!from || ctx.chat?.type !== 'private' || !isAdmin(from.id)) return;
    const text = ctx.message?.text ?? '';
    if (text.startsWith('/')) return;

    const session = sessions.get(from.id);
    if (!session) {
      await ctx.reply('用 /pending 看待审，/stats 看统计，/announce 发公告。', {
        link_preview_options: { is_disabled: true },
      });
      return;
    }
    if (session.step === 'confirm') {
      await ctx.reply('请点上一条消息里的「确认发布」或「取消」。');
      return;
    }

    const value = text.trim();
    if (value.length > MAX_FIELD_LENGTH) {
      await ctx.reply(`内容过长（上限 ${MAX_FIELD_LENGTH} 字），请精简后重新发送。`);
      return;
    }
    if (!validFieldValue(session.template, session.index, value)) {
      await ctx.reply('入口地址必须是 https 链接，请重新发送。');
      return;
    }
    const values = [...session.values, value];
    const nextIndex = session.index + 1;
    if (nextIndex < TEMPLATE_FIELDS[session.template].length) {
      sessions.set(from.id, { ...session, index: nextIndex, values });
      await ctx.reply(promptForField(session.template, nextIndex));
      return;
    }

    const textPreview = composeAnnouncement(session.template, values);
    sessions.set(from.id, { step: 'confirm', template: session.template, text: textPreview });
    await ctx.reply(`公告预览\n\n${textPreview}`, {
      reply_markup: {
        inline_keyboard: [[button('确认发布到频道', 'an:confirm'), button('取消', 'an:cancel')]],
      },
    });
  });

  bot.catch(error => {
    log({ event: 'bot_error', message: error.error instanceof Error ? error.error.message : String(error.error) });
    const ctx = error.ctx;
    if (ctx.chat?.type === 'private') {
      void ctx.reply(t(detectLang(ctx.from?.language_code), 'errorGeneric')).catch(() => {});
    }
  });

  async function handleMenuCallback(ctx: Context, userId: number, data: string): Promise<void> {
    const user = store.ensureUser(userId, detectLang(ctx.from?.language_code), now());
    const lang: Lang = user.lang;
    const kind = data.slice(2);

    if (kind.startsWith('unavailable')) {
      await ctx.answerCallbackQuery({ text: t(lang, 'unavailable') }).catch(() => {});
      return;
    }
    await ctx.answerCallbackQuery().catch(() => {});

    if (kind === 'lang') {
      const next = otherLang(lang);
      store.setLang(user.id, next, now());
      const updated = store.getUser(user.id);
      await editView(ctx, menuView(updated?.lang ?? next, config, isAdmin(user.id)));
      return;
    }
    if (kind === 'menu') {
      await editView(ctx, menuView(lang, config, isAdmin(user.id)));
      return;
    }
    if (kind === 'overseas') {
      if (!config.onlyfansUrl) {
        await ctx.answerCallbackQuery({ text: t(lang, 'unavailable') }).catch(() => {});
        return;
      }
      await editView(ctx, overseasView(lang, config));
      return;
    }
    if (kind === 'contact') {
      if (!config.contactBotUrl) {
        await ctx.answerCallbackQuery({ text: t(lang, 'unavailable') }).catch(() => {});
        return;
      }
      await editView(ctx, contactView(lang, config));
    }
  }

  async function handleAnnounceCallback(ctx: Context, userId: number, data: string): Promise<void> {
    if (data === 'an:cancel') {
      sessions.delete(userId);
      await ctx.reply('已取消。');
      return;
    }
    if (data.startsWith('an:t:')) {
      const template = data.slice('an:t:'.length);
      if (!isAnnounceTemplate(template)) {
        await ctx.reply('未知的公告模板。');
        return;
      }
      sessions.set(userId, { step: 'announce', template, index: 0, values: [] });
      await ctx.reply(`${TEMPLATE_TITLES[template]}公告\n\n${promptForField(template, 0)}`);
      return;
    }
    if (data === 'an:confirm') {
      const session = sessions.get(userId);
      if (!session || session.step !== 'confirm') {
        await ctx.reply('没有待发布的公告。');
        return;
      }
      if (!config.backupChannelId) {
        await ctx.reply('未配置 BACKUP_CHANNEL_ID，无法发布公告。');
        return;
      }
      try {
        await ctx.api.sendMessage(config.backupChannelId, session.text);
      } catch {
        await ctx.reply('发布失败：请确认 Bot 是防丢频道管理员。');
        return;
      }
      store.audit(userId, 'announce', session.template, now());
      sessions.delete(userId);
      await ctx.reply('已发布到防丢频道。');
    }
  }

  async function handleApproval(ctx: Context, userId: number, data: string): Promise<void> {
    const approve = data.startsWith('ap:');
    const tweetId = data.slice(3);
    if (!tweetId) return;
    const post = store.getPost(tweetId);
    if (!post) {
      await ctx.answerCallbackQuery({ text: '帖子不存在' }).catch(() => {});
      return;
    }
    const formatted = formatPost(post.payload, config.timeZone);
    const base = formatted.html;

    if (!approve) {
      const changed = store.markSkipped(tweetId, userId, now());
      await ctx.answerCallbackQuery({ text: changed ? '已跳过' : '已处理' }).catch(() => {});
      if (!changed) return;
      store.audit(userId, 'skip', tweetId, now());
      for (const preview of store.previewsFor(tweetId)) {
        if (preview.messageId === 0) continue;
        await editPreview(ctx.api, preview.adminId, preview.messageId, `${base}\n\n⏭ 已跳过`).catch(() => {});
      }
      return;
    }

    if (!store.claim(tweetId, userId, now())) {
      await ctx.answerCallbackQuery({ text: '已处理' }).catch(() => {});
      return;
    }
    await ctx.answerCallbackQuery({ text: '正在发布…' }).catch(() => {});

    try {
      const messageId = await sendPost(ctx.api, config.previewChannel, post.payload, formatted, postButton(formatted.buttonUrl));
      store.finishPublished(tweetId, messageId, now());
      store.audit(userId, 'publish', tweetId, now());
      for (const preview of store.previewsFor(tweetId)) {
        if (preview.messageId === 0) continue;
        await editPreview(ctx.api, preview.adminId, preview.messageId, `${base}\n\n✅ 已发布`).catch(() => {});
      }
      log({ event: 'published', tweet: tweetId, admin: userId, message: messageId });
    } catch (error) {
      const message = errorText(error);
      store.finishFailed(tweetId, message, now());
      store.audit(userId, 'publish_failed', tweetId, now());
      log({ event: 'publish_failed', tweet: tweetId, admin: userId, message });
      for (const preview of store.previewsFor(tweetId)) {
        if (preview.messageId === 0) continue;
        await editPreview(ctx.api, preview.adminId, preview.messageId, `${base}\n\n⚠️ 发布失败：${message}`).catch(() => {});
      }
      await notify(ctx.api, config.ownerId, `⚠️ 发布失败：${tweetId}\n${message}`);
    }
  }

  return bot;
}
