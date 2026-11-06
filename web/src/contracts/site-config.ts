import { isIP } from 'node:net';
import { z } from 'zod';

export const LINK_IDS = ['x_profile', 'tg_personal', 'tg_preview', 'onlyfans', 'membership'] as const;
export const SOURCES = ['profile', 'pin', 'weekly', 'other'] as const;
export const EVENT_TYPES = ['gate_view', 'adult_confirm', 'leave', 'link_click'] as const;
export const AGE_TTL_SECONDS = 2_592_000;
export const ADMIN_SESSION_TTL_SECONDS = 28_800;

// The wire schema bounds code units; parseSiteConfig also checks user-perceived graphemes.
const text = (limit: number) => z.string().max(limit * 16).meta({ 'x-grapheme-limit': limit });
const requiredText = (limit: number) => text(limit).min(1);
const optionalText = (limit: number) => text(limit).nullable();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const url = z.string().max(2048).nullable();
const position = z.number().int().min(1).max(12);
const point = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const siteConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  theme: z.literal('ink-champagne'),
  site: z.strictObject({
    name: requiredText(24), tagline: optionalText(90), description: optionalText(500), avatarMediaId: id.nullable(),
  }),
  ageGate: z.strictObject({
    title: requiredText(40), notice: requiredText(300), confirmLabel: requiredText(24),
    exitLabel: requiredText(24), exitUrl: url, exitNotice: requiredText(160), resetLabel: requiredText(24),
  }),
  links: z.array(z.strictObject({
    id: z.enum(LINK_IDS), label: requiredText(24), description: optionalText(40), url,
    position: position.max(5), visible: z.boolean(), enabled: z.boolean(), emphasized: z.boolean(),
  })).length(5),
  gallery: z.strictObject({
    enabled: z.boolean(), title: optionalText(40),
    photos: z.array(z.strictObject({
      id, mediaId: id, alt: requiredText(160), caption: optionalText(160), position,
      visible: z.boolean(), focalPoint: point,
    })).max(12),
  }),
  info: z.strictObject({
    title: optionalText(60), body: optionalText(1000),
    faq: z.array(z.strictObject({ id, question: requiredText(120), answer: requiredText(1000) })).max(10),
  }),
  footer: z.strictObject({
    notice: requiredText(160), contactEmail: z.email().max(254).nullable(),
    removalNotice: optionalText(300), updateText: optionalText(100),
  }),
  meta: z.strictObject({ title: requiredText(60), description: requiredText(160), shareMediaId: id.nullable() }),
  states: z.strictObject({
    unavailable: requiredText(40), loading: requiredText(60), empty: requiredText(100), error: requiredText(160),
  }),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type ValidationIssue = { path: string; code: string; message: string };
export class ConfigValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super('站点配置校验未通过');
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
export const graphemeLength = (value: string): number => [...segmenter.segment(value)].length;
export const normalizeSource = (value: unknown): typeof SOURCES[number] =>
  SOURCES.includes(value as typeof SOURCES[number]) ? value as typeof SOURCES[number] : 'other';

export function isExternalHttps(value: string, siteOrigin?: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (value.trim() !== value || /\s|\{\{|\}\}/u.test(value)) return false;
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !host.includes('.')) return false;
    if (isIP(host) || host.startsWith('[') || /(^|\.)(localhost|local|internal|invalid|test)$/u.test(host)) return false;
    if (/(^|\.)(example\.(com|org|net))$/u.test(host)) return false;
    if (siteOrigin && host === new URL(siteOrigin).hostname.toLowerCase().replace(/\.$/, '')) return false;
    return true;
  } catch { return false; }
}

