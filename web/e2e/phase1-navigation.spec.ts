import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Draft } from '../src/components/client-api.ts';
import { fixtureAccount } from './fixture.ts';

// All configuration and navigation run against the disposable test service.
const origin = 'http://localhost:3103';
const fixtureDestination = 'https://x.com/phase1_fixture';
let control: APIRequestContext;
let csrf = '';
let baseline: Draft;
let publishedVersion = '';

async function replaceDraft(config: Draft['config']) {
  const response = await control.get('/api/admin/draft');
  expect(response.status()).toBe(200);
  const current = await response.json() as Draft;
  const saved = await control.put('/api/admin/draft', {
    data: { expectedRevision: current.revision, config }, headers: { 'X-CSRF-Token': csrf },
  });
  expect(saved.status()).toBe(200);
  return saved.json() as Promise<Draft>;
}

test.beforeAll(async ({ playwright }) => {
  control = await playwright.request.newContext({
    baseURL: origin, extraHTTPHeaders: { Origin: origin, 'User-Agent': 'phase1-navigation-fixture-control' },
  });
  const login = await control.post('/api/admin/login', { data: fixtureAccount });
  expect(login.status()).toBe(200);
  csrf = (await login.json()).csrfToken;
  const response = await control.get('/api/admin/draft');
  expect(response.status()).toBe(200);
  baseline = await response.json() as Draft;
  const config = structuredClone(baseline.config);
  config.gallery.enabled = true;
  config.gallery.photos.forEach(photo => { photo.visible = true; });
  config.ageGate.exitUrl = 'https://www.wikipedia.org/';
  config.footer.contactEmail = 'fixture@qingtang.invalid';
  config.links.forEach(link => {
    link.visible = true;
    link.enabled = ['x_profile', 'tg_personal'].includes(link.id);
    link.url = link.id === 'x_profile' ? fixtureDestination : link.id === 'tg_personal' ? 'https://t.me/phase1_fixture' : '';
  });
  const saved = await replaceDraft(config);
  const publication = await control.post('/api/admin/publish', {
    data: { expectedRevision: saved.revision }, headers: { 'X-CSRF-Token': csrf },
  });
  expect(publication.status()).toBe(201);
  publishedVersion = (await publication.json()).versionId;
});

test.afterAll(async () => {
  try { if (control && baseline) await replaceDraft(baseline.config); }
  finally { await control?.dispose(); }
});

async function enter(page: Page, portrait: boolean, memory = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(portrait ? '/?experience=light-gallery&from=weekly' : '/?from=weekly');
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  if (memory) await page.getByLabel('仅在本次访问中确认').check();
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const content = page.getByTestId(portrait ? 'light-gallery' : 'public-content');
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute('data-motion', 'off');
  return content.getByRole('navigation', { name: '个人导航', exact: true });
}

