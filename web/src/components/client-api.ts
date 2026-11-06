import type { SiteConfig, ValidationIssue, projectPublished } from '../contracts/site-config.ts';

export type PublicSite = ReturnType<typeof projectPublished>;
export type Gate = { versionId: string; name: string; meta: SiteConfig['meta']; ageGate: SiteConfig['ageGate']; ageStatus: { confirmed: boolean; expiresAt: string | null }; csrfToken: string };
export type AdminSession = { username: string; expiresAt: string; csrfToken: string };
export type Draft = { revision: number; updatedAt: string; config: SiteConfig };
export type Preview = { revision: number; config: SiteConfig; publishIssues: ValidationIssue[] };
export type MediaRecord = { id: string; status: 'pending' | 'ready' | 'failed'; purpose: 'controlled' | 'public_share'; mimeType: string; width: number; height: number; bytes: number; lqip: string | null; createdAt: string; references: { draft: boolean; publishedVersionCount: number } };
export type MediaList = { items: MediaRecord[]; nextCursor: string | null };
export type Stats = { from: string; to: string; buckets: { date: string; source: string; event: string; linkId: string | null; count: number }[] };

const messages: Record<string, string> = {
  REVISION_CONFLICT: '草稿已在其他窗口更新。当前输入已保留，请重新加载后合并修改。',
  VERSION_CONFLICT: '内容已更新，正在重新加载。',
  UNAUTHORIZED: '会话已到期，请重新登录或确认。',
  INVALID_CREDENTIALS: '账号或密码不正确。',
  RATE_LIMITED: '操作较频繁，请稍后重试。',
  CSRF_INVALID: '页面确认已过期，请刷新后重试。',
};
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields: ValidationIssue[] = []) {
    super(messages[code] ?? message); this.name = 'ApiError';
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string; fields?: ValidationIssue[] } } | null;
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? '请求失败，请稍后重试。', body?.error?.fields ?? []);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const postBody = (body: unknown, csrf?: string, token?: string): RequestInit => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : '请求失败，请稍后重试。';
export function previewProjection(config: SiteConfig, revision: number): PublicSite {
  return {
    versionId: `draft-${revision}`, theme: config.theme, site: { ...config.site, avatarLqip: null },
    links: config.links.filter(item => item.visible).sort((a, b) => a.position - b.position).map(item => ({ id: item.id, label: item.label, description: item.description, position: item.position, available: Boolean(item.enabled && item.url), emphasized: item.emphasized })),
    gallery: { ...config.gallery, photos: config.gallery.enabled ? config.gallery.photos.filter(item => item.visible).sort((a, b) => a.position - b.position).map(photo => ({ ...photo, lqip: null })) : [] },
    info: config.info, footer: config.footer, states: config.states, resetLabel: config.ageGate.resetLabel,
  };
}
