/** 入口：加载配置、打开数据库、自检频道、启动长轮询与轮询器。 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigError, loadConfig } from './config.ts';
import { openDatabase } from './db.ts';
import { Store } from './store.ts';
import { createBot, verifyChannel } from './bot.ts';
import { XClient } from './x-client.ts';
import { Poller } from './poller.ts';
import { Scheduler } from './scheduler.ts';
import { notify } from './telegram.ts';

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    process.loadEnvFile(file);
    return;
  }
}

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event));
}

async function main(): Promise<void> {
  loadEnvFiles();

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const databasePath = resolve(config.databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = openDatabase(databasePath);
  const store = new Store(db);
  const recovered = store.resetPublishing();
  if (recovered > 0) log({ event: 'recovered_publishing', count: recovered });

  const bot = createBot({ config, store, log });
  const poller = config.xEnabled
    ? new Poller({
        config,
        store,
        x: new XClient({
          bearerToken: config.xBearerToken,
          username: config.xUsername,
          apiRoot: config.xApiRoot,
        }),
        api: bot.api,
        log,
      })
    : null;
  if (!poller) log({ event: 'x_disabled', reason: 'X_ENABLED=0' });
  const scheduler = new Scheduler({ config, store, api: bot.api, log });

  await bot.init();
  const issues = await verifyChannel(bot.api, config, bot.botInfo.id);
  if (issues.length > 0) {
    log({ event: 'channel_check_failed', issues });
    await notify(bot.api, config.ownerId, `⚠️ 频道自检未通过：\n- ${issues.join('\n- ')}`);
  } else {
    log({ event: 'channel_ok', channel: config.previewChannel });
  }

  const shutdown = async (signal: string): Promise<void> => {
    log({ event: 'shutdown', signal });
    poller?.stop();
    scheduler.stop();
    await bot.stop().catch(() => {});
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', reason => {
    log({ event: 'unhandled_rejection', message: String(reason) });
  });

  await bot.api
    .setMyCommands([
      { command: 'start', description: '入口菜单' },
      { command: 'pending', description: '待审列表' },
      { command: 'stats', description: '统计' },
      { command: 'report', description: '发送日报/周报' },
      { command: 'announce', description: '发防丢频道公告' },
      { command: 'cancel', description: '取消当前操作' },
      { command: 'whoami', description: '我的 ID' },
    ])
    .catch(error => log({ event: 'set_commands_failed', message: String(error) }));

  await bot.start({
    onStart: info => {
      log({
        event: 'started',
        username: info.username,
        channel: config.previewChannel,
        admins: config.adminIds.length,
        database: databasePath,
        dailyReport: config.dailyReport,
        weeklyReport: config.weeklyReport,
      });
      poller?.start();
      scheduler.start();
    },
    allowed_updates: ['message', 'callback_query', 'chat_member'],
  });
}

main().catch(error => {
  log({ event: 'start_failed', message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