for (const portrait of [false, true]) {
  test(`${portrait ? 'portrait' : 'home'} mobile pending prevents same-task duplicates and offers a local retry`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const navigation = await enter(page, portrait);
    const entry = navigation.getByRole('link', { name: /X 主页/ });
    await expect(entry).toHaveAttribute('href', `/go/x_profile?version=${encodeURIComponent(publishedVersion)}`);
    await expect(navigation.locator('[data-state="unavailable"]')).toHaveCount(3);
    await expect(navigation.locator('[data-state="unavailable"].emphasized, [data-state="unavailable"].is-emphasized')).toHaveCount(0);
    const initial = await entry.boundingBox();
    expect(initial).not.toBeNull();
    let release = () => {};
    const hold = new Promise<void>(resolve => { release = resolve; });
    let resolveCount = 0;
    await page.route('**/api/links/*/resolve', async route => {
      resolveCount++;
      expect(route.request().postDataJSON()).toMatchObject({ versionId: publishedVersion, source: 'weekly' });
      if (resolveCount === 1) {
        await hold;
        await route.fulfill({ status: 500, json: { error: { code: 'TEMPORARY_FAILURE', message: '连接暂时中断，请重试。' } } });
      } else {
        await route.fulfill({ json: { url: fixtureDestination } });
      }
    });
    await page.context().route(fixtureDestination, route => route.fulfill({ contentType: 'text/plain', body: 'isolated phase1 navigation fixture' }));
    try {
      // React has not rendered the pending state between these clicks; the ref must guard them.
      await navigation.evaluate(nav => {
        const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')];
        for (let count = 0; count < 4; count++) links.forEach(link => link.click());
      });
      await expect.poll(() => resolveCount).toBe(1);
      await expect(entry).toHaveAttribute('data-state', 'pending');
      await expect(entry).toHaveAttribute('aria-busy', 'true');
      await expect(entry).toContainText('正在打开…');
      await expect(navigation.locator('a[aria-disabled="true"]')).toHaveCount(2);
      await expect(navigation).toHaveAttribute('data-pending', 'true');
      await expect(entry.locator('.lg-link-progress')).toHaveCount(1);
      const otherOpacities = await navigation.locator('.lg-platform:not([data-state="pending"]), .public-link:not([data-state="pending"])').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).opacity)));
      expect(otherOpacities).toHaveLength(4);
      otherOpacities.forEach(value => expect(value).toBeCloseTo(.65, 2));
      expect(await entry.locator('.lg-link-progress').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      const pending = await entry.boundingBox();
      expect(pending).not.toBeNull();
      expect(pending!.width).toBeCloseTo(initial!.width, 1);
      expect(pending!.height).toBeCloseTo(initial!.height, 1);
      release();
      await expect(entry).toHaveAttribute('data-state', 'error');
      await expect(entry).toHaveAttribute('aria-busy', 'false');
      await expect(navigation.locator('a[aria-disabled="true"]')).toHaveCount(0);
      expect(await navigation.getAttribute('data-pending')).toBeNull();
      await expect(entry.locator('.lg-link-progress')).toHaveCount(0);
      const feedback = navigation.locator('.link-feedback');
      await expect(feedback.getByRole('alert')).toHaveText('连接暂时中断，请重试。');
      await expect(page.locator('.public-notice')).toHaveCount(0);
      expect(await entry.getAttribute('aria-describedby')).toBe(await feedback.getByRole('alert').getAttribute('id'));
      const feedbackBox = await feedback.boundingBox();
      const entryBox = await entry.boundingBox();
      expect(feedbackBox).not.toBeNull();
      expect(entryBox).not.toBeNull();
      expect(feedbackBox!.height).toBeCloseTo(entryBox!.height, 1);
      expect(await feedback.evaluate(element => Boolean(element.closest('.noir-link-shell, .lg-link-shell')))).toBe(true);
      const retry = feedback.getByRole('button', { name: /重试打开X 主页/ });
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await Promise.all([page.waitForURL(fixtureDestination), retry.click()]);
      expect(resolveCount).toBe(2);
    } finally { release(); }
  });

  test(`${portrait ? 'portrait' : 'home'} keyboard and retry preserve desktop memory navigation and close failed popups`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const navigation = await enter(page, portrait, true);
    await page.context().route(fixtureDestination, route => route.fulfill({ contentType: 'text/plain', body: 'isolated phase1 desktop fixture' }));
    let release = () => {};
    const hold = new Promise<void>(resolve => { release = resolve; });
    let resolveCount = 0;
    await page.route('**/api/links/x_profile/resolve', async route => {
      resolveCount++;
      expect(Boolean((await route.request().allHeaders()).authorization?.startsWith('Bearer '))).toBe(true);
      expect(route.request().postDataJSON()).toMatchObject({ versionId: publishedVersion, source: 'weekly' });
      if (resolveCount === 1) {
        await hold;
        await route.fulfill({ status: 503, json: { error: { code: 'TEMPORARY_FAILURE', message: '平台响应较慢，请重试。' } } });
      } else await route.fulfill({ json: { url: fixtureDestination } });
    });
    try {
      const opened = page.waitForEvent('popup');
      await navigation.getByRole('link', { name: /X 主页/ }).focus();
      await page.keyboard.press('Enter');
      const failedPopup = await opened;
      await expect.poll(() => resolveCount).toBe(1);
      release();
      await expect(navigation.getByRole('alert')).toHaveText('平台响应较慢，请重试。');
      await expect.poll(() => failedPopup.isClosed()).toBe(true);
      const reopened = page.waitForEvent('popup');
      await navigation.getByRole('button', { name: /重试打开X 主页/ }).click();
      const popup = await reopened;
      await expect(popup).toHaveURL(fixtureDestination);
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await popup.close();
      expect(resolveCount).toBe(2);
      await expect(page).toHaveURL(new RegExp(`${origin.replaceAll('.', '\\.')}.*from=weekly`));
      await expect(navigation.getByRole('alert')).toHaveCount(0);
    } finally { release(); }
  });
}