function contentIssues(config: SiteConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const checkText = (value: string | null, path: string, limit: number, required = false) => {
    if (value === null) return;
    if ((required && !value.trim()) || /\{\{[^}]*\}\}|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
      issues.push({ path, code: 'INVALID_TEXT', message: '请填写有效纯文本，不使用模板变量或控制字符。' });
    }
    if (graphemeLength(value) > limit) issues.push({ path, code: 'TEXT_TOO_LONG', message: `最多 ${limit} 个字素。` });
  };
  const groups: [Record<string, unknown>, string, Record<string, number>][] = [
    [config.site, 'site', { name: 24, tagline: 90, description: 500 }],
    [config.ageGate, 'ageGate', { title: 40, notice: 300, confirmLabel: 24, exitLabel: 24, exitNotice: 160, resetLabel: 24 }],
    [config.info, 'info', { title: 60, body: 1000 }],
    [config.footer, 'footer', { notice: 160, removalNotice: 300, updateText: 100 }],
    [config.meta, 'meta', { title: 60, description: 160 }],
    [config.states, 'states', { unavailable: 40, loading: 60, empty: 100, error: 160 }],
  ];
  for (const [group, prefix, fields] of groups) for (const [key, limit] of Object.entries(fields)) {
    checkText(group[key] as string | null, `${prefix}.${key}`, limit, group[key] !== null);
  }
  const unique = (values: (string | number)[], path: string) => {
    if (new Set(values).size !== values.length) issues.push({ path, code: 'DUPLICATE', message: '标识和排序不能重复。' });
  };
  unique(config.links.map(link => link.id), 'links.id');
  unique(config.links.map(link => link.position), 'links.position');
  if (config.links.filter(link => link.emphasized).length > 1) issues.push({ path: 'links', code: 'MULTIPLE_EMPHASIS', message: '最多强调一个入口。' });
  config.links.forEach((link, index) => {
    checkText(link.label, `links.${index}.label`, 24, true);
    checkText(link.description, `links.${index}.description`, 40);
    if (link.url !== null && !isExternalHttps(link.url)) issues.push({ path: `links.${index}.url`, code: 'INVALID_URL', message: '请使用真实的 HTTPS 外部地址。' });
    if (link.enabled && !link.url) issues.push({ path: `links.${index}.enabled`, code: 'EMPTY_TARGET', message: '目标为空时保持停用。' });
  });
  if (config.ageGate.exitUrl !== null && !isExternalHttps(config.ageGate.exitUrl)) issues.push({ path: 'ageGate.exitUrl', code: 'INVALID_URL', message: '离开目标须为 HTTPS 外部地址。' });
  checkText(config.gallery.title, 'gallery.title', 40);
  unique(config.gallery.photos.map(p => p.id), 'gallery.photos.id');
  unique(config.gallery.photos.map(p => p.position), 'gallery.photos.position');
  config.gallery.photos.forEach((photo, i) => {
    checkText(photo.alt, `gallery.photos.${i}.alt`, 160, true);
    checkText(photo.caption, `gallery.photos.${i}.caption`, 160);
  });
  unique(config.info.faq.map(faq => faq.id), 'info.faq.id');
  config.info.faq.forEach((faq, i) => {
    checkText(faq.question, `info.faq.${i}.question`, 120, true);
    checkText(faq.answer, `info.faq.${i}.answer`, 1000, true);
  });
  return issues;
}

export function parseSiteConfig(value: unknown): SiteConfig {
  const normalizeEmpty = (input: unknown): unknown => {
    if (typeof input === 'string') return input.trim() === '' ? null : input;
    if (Array.isArray(input)) return input.map(normalizeEmpty);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, normalizeEmpty(item)]));
    return input;
  };
  const parsed = siteConfigSchema.safeParse(normalizeEmpty(value));
  if (!parsed.success) throw new ConfigValidationError(parsed.error.issues.map(issue => ({
    path: issue.path.join('.'), code: issue.code, message: issue.message,
  })));
  const issues = contentIssues(parsed.data);
  if (issues.length) throw new ConfigValidationError(issues);
  return parsed.data;
}

export function referencedMediaIds(config: SiteConfig): string[] {
  return [...new Set([
    config.site.avatarMediaId, config.meta.shareMediaId,
    ...config.gallery.photos.map(photo => photo.mediaId),
  ].filter((value): value is string => value !== null))];
}

