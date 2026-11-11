/** 测试脚手架：假 Telegram + 假 X + 内存数据库 + 固定配置。 */

import type { Update } from 'grammy/types';
import { createBot } from '../src/bot.ts';
import type { Config } from '../src/config.ts';
import { openDatabase } from '../src/db.ts';
import { Poller } from '../src/poller.ts';
import { Scheduler } from '../src/scheduler.ts';
import { Store } from '../src/store.ts';
import { XClient } from '../src/x-client.ts';
import { startFakeTelegram, type FakeTelegram } from './fake-telegram.ts';
import { startFakeX, type FakeTweet, type FakeX } from './fake-x.ts';

export const baseConfig: Config = {
  botToken: '123:test-token',
  ownerId: 111,
  adminIds: [111, 222],
  previewChannel: '-1001234567890',
  previewChannelUrl: 'https://t.me/gf_preview',
  backupChannelId: -1009999999999,
  backupChannelUrl: 'https://t.me/gf_backup',
  onlyfansUrl: 'https://onlyfans.com/gf',
  contactBotUrl: 'https://t.me/gf_support',
  xEnabled: true,
  xBearerToken: 'test-bearer',
  xUsername: 'gf',
  pollMinutes: 5,
  approvalTtlHours: 24,
  backfillCount: 0,
  dailyReport: { hour: 10, minute: 0 },
  weeklyReport: { weekday: 1, hour: 10, minute: 0 },
  databasePath: ':memory:',
  timeZone: 'Asia/Shanghai',
  apiRoot: null,
  xApiRoot: 'https://api.x.com',
};

export type Harness = {
  telegram: FakeTelegram;
  xapi: FakeX;
  store: Store;
  config: Config;
  bot: ReturnType<typeof createBot>;
  poller: Poller;
  scheduler: Scheduler;
  close(): Promise<void>;
};

export async function createHarness(overrides: Partial<Config> = {}, now: () => number = Date.now): Promise<Harness> {
  const telegram = await startFakeTelegram();
  const xapi = await startFakeX(baseConfig.xUsername);
  const db = openDatabase(':memory:');
  const store = new Store(db);
  const config: Config = { ...baseConfig, ...overrides, apiRoot: telegram.apiRoot, xApiRoot: xapi.root };
  const bot = createBot({ config, store, now, log: () => {} });
  await bot.init();
  const x = new XClient({ bearerToken: config.xBearerToken, username: config.xUsername, apiRoot: config.xApiRoot });
  const poller = new Poller({ config, store, x, api: bot.api, now, log: () => {} });
  const scheduler = new Scheduler({ config, store, api: bot.api, now, log: () => {} });
  return {
    telegram,
    xapi,
    store,
    config,
    bot,
    poller,
    scheduler,
    async close() {
      await telegram.close();
      await xapi.close();
      db.close();
    },
  };
}

const sender = (id: number, languageCode = 'zh-CN') => ({
  id,
  is_bot: false,
  first_name: 'Admin',
  language_code: languageCode,
});

export function callbackUpdate(userId: number, data: string): Update {
  return {
    update_id: 2,
    callback_query: {
      id: `cb-${data}`,
      from: sender(userId),
      chat_instance: 'ci',
      data,
      message: {
        message_id: 500,
        date: Math.floor(Date.now() / 1000),
        chat: { id: userId, type: 'private', first_name: 'Admin' },
        text: 'preview',
      },
    },
  } as unknown as Update;
}

export function commandUpdate(userId: number, text: string, languageCode = 'zh-CN'): Update {
  const command = text.split(/\s/)[0] ?? '';
  return {
    update_id: 3,
    message: {
      message_id: 3,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private', first_name: 'Admin' },
      from: sender(userId, languageCode),
      text,
      entities: [{ type: 'bot_command', offset: 0, length: command.length }],
    },
  } as unknown as Update;
}

export function plainTextUpdate(userId: number, text: string, languageCode = 'zh-CN'): Update {
  return {
    update_id: 4,
    message: {
      message_id: 4,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private', first_name: 'Admin' },
      from: sender(userId, languageCode),
      text,
    },
  } as unknown as Update;
}

type KeyboardButton = { text: string; url?: string; callback_data?: string };

export function keyboardOf(params: Record<string, unknown>): KeyboardButton[][] {
  const markup = params.reply_markup as { inline_keyboard?: KeyboardButton[][] } | undefined;
  return markup?.inline_keyboard ?? [];
}

export function chatMemberUpdate(
  userId: number,
  options: { old: string; new: string; link?: string; chatId?: number },
): Update {
  return {
    update_id: 5,
    chat_member: {
      chat: { id: options.chatId ?? -1001234567890, type: 'channel', title: '预告频道' },
      from: sender(userId),
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: options.old, user: sender(userId) },
      new_chat_member: { status: options.new, user: sender(userId) },
      ...(options.link
        ? {
            invite_link: {
              invite_link: options.link,
              creator: sender(userId),
              creates_join_request: false,
              is_primary: false,
              is_revoked: false,
              name: 'test',
            },
          }
        : {}),
    },
  } as unknown as Update;
}

export const tweet = (id: string, text = `系列 0${id.slice(-1)} 新作`, created = '2026-11-09T04:00:00.000Z'): FakeTweet => ({
  id,
  text,
  created_at: created,
});