test('a blocked popup shows an entry-level reason and its retry releases the navigation lock', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const navigation = await enter(page, true);
  let resolveCount = 0;
  await page.route('**/api/links/x_profile/resolve', async route => {
    resolveCount++;
    await route.fulfill({ json: { url: fixtureDestination } });
  });
  await page.context().route(fixtureDestination, route => route.fulfill({ contentType: 'text/plain', body: 'isolated phase1 popup fixture' }));
  await page.evaluate(() => {
    const originalOpen = window.open;
    window.open = () => { window.open = originalOpen; return null; };
  });
  await navigation.getByRole('link', { name: /X 主页/ }).click();
  await expect(navigation.getByRole('alert')).toHaveText('请允许本站打开新标签页后重试。');
  expect(resolveCount).toBe(0);
  await expect(page.locator('.public-notice')).toHaveCount(0);
  const opened = page.waitForEvent('popup');
  await navigation.getByRole('button', { name: /重试打开X 主页/ }).click();
  const popup = await opened;
  await expect(popup).toHaveURL(fixtureDestination);
  expect(resolveCount).toBe(1);
  await popup.close();
});

test('portrait Telegram pending keeps all five entries still at 550px and retry retains keyboard focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 550, height: 1000 });
  const navigation = await enter(page, true);
  const content = page.getByTestId('light-gallery');
  await expect.poll(() => content.locator('img').evaluateAll(images => images.length === 2 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const entries = navigation.locator('.lg-platform');
  await expect(entries).toHaveCount(5);
  const telegram = navigation.getByRole('link', { name: /Telegram 个人账号/ });
  await telegram.scrollIntoViewIfNeeded();
  const rects = () => entries.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  const baselineRects = await rects();
  let releaseFirst = () => {}, releaseRetry = () => {};
  const firstHold = new Promise<void>(resolve => { releaseFirst = resolve; });
  const retryHold = new Promise<void>(resolve => { releaseRetry = resolve; });
  let resolveCount = 0;
  await page.route('**/api/links/tg_personal/resolve', async route => {
    const attempt = ++resolveCount;
    await (attempt === 1 ? firstHold : retryHold);
    await route.fulfill({ status: 503, json: { error: { code: 'TEMPORARY_FAILURE', message: '连接暂时中断，请重试。' } } });
  });
  try {
    await telegram.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => resolveCount).toBe(1);
    await expect(telegram).toHaveAttribute('data-state', 'pending');
    await expect(telegram).toBeFocused();
    const pendingRects = await rects();
    for (const [index, rect] of pendingRects.entries()) {
      for (const dimension of ['x', 'y', 'width', 'height'] as const) {
        expect(rect[dimension], `Entry ${index + 1} ${dimension} stays fixed during Telegram pending.`).toBeCloseTo(baselineRects[index]![dimension], 1);
      }
    }
    const pendingScreenshot = testInfo.outputPath('portrait-telegram-pending-550.png');
    await page.screenshot({ path: pendingScreenshot, fullPage: true });
    await testInfo.attach('Telegram pending at 550px', { path: pendingScreenshot, contentType: 'image/png' });
    releaseFirst();
    await expect(navigation.getByRole('alert')).toHaveText('连接暂时中断，请重试。');
    const errorScreenshot = testInfo.outputPath('portrait-telegram-error-550.png');
    await page.screenshot({ path: errorScreenshot, fullPage: true });
    await testInfo.attach('Telegram failure at 550px', { path: errorScreenshot, contentType: 'image/png' });
    const retry = navigation.getByRole('button', { name: '重试打开Telegram 个人账号', exact: true });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => resolveCount).toBe(2);
    await expect(telegram).toHaveAttribute('data-state', 'pending');
    await expect(telegram).toBeFocused();
    releaseRetry();
    await expect(telegram).toHaveAttribute('data-state', 'error');
    await expect(telegram).toBeFocused();
    await expect(navigation.getByRole('alert')).toHaveText('连接暂时中断，请重试。');
    await page.keyboard.press('Tab');
    await expect(retry).toBeFocused();
  } finally { releaseFirst(); releaseRetry(); }
});

test('an expired navigation confirmation returns to the age gate and can be confirmed again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = await enter(page, false);
  await page.route('**/api/links/x_profile/resolve', route => route.fulfill({
    status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Fixture confirmation expired.' } },
  }));
  await navigation.getByRole('link', { name: /X 主页/ }).click();
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  await expect(page.locator('.gate-content').getByRole('alert')).toHaveText('确认已到期，请重新确认年龄。');
  await expect(page.getByTestId('public-content')).toHaveCount(0);
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  await expect(page.getByTestId('public-content')).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
});

