/** 启动前自检：配置、Bot 身份、频道权限、X 时间线。不打印任何密钥。 */

import { existsSync } from 'node:fs';
import { Bot } from 'grammy';
import { ConfigError, loadConfig } from './config.ts';
import { verifyChannel } from './bot.ts';
import { XClient, XError } from './x-client.ts';

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    process.loadEnvFile(file);
    return;
  }
}

function line(ok: boolean, text: string): void {
  console.log(`${ok ? '✓' : '✗'} ${text}`);
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
  line(true, `配置：频道 ${config.previewChannel}，管理员 ${config.adminIds.length} 人`);

  const bot = new Bot(config.botToken, config.apiRoot ? { client: { apiRoot: config.apiRoot } } : undefined);
  try {
    await bot.init();
    line(true, `Telegram Bot：@${bot.botInfo.username}`);
  } catch (error) {
    line(false, `Telegram Bot 不可用：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const issues = await verifyChannel(bot.api, config, bot.botInfo.id);
  if (issues.length === 0) {
    line(true, '预告频道：可读，Bot 是管理员且有发帖权限');
  } else {
    for (const issue of issues) line(false, `预告频道：${issue}`);
  }

  let xOk = true;
  if (!config.xEnabled) {
    line(true, 'X 时间线：已关闭（X_ENABLED=0）');
  } else {
    const x = new XClient({ bearerToken: config.xBearerToken, username: config.xUsername, apiRoot: config.xApiRoot });
    try {
      const posts = await x.fetchTimeline();
      line(true, `X 时间线：读到 ${posts.length} 条原创帖`);
    } catch (error) {
      xOk = false;
      const hint = error instanceof XError && error.kind === 'forbidden' ? '（检查 App 是否挂在 Project 上）' : '';
      line(false, `X 时间线：${error instanceof Error ? error.message : String(error)}${hint}`);
    }
  }

  process.exit(issues.length === 0 && xOk ? 0 : 1);
}

main().catch(error => {
  console.error(`自检失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
