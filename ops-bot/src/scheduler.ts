/** 定时任务：成员数快照、日报、周报。按分钟检查，跨重启用 meta 去重。 */

import type { Api } from 'grammy';
import type { Config, DailyReport } from './config.ts';
import { sendDailyReport, sendWeeklyReport, type ReportDeps } from './reports.ts';
import { dayKey, type Store } from './store.ts';

const TICK_MS = 30_000;
const REFRESH_MS = 5 * 60_000;
const REPORT_WINDOW_MINUTES = 10;
const DAILY_KEY = 'report_daily_last';
const WEEKLY_KEY = 'report_weekly_last';

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type LocalParts = { day: string; hour: number; minute: number; weekday: number };

export function localParts(now: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  const hour = Number(values.hour) === 24 ? 0 : Number(values.hour);
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour,
    minute: Number(values.minute),
    weekday: WEEKDAY[values.weekday ?? ''] ?? 0,
  };
}

function due(target: DailyReport, local: LocalParts): boolean {
  const targetMinutes = target.hour * 60 + target.minute;
  const localMinutes = local.hour * 60 + local.minute;
  return localMinutes >= targetMinutes && localMinutes < targetMinutes + REPORT_WINDOW_MINUTES;
}

export type SchedulerDeps = ReportDeps & {
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
};

export class Scheduler {
  private readonly config: Config;
  private readonly store: Store;
  private readonly api: Api;
  private readonly now: () => number;
  private readonly log: (event: Record<string, unknown>) => void;
  private readonly reportDeps: ReportDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRefresh = 0;
  private running = false;

  constructor(deps: SchedulerDeps) {
    this.config = deps.config;
    this.store = deps.store;
    this.api = deps.api;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? (event => console.log(JSON.stringify(event)));
    this.reportDeps = { config: this.config, store: this.store, api: this.api, log: this.log };
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now: number = this.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.refreshMembers(now);
      const local = localParts(now, this.config.timeZone);

      if (
        this.config.dailyReport &&
        due(this.config.dailyReport, local) &&
        this.store.metaValue(DAILY_KEY) !== local.day
      ) {
        const result = await sendDailyReport(this.reportDeps, now);
        if (result.sent > 0) this.store.setMetaValue(DAILY_KEY, local.day);
      }

      if (
        this.config.weeklyReport &&
        local.weekday === this.config.weeklyReport.weekday &&
        due(this.config.weeklyReport, local) &&
        this.store.metaValue(WEEKLY_KEY) !== local.day
      ) {
        const result = await sendWeeklyReport(this.reportDeps, now);
        if (result.sent > 0) this.store.setMetaValue(WEEKLY_KEY, local.day);
      }
    } catch (error) {
      this.log({ event: 'scheduler_failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.running = false;
    }
  }

  private async refreshMembers(now: number): Promise<void> {
    if (this.lastRefresh !== 0 && now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    try {
      const count = await this.api.getChatMemberCount(this.config.previewChannel);
      this.store.setMemberCount(dayKey(now, this.config.timeZone), count);
      this.log({ event: 'members', count });
    } catch (error) {
      this.log({ event: 'members_failed', message: error instanceof Error ? error.message : String(error) });
    }
  }
}