test('portrait failure stays inside the row and never moves the five entries', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = await enter(page, true);
  const entry = navigation.getByRole('link', { name: /X 主页/ });
  const entries = navigation.locator('.lg-platform');
  await expect(entries).toHaveCount(5);
  const tops = () => entries.evaluateAll(elements => elements.map(element => +element.getBoundingClientRect().top.toFixed(2)));
  const before = await tops();
  const entryHeight = (await entry.boundingBox())!.height;
  await page.route('**/api/links/x_profile/resolve', route => route.fulfill({
    status: 503, json: { error: { code: 'TEMPORARY_FAILURE', message: '连接暂时中断，请重试。' } },
  }));
  await entry.click();
  await expect(entry).toHaveAttribute('data-state', 'error');
  await expect(navigation.getByRole('alert')).toHaveText('连接暂时中断，请重试。');
  const after = await tops();
  after.forEach((top, index) => expect(top).toBeCloseTo(before[index]!, 1));
  const feedback = navigation.locator('.link-feedback');
  await expect(feedback).toHaveCount(1);
  expect(await feedback.evaluate(element => Boolean(element.closest('.lg-link-shell')))).toBe(true);
  expect((await feedback.boundingBox())!.height).toBeCloseTo(entryHeight, 1);
  const retry = feedback.getByRole('button', { name: /重试打开X 主页/ });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const shot = testInfo.outputPath('portrait-error-in-row-390.png');
  await page.screenshot({ path: shot, fullPage: true });
  await testInfo.attach('Portrait failure in row at 390px', { path: shot, contentType: 'image/png' });
});

// Last: a real publication changes the disposable service's public version.
test('a changed publication stays pending through refresh and preserves focus and manual static mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = await enter(page, true, true);
  const portrait = page.getByTestId('light-gallery');
  await expect.poll(() => portrait.locator('img').evaluateAll(images => images.length === 2 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(portrait).toHaveAttribute('data-motion', 'on');
  await portrait.getByRole('button', { name: '静态浏览', exact: true }).click();
  await expect(portrait).toHaveAttribute('data-motion', 'off');
  const entry = navigation.getByRole('link', { name: /X 主页/ });
  await entry.focus();

  const currentResponse = await control.get('/api/admin/draft');
  expect(currentResponse.status()).toBe(200);
  const current = await currentResponse.json() as Draft;
  const updatedConfig = structuredClone(current.config);
  updatedConfig.site.tagline = '版本更新后的测试说明';
  const saved = await replaceDraft(updatedConfig);
  const publication = await control.post('/api/admin/publish', {
    data: { expectedRevision: saved.revision }, headers: { 'X-CSRF-Token': csrf },
  });
  expect(publication.status()).toBe(201);
  const updatedVersion = (await publication.json()).versionId as string;
  expect(updatedVersion).not.toBe(publishedVersion);

  let release = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; });
  let refreshRequested = false;
  await page.route('**/api/site', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    expect((await response.json()).versionId).toBe(updatedVersion);
    refreshRequested = true;
    await hold;
    await route.fulfill({ response });
  });
  const resolveVersions: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/links/x_profile/resolve') {
      expect(request.postDataJSON().source).toBe('weekly');
      resolveVersions.push(request.postDataJSON().versionId);
    }
  });
  await page.context().route(fixtureDestination, route => route.fulfill({ contentType: 'text/plain', body: 'isolated phase1 refreshed fixture' }));
  try {
    const conflicted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/links/x_profile/resolve');
    await page.keyboard.press('Enter');
    const conflict = await conflicted;
    expect(conflict.status()).toBe(409);
    expect(Boolean((await conflict.request().allHeaders()).authorization?.startsWith('Bearer '))).toBe(true);
    await expect.poll(() => refreshRequested).toBe(true);
    await expect(entry).toHaveAttribute('data-state', 'pending');
    await expect(entry).toHaveAttribute('aria-busy', 'true');
    await expect(navigation.locator('a[aria-disabled="true"]')).toHaveCount(2);
    await expect(entry).toBeFocused();
    await expect(portrait).toHaveAttribute('data-motion', 'off');
    await page.keyboard.press('Enter');
    expect(resolveVersions).toEqual([publishedVersion]);
    release();
    await expect(entry).toHaveAttribute('href', `/go/x_profile?version=${encodeURIComponent(updatedVersion)}`);
    await expect(entry).toHaveAttribute('data-state', 'available');
    await expect(entry).toBeFocused();
    await expect(portrait).toHaveAttribute('data-motion', 'off');
    await expect(portrait.getByRole('button', { name: '开启文字动效', exact: true })).toBeEnabled();
    await expect(portrait.locator('.lg-tagline')).toHaveText('版本更新后的测试说明');
    await expect(navigation.getByRole('alert')).toHaveCount(0);
    await expect(navigation.locator('.link-retry')).toHaveCount(0);
    await Promise.all([page.waitForURL(fixtureDestination), page.keyboard.press('Enter')]);
    expect(resolveVersions).toEqual([publishedVersion, updatedVersion]);
  } finally { release(); }
});
