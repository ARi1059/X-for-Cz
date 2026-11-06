import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Draft } from '../src/components/client-api.ts';
import { fixtureAccount } from './fixture.ts';

const origin = 'http://localhost:3103';
let control: APIRequestContext;
let csrf: string;
let baseline: Draft;
async function currentDraft(): Promise<Draft> { return (await control.get('/api/admin/draft')).json(); }
async function replaceDraft(config: Draft['config']) {
  const current = await currentDraft();
  const response = await control.put('/api/admin/draft', { data: { expectedRevision: current.revision, config }, headers: { 'X-CSRF-Token': csrf } });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Draft>;
}
async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('账号', { exact: true }).fill(fixtureAccount.username);
  await page.getByLabel('密码', { exact: true }).fill(fixtureAccount.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeVisible();
}
test.beforeAll(async ({ playwright }) => {
  control = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, 'User-Agent': 'M3-fixture-control' } });
  const response = await control.post('/api/admin/login', { data: fixtureAccount });
  expect(response.status()).toBe(200);
  csrf = (await response.json()).csrfToken;
  baseline = await currentDraft();
});
test.beforeEach(async () => { await replaceDraft(structuredClone(baseline.config)); });
test.afterAll(async () => { if (control && baseline) await replaceDraft(baseline.config); await control?.dispose(); });

