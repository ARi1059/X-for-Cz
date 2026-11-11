/** 日报/周报的数据汇总与文案（纯函数 + 发送）。 */

import type { Api } from 'grammy';
import type { Config } from './config.ts';
import { DAY_MS, dayKey, type Store } from './store.ts';
import { notify } from './telegram.ts';

export type DailyReportInput = {
  today: string;
  reportDay: string;
  members: number;
  joins: number;
  leaves: number;
  published: number;
  skipped: number;
  pending: number;
  failed: number;
  sources: { link: string; joins: number }[];
};

export type WeeklyReportInput = {
  from: string;
  to: string;
  members: number;
  joins: number;
  leaves: number;
  published: number;
  skipped: number;
  failed: number;
  days: number;
  sources: { link: string; joins: number }[];
};

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function shortLink(link: string): string {
  return link.replace(/^https?:\/\/t\.me\//u, '').slice(0, 48);
}

function sourceLines(sources: { link: string; joins: number }[]): string {
  if (sources.length === 0) return '· 无记录';
  return sources.map(item => `· ${shortLink(item.link)} +${item.joins}`).join('\n');
}

export function buildDailyReport(input: DailyReportInput): string {
  return [
    `📊 频道日报 · ${input.today}`,
    `统计日：${input.reportDay}`,
    '',
    `当前成员：${input.members}`,
    `昨日新增：${input.joins} · 退出：${input.leaves} · 净增：${signed(input.joins - input.leaves)}`,
    `昨日发布：${input.published} · 跳过：${input.skipped}`,
    `当前待审：${input.pending} · 累计失败：${input.failed}`,
    '',
    '入群来源（昨日）：',
    sourceLines(input.sources),
  ].join('\n');
}

export function buildWeeklyReport(input: WeeklyReportInput): string {
  const average = input.days > 0 ? (input.joins / input.days).toFixed(1) : '0.0';
  return [
    `📈 频道周报 · ${input.from} ~ ${input.to}`,
    '',
    `当前成员：${input.members}`,
    `本周新增：${input.joins} · 退出：${input.leaves} · 净增：${signed(input.joins - input.leaves)}`,
    `本周发布：${input.published} · 跳过：${input.skipped} · 累计失败：${input.failed}`,
    `日均新增：${average}`,
    '',
    '入群来源（本周）：',
    sourceLines(input.sources),
  ].join('\n');
}

export function dailyReportInput(store: Store, config: Config, now: number): DailyReportInput {
  const today = dayKey(now, config.timeZone);
  const yesterday = dayKey(now - DAY_MS, config.timeZone);
  const current = store.memberDay(today);
  const previous = store.memberDay(yesterday);
  const activity = store.activityOn(yesterday, config.timeZone);
  const counts = store.counts();
  return {
    today,
    reportDay: yesterday,
    members: current.members || previous.members,
    joins: previous.joins,
    leaves: previous.leaves,
    published: activity.published,
    skipped: activity.skipped,
    pending: counts.pending,
    failed: counts.failed,
    sources: store.inviteSources(yesterday),
  };
}

export function weeklyReportInput(store: Store, config: Config, now: number): WeeklyReportInput {
  const to = dayKey(now - DAY_MS, config.timeZone);
  const from = dayKey(now - 7 * DAY_MS, config.timeZone);
  const today = dayKey(now, config.timeZone);
  const days = store.memberRange(from, to);
  let joins = 0;
  let leaves = 0;
  let published = 0;
  let skipped = 0;
  for (const day of days) {
    joins += day.joins;
    leaves += day.leaves;
    const activity = store.activityOn(day.day, config.timeZone);
    published += activity.published;
    skipped += activity.skipped;
  }
  const counts = store.counts();
  return {
    from,
    to,
    members: store.memberDay(today).members || days.at(-1)?.members || 0,
    joins,
    leaves,
    published,
    skipped,
    failed: counts.failed,
    days: 7,
    sources: store.inviteSourcesRange(from, to),
  };
}

export type ReportResult = { text: string; sent: number };

export type ReportDeps = {
  config: Config;
  store: Store;
  api: Api;
  log?: (event: Record<string, unknown>) => void;
};

async function broadcast(deps: ReportDeps, text: string, kind: string): Promise<number> {
  let sent = 0;
  for (const adminId of deps.config.adminIds) {
    if (await notify(deps.api, adminId, text)) sent += 1;
  }
  deps.log?.({ event: 'report_sent', kind, sent, admins: deps.config.adminIds.length });
  return sent;
}

export async function sendDailyReport(deps: ReportDeps, now: number = Date.now()): Promise<ReportResult> {
  const text = buildDailyReport(dailyReportInput(deps.store, deps.config, now));
  const sent = await broadcast(deps, text, 'daily');
  return { text, sent };
}

export async function sendWeeklyReport(deps: ReportDeps, now: number = Date.now()): Promise<ReportResult> {
  const text = buildWeeklyReport(weeklyReportInput(deps.store, deps.config, now));
  const sent = await broadcast(deps, text, 'weekly');
  return { text, sent };
}