export function validateForPublish(value: unknown, options: {
  siteOrigin?: string; readyMediaIds?: ReadonlySet<string>; publicShareMediaIds?: ReadonlySet<string>;
} = {}): ValidationIssue[] {
  let config: SiteConfig;
  try { config = parseSiteConfig(value); }
  catch (error) { if (error instanceof ConfigValidationError) return error.issues; throw error; }
  const issues: ValidationIssue[] = [];
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message });
  const affirmativeAdultLabel = /^我(?:确认)?已(?:经)?(?:年满|满)\s*18\s*岁(?:[，,·\s]*(?:继续|进入|确认))?$/u;
  if (!affirmativeAdultLabel.test(config.ageGate.confirmLabel.trim()) || !/成年|18/u.test(config.ageGate.notice + config.ageGate.title)) {
    add('ageGate.confirmLabel', 'AGE_SEMANTICS', '确认按钮须为“我已年满 18 岁”等明确的正向成年声明。');
  }
  if (/核验通过|身份已验证|年龄已验证/u.test(config.ageGate.title + config.ageGate.notice + config.ageGate.confirmLabel)) {
    add('ageGate.notice', 'AGE_SEMANTICS', '使用本人自主声明文案。');
  }
  if (!config.ageGate.exitUrl) add('ageGate.exitUrl', 'REQUIRED_FOR_PUBLISH', '发布前填写中性离开目标。');
  if (!config.footer.contactEmail) add('footer.contactEmail', 'REQUIRED_FOR_PUBLISH', '发布前填写联系邮箱。');
  for (const [path, target] of [
    ['ageGate.exitUrl', config.ageGate.exitUrl],
    ...config.links.map((link, i) => [`links.${i}.url`, link.url]),
  ] as [string, string | null][]) {
    if (target && !isExternalHttps(target, options.siteOrigin)) add(path, 'INVALID_URL', '目标须为有效 HTTPS 外部地址，且不同于本站。');
  }
  if (!config.links.some(link => link.visible && link.enabled && link.url)) add('links', 'NO_ACTIVE_LINK', '至少配置一个已显示并启用的有效入口。');
  for (const mediaId of referencedMediaIds(config)) {
    if (!options.readyMediaIds?.has(mediaId)) add('media.' + mediaId, 'MEDIA_NOT_READY', '媒体尚未处理完成或已移除。');
  }
  if (config.meta.shareMediaId !== null && !options.publicShareMediaIds?.has(config.meta.shareMediaId)) {
    add('meta.shareMediaId', 'SHARE_MEDIA_NOT_NEUTRAL', '分享图须单独标记为中性公开分享素材。');
  }
  for (const mediaId of [config.site.avatarMediaId, ...config.gallery.photos.map(photo => photo.mediaId)]) {
    if (mediaId !== null && options.publicShareMediaIds?.has(mediaId)) add('media.' + mediaId, 'MEDIA_PURPOSE_CONFLICT', '头像和照片条使用受控素材，分享图使用独立素材。');
  }
  return issues;
}

export function projectGate(config: SiteConfig) {
  return { name: config.site.name, meta: { ...config.meta }, ageGate: { ...config.ageGate } };
}

export function projectPublished(config: SiteConfig, versionId: string, lqipByMediaId: ReadonlyMap<string, string | null> = new Map()) {
  const lqipFor = (mediaId: string | null) => mediaId ? lqipByMediaId.get(mediaId) ?? null : null;
  return {
    versionId, theme: config.theme, site: { ...config.site, avatarLqip: lqipFor(config.site.avatarMediaId) },
    links: config.links.filter(link => link.visible).sort((a, b) => a.position - b.position).map(link => ({
      id: link.id, label: link.label, description: link.description, position: link.position,
      available: Boolean(link.enabled && link.url), emphasized: link.emphasized,
    })),
    gallery: { ...config.gallery, photos: config.gallery.enabled ? config.gallery.photos.filter(p => p.visible).sort((a, b) => a.position - b.position).map(photo => ({ ...photo, lqip: lqipFor(photo.mediaId) })) : [] },
    info: config.info, footer: config.footer, states: config.states, resetLabel: config.ageGate.resetLabel,
  };
}