test('first visit isolates content; cookie confirmation persists without extending expiry; reset clears access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const controlled: string[] = [];
  page.on('request', request => { if (/\/media\/|\/api\/site/.test(request.url())) controlled.push(request.url()); });
  const response = await page.goto('/?from=profile');
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(await response!.text()).not.toContain('短发御姐');
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  expect(controlled).toEqual([]);
  await page.screenshot({ path: 'var/screenshots/story-gate-390.png', fullPage: true });
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const story = page.getByTestId('story-lab');
  await expect(story).toBeVisible();
  await expect(story.getByRole('navigation', { name: '个人导航' }).locator('.sh-platform')).toHaveCount(5);
  const first = (await page.context().cookies()).find(value => value.name === 'age_dev');
  expect(first?.httpOnly).toBe(true);
  await page.reload();
  await expect(page.getByTestId('story-lab')).toBeVisible();
  const second = (await page.context().cookies()).find(value => value.name === 'age_dev');
  expect(second?.value).toBe(first?.value);
  expect(second?.expires).toBe(first?.expires);
  await page.screenshot({ path: 'var/screenshots/story-mobile-390.png', fullPage: false });
  await page.getByRole('button', { name: '重新确认年龄' }).click();
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('memory confirmation disappears after refresh; empty leave target shows notice', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByLabel('仅在本次访问中确认').check();
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  await expect(page.getByTestId('story-lab')).toBeVisible();
  expect((await page.context().cookies()).some(value => value.name.includes('age'))).toBe(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  await page.getByRole('button', { name: '离开', exact: true }).click();
  await expect(page.getByRole('button', { name: '返回确认页' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('saved draft survives reload; full-screen preview renders the story; invalid publish preserves the public version', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const before = await (await control.get('/api/gate')).json();
  await page.getByLabel('站点名称', { exact: true }).fill('顾清棠·草稿验证');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('站点名称', { exact: true })).toHaveValue('顾清棠·草稿验证');
  await page.getByRole('button', { name: '预览草稿', exact: true }).click();
  const dialog = page.locator('dialog.preview-dialog');
  await expect(dialog.locator('.story-lab')).toBeVisible();
  await expect(dialog.locator('.preview-bar')).toContainText('尚未发布');
  await expect(dialog.getByRole('heading', { name: '顾清棠·草稿验证', exact: false }).first()).toBeVisible();
  const avatar = dialog.locator('.sh-avatar img');
  await expect.poll(() => avatar.evaluate((image: HTMLImageElement) => image.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: 'var/screenshots/story-admin-preview.png' });
  await page.getByRole('button', { name: '返回编辑', exact: true }).click();
  await page.getByRole('button', { name: '检查并发布' }).click();
  await expect(page.getByText('请检查以下字段：')).toBeVisible();
  const after = await (await control.get('/api/gate')).json();
  expect(after.versionId).toBe(before.versionId);
  expect(after.name).toBe(before.name);
  expect((await currentDraft()).config.site.name).toBe('顾清棠·草稿验证');
});

test('editing during a delayed save preserves later input and the next save persists it', async ({ page }) => {
  await login(page);
  let release!: () => void; let received!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const saved = new Promise<void>(resolve => { received = resolve; });
  await page.route('**/api/admin/draft', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch(); received(); await hold; await route.fulfill({ response });
  }, { times: 1 });
  const name = page.getByLabel('站点名称', { exact: true });
  await name.fill('保存发出时的文字');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await saved; await name.fill('等待期间继续输入'); release();
  await expect(page.getByText(/草稿已保存/).first()).toBeVisible();
  await expect(name).toHaveValue('等待期间继续输入');
  await expect(page.getByText(/有未保存修改/)).toBeVisible();
  expect((await currentDraft()).config.site.name).toBe('保存发出时的文字');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByText(/草稿已保存/).first()).toBeVisible();
  expect((await currentDraft()).config.site.name).toBe('等待期间继续输入');
  await page.reload(); await expect(name).toHaveValue('等待期间继续输入');
});

test('principal entry changes require confirmation; stale revision errors preserve input', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  await page.getByRole('button', { name: '五个导航入口', exact: true }).click();
  const panel = page.locator('.editor-panel').filter({ has: page.getByRole('heading', { name: '3. Telegram 预告频道', exact: true }) });
  await panel.getByLabel('目标地址', { exact: true }).fill('https://t.me/m3_fixture');
  await panel.getByLabel('启用入口', { exact: true }).check();
  await panel.getByLabel('启用入口', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '停用主要入口？' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保留入口', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel.getByLabel('启用入口', { exact: true })).toBeChecked();
  await panel.getByLabel('公开显示', { exact: true }).click();
  await page.getByRole('button', { name: '确认隐藏', exact: true }).click();
  await expect(panel.getByLabel('公开显示', { exact: true })).not.toBeChecked();
  await replaceDraft(structuredClone(baseline.config));
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '当前输入已保留' })).toBeVisible();
  await expect(panel.getByLabel('公开显示', { exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// Last scenario publishes only to the disposable server. No destination request leaves the test browser.
test('valid publication switches content; memory access loads the avatar and resolves attributed navigation', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const config = structuredClone(baseline.config);
  config.site.name = '发布流程验证'; config.ageGate.exitUrl = 'https://www.wikipedia.org/';
  config.footer.contactEmail = 'fixture@qingtang.invalid';
  config.links[0]!.enabled = true; config.links[0]!.url = 'https://x.com/m3_fixture';
  await replaceDraft(config); await login(page);
  await page.getByRole('button', { name: '检查并发布' }).click();
  await expect(page.getByText(/已发布版本/).first()).toBeVisible();
  const visitor = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } });
  try {
    const view = await visitor.newPage(); await view.goto('/?from=weekly');
    await expect(view.locator('main').getByRole('img')).toHaveCount(0);
    await view.getByLabel('仅在本次访问中确认').check();
    await view.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
    const story = view.getByTestId('story-lab');
    await expect(story.getByRole('heading', { name: config.site.name, exact: false }).first()).toBeVisible();
    await expect.poll(() => story.locator('.sh-avatar img').evaluate((image: HTMLImageElement) => image.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
    await view.screenshot({ path: 'var/screenshots/story-published-390.png', fullPage: false });
    expect(await view.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect((await visitor.cookies()).some(cookie => cookie.name.includes('age'))).toBe(false);
    await view.route('https://x.com/m3_fixture', route => route.fulfill({ contentType: 'text/plain', body: 'fixture destination' }));
    await view.getByRole('link', { name: 'X 主页，前往外部平台', exact: true }).click();
    await expect(view).toHaveURL('https://x.com/m3_fixture');
    await view.setViewportSize({ width: 1440, height: 1000 });
    await view.goto('/?from=profile');
    await view.getByLabel('仅在本次访问中确认').check();
    await view.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
    await expect(view.getByTestId('story-lab')).toBeVisible();
    await visitor.route('https://x.com/m3_fixture', route => route.fulfill({ contentType: 'text/plain', body: 'desktop fixture destination' }));
    const popupPromise = view.waitForEvent('popup');
    await view.getByRole('link', { name: 'X 主页，前往外部平台', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL('https://x.com/m3_fixture', { timeout: 15_000 });
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(view).toHaveURL(origin + '/?from=profile');
    await popup.close();
    const today = new Date().toISOString().slice(0, 10);
    const statistics = await (await control.get(`/api/admin/stats?from=${today}&to=${today}`)).json();
    expect(statistics.buckets.some((item: { event: string; source: string; linkId: string; count: number }) => item.event === 'link_click' && item.source === 'weekly' && item.linkId === 'x_profile' && item.count === 1)).toBe(true);
  } finally { await visitor.close(); }
});
