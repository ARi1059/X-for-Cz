/** 环境变量解析与校验。缺失必填项或填写非法时，一次性报出全部问题。 */

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`配置无效：\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

export type DailyReport = { hour: number; minute: number };
export type WeeklyReport = DailyReport & { weekday: number };

export type Config = {
  botToken: string;
  ownerId: number;
  adminIds: number[];
  previewChannel: string;
  previewChannelUrl: string | null;
  backupChannelId: number | null;
  backupChannelUrl: string | null;
  onlyfansUrl: string | null;
  contactBotUrl: string | null;
  xEnabled: boolean;
  xBearerToken: string;
  xUsername: string;
  pollMinutes: number;
  approvalTtlHours: number;
  backfillCount: number;
  dailyReport: DailyReport | null;
  weeklyReport: WeeklyReport | null;
  databasePath: string;
  timeZone: string;
  apiRoot: string | null;
  xApiRoot: string;
};

type Env = Record<string, string | undefined>;

const WEEKDAYS: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

function text(env: Env, key: string): string {
  return (env[key] ?? '').trim();
}

function required(env: Env, key: string, issues: string[]): string {
  const value = text(env, key);
  if (!value) issues.push(`${key} 缺失`);
  return value;
}

function positiveInt(env: Env, key: string, issues: string[], fallback: number, min: number, max: number): number {
  const raw = text(env, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    issues.push(`${key} 必须是 ${min}–${max} 的整数`);
    return fallback;
  }
  return value;
}

function parseIdList(raw: string, key: string, issues: string[]): number[] {
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const item = part.trim();
    if (!item) continue;
    const value = Number(item);
    if (!Number.isSafeInteger(value) || value <= 0) {
      issues.push(`${key} 含非法数字 ID：${item}`);
      continue;
    }
    if (!ids.includes(value)) ids.push(value);
  }
  return ids;
}

function channelId(env: Env, issues: string[]): string {
  const raw = required(env, 'PREVIEW_CHANNEL_ID', issues);
  if (!raw) return '';
  if (raw.startsWith('@')) {
    if (raw.length < 2) issues.push('PREVIEW_CHANNEL_ID 的 @username 不完整');
    return raw;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value >= 0) {
    issues.push('PREVIEW_CHANNEL_ID 必须是 @username 或负数 ID（-100 开头）');
  }
  return raw;
}

function httpsUrl(env: Env, key: string, issues: string[]): string | null {
  const raw = text(env, key);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') {
      issues.push(`${key} 必须是 https 链接`);
      return null;
    }
    return url.toString();
  } catch {
    issues.push(`${key} 不是合法 URL`);
    return null;
  }
}

function negativeId(env: Env, key: string, issues: string[]): number | null {
  const raw = text(env, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value >= 0) {
    issues.push(`${key} 必须是负数 ID（-100 开头）`);
    return null;
  }
  return value;
}

function httpRoot(env: Env, key: string, issues: string[], fallback: string): string {
  const raw = text(env, key);
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      issues.push(`${key} 必须是 http(s) 地址`);
      return fallback;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    issues.push(`${key} 不是合法 URL`);
    return fallback;
  }
}

function timeZone(env: Env, issues: string[]): string {
  const raw = text(env, 'TIMEZONE') || 'Asia/Shanghai';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: raw }).format(new Date(0));
    return raw;
  } catch {
    issues.push(`TIMEZONE 不是合法时区：${raw}`);
    return 'Asia/Shanghai';
  }
}

function parseClock(raw: string): DailyReport | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(raw.trim());
  if (!match?.[1] || !match[2]) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function parseDaily(env: Env, issues: string[]): DailyReport | null {
  const raw = env.REPORT_DAILY;
  if (raw === undefined) return { hour: 10, minute: 0 };
  if (raw.trim() === '') return null;
  const clock = parseClock(raw);
  if (!clock) {
    issues.push('REPORT_DAILY 必须是 HH:MM，或留空关闭');
    return null;
  }
  return clock;
}

function parseWeekly(env: Env, issues: string[]): WeeklyReport | null {
  const raw = env.REPORT_WEEKLY;
  if (raw === undefined) return { weekday: 1, hour: 10, minute: 0 };
  if (raw.trim() === '') return null;
  const match = /^(mon|tue|wed|thu|fri|sat|sun)\s+([01]?\d|2[0-3]):([0-5]\d)$/iu.exec(raw.trim());
  if (!match?.[1] || !match[2] || !match[3]) {
    issues.push('REPORT_WEEKLY 必须是 “MON 10:00” 格式，或留空关闭');
    return null;
  }
  return { weekday: WEEKDAYS[match[1].toLowerCase()]!, hour: Number(match[2]), minute: Number(match[3]) };
}

/**
 * 必填：OPS_BOT_TOKEN、OWNER_ID、PREVIEW_CHANNEL_ID；
 * X_ENABLED=1 时另需 X_BEARER_TOKEN、X_USERNAME。
 * ADMIN_IDS 可空，owner 会自动并入；填了但非法会报错。
 */
export function loadConfig(env: Env = process.env): Config {
  const issues: string[] = [];

  const botToken = required(env, 'OPS_BOT_TOKEN', issues);
  const ownerRaw = required(env, 'OWNER_ID', issues);
  const ownerId = Number(ownerRaw);
  if (ownerRaw && (!Number.isSafeInteger(ownerId) || ownerId <= 0)) issues.push('OWNER_ID 必须是正整数');

  const adminIds = parseIdList(text(env, 'ADMIN_IDS'), 'ADMIN_IDS', issues);
  if (Number.isSafeInteger(ownerId) && ownerId > 0 && !adminIds.includes(ownerId)) adminIds.unshift(ownerId);

  const xEnabledRaw = text(env, 'X_ENABLED').toLowerCase();
  const xEnabled = !(xEnabledRaw === '0' || xEnabledRaw === 'false' || xEnabledRaw === 'off');
  const xUsername = text(env, 'X_USERNAME').replace(/^@/, '');

  const config: Config = {
    botToken,
    ownerId,
    adminIds,
    previewChannel: channelId(env, issues),
    previewChannelUrl: httpsUrl(env, 'PREVIEW_CHANNEL_URL', issues),
    backupChannelId: negativeId(env, 'BACKUP_CHANNEL_ID', issues),
    backupChannelUrl: httpsUrl(env, 'BACKUP_CHANNEL_URL', issues),
    onlyfansUrl: httpsUrl(env, 'ONLYFANS_URL', issues),
    contactBotUrl: httpsUrl(env, 'CONTACT_BOT_URL', issues),
    xEnabled,
    xBearerToken: xEnabled ? required(env, 'X_BEARER_TOKEN', issues) : text(env, 'X_BEARER_TOKEN'),
    xUsername,
    pollMinutes: positiveInt(env, 'POLL_MINUTES', issues, 5, 2, 120),
    approvalTtlHours: positiveInt(env, 'APPROVAL_TTL_HOURS', issues, 24, 1, 168),
    backfillCount: positiveInt(env, 'BACKFILL_COUNT', issues, 0, 0, 20),
    dailyReport: parseDaily(env, issues),
    weeklyReport: parseWeekly(env, issues),
    databasePath: text(env, 'DATABASE_PATH') || './data/ops-bot.sqlite',
    timeZone: timeZone(env, issues),
    apiRoot: text(env, 'API_ROOT') ? httpRoot(env, 'API_ROOT', issues, '') : null,
    xApiRoot: httpRoot(env, 'X_API_ROOT', issues, 'https://api.x.com'),
  };

  if (xEnabled && !xUsername) issues.push('X_USERNAME 缺失');
  for (const key of ['OPS_BOT_TOKEN', 'X_BEARER_TOKEN'] as const) {
    const value = text(env, key);
    if (value && /\s/.test(value)) issues.push(`${key} 不能包含空白字符`);
  }

  if (issues.length) throw new ConfigError(issues);
  return config;
}
