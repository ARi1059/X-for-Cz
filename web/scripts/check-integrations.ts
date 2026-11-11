/**
 * 接入自检：验证 X 与 Telegram 凭证是否可用，不打印 token。
 * 用法：npm run integrations:check
 */

import { existsSync } from 'node:fs';
import { IntegrationError } from '../src/server/integration-error.ts';
import { readStoryConfig } from '../src/server/story-feed.ts';
import { fetchChatMemberCount } from '../src/server/telegram-api.ts';
import { fetchXPosts, fetchXProfile } from '../src/server/x-api.ts';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const config = readStoryConfig();

function describe(error: unknown): string {
  if (!(error instanceof IntegrationError)) return '未知错误';
  const retry = error.retryAt ? `，约 ${new Date(error.retryAt).toLocaleString('zh-CN')} 后可重试` : '';
  return `${error.kind}${retry}`;
}

let failed = false;

console.log(`接入模式：${config.demo ? '开发示例（未配置凭证）' : '真实数据'}`);
for (const issue of config.issues) console.log(`配置问题：${issue}`);
if (config.issues.length) failed = true;

if (config.x) {
  try {
    const profile = await fetchXProfile(config.x);
    console.log(`✓ X 账号 @${profile.username}：${profile.followers.toLocaleString('zh-CN')} 粉丝`);
    try {
      const posts = await fetchXPosts(config.x, profile.id);
      console.log(`✓ X 时间线：读取到 ${posts.length} 条带媒体帖文${posts.length === 0 ? '（可能最近没有带图/视频的帖子）' : ''}`);
    } catch (error) {
      console.log(`△ X 时间线不可读：${describe(error)}（粉丝数仍可显示；免费套餐通常不包含时间线）`);
    }
  } catch (error) {
    failed = true;
    console.log(`✗ X 账号不可读：${describe(error)}`);
  }
} else {
  console.log('· X 未配置（X_BEARER_TOKEN / X_USERNAME）');
}

if (config.telegram) {
  for (const [label, chat] of [['防丢频道', config.telegram.antiLossChat], ['预告频道', config.telegram.previewChat]] as const) {
    if (!chat) {
      console.log(`· Telegram ${label}未配置`);
      continue;
    }
    try {
      const count = await fetchChatMemberCount({ token: config.telegram.token, chat });
      console.log(`✓ Telegram ${label} ${chat}：${count.toLocaleString('zh-CN')} 人`);
    } catch (error) {
      failed = true;
      console.log(`✗ Telegram ${label} ${chat}：${describe(error)}`);
    }
  }
} else {
  console.log('· Telegram 未配置（TELEGRAM_BOT_TOKEN / TELEGRAM_ANTI_LOSS_CHAT / TELEGRAM_PREVIEW_CHAT）');
}

if (!config.x && !config.telegram) {
  console.log('提示：未配置任何凭证时，生产环境显示「实时数据暂不可用」，开发环境保留示例数据。');
}

process.exitCode = failed ? 1 : 0;
