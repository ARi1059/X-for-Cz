import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { Draft } from '../src/components/client-api.ts';
import { fixtureAccount } from './fixture.ts';

// Only uses the disposable server. Never connects to localhost:3000 or the user's database.
// Preserve the existing preview URL while replacing the former gallery experience.
const origin = 'http://localhost:3103';
const previewPath = '/?experience=light-gallery&from=weekly';
let control: APIRequestContext;
let csrf = '';
let baseline: Draft;
let publishedVersion = '';
let expectedNavigation: Array<{ label: string; available: boolean }> = [];
let expectedMedia: string[] = [];
let firstPhotoMedia = '';

async function replaceDraft(config: Draft['config']) {
  const currentResponse = await control.get('/api/admin/draft');
  expect(currentResponse.status()).toBe(200);
  const current = await currentResponse.json() as Draft;
  const response = await control.put('/api/admin/draft', {
    data: { expectedRevision: current.revision, config }, headers: { 'X-CSRF-Token': csrf },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Draft>;
}

async function enterPortrait(page: Page, { memory = false, imageCount = 2 } = {}) {
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  if (memory) await page.getByLabel('仅在本次访问中确认').check();
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const portrait = page.getByTestId('light-gallery');
  await expect(portrait).toBeVisible({ timeout: 15_000 });
  await expect(portrait).toHaveAttribute('data-experience', 'portrait-navigation');
  await expect.poll(() => portrait.locator('img').evaluateAll((images, count) =>
    images.length === count && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0), imageCount
  ), { timeout: 20_000, message: 'Only the protected background and avatar should decode.' }).toBe(true);
  return portrait;
}

async function expectNoGallery(portrait: Locator) {
  await expect(portrait.locator('canvas, .lg-exhibition, .lg-stage, .lg-photos, .lg-selection, .lg-scroll-rail')).toHaveCount(0);
  await expect(portrait.getByRole('region', { name: '私藏光廊', exact: true })).toHaveCount(0);
  await expect(portrait.getByRole('button', { name: /^(选择第 [0-9]+ 张照片|上一张|下一张|走近这一刻|返回光廊)$/ })).toHaveCount(0);
  await expect(portrait.getByText('私藏光廊', { exact: true })).toHaveCount(0);
}

/** Check actual geometry and hit-testing, not only CSS visibility. Short screens may naturally scroll. */
async function expectDirectNavigation(page: Page, portrait: Locator, allowNaturalScroll = false) {
  const nav = portrait.getByRole('navigation', { name: '个人导航', exact: true });
  const entries = nav.locator('a, button');
  await expect(nav).toHaveCount(1); await expect(entries).toHaveCount(5);
  for (const [index, entry] of expectedNavigation.entries()) {
    await expect(entries.nth(index)).toContainText(entry.label);
    if (entry.available) await expect(entries.nth(index)).toHaveJSProperty('tagName', 'A');
    else await expect(entries.nth(index)).toBeDisabled();
  }
  await expect(nav.getByRole('link', { name: /X 主页/ })).toBeVisible();
  await expect(portrait.getByRole('button', { name: '所有入口', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '所有入口', exact: true })).toHaveCount(0);
  if (allowNaturalScroll) {
    for (const entry of await entries.all()) {
      await entry.scrollIntoViewIfNeeded(); await expect(entry).toBeInViewport();
      expect(await entry.evaluate(element => {
        const r = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    return;
  }
  await expect.poll(() => entries.evaluateAll(items => items.flatMap(item => {
    const r = item.getBoundingClientRect(), label = item.textContent?.trim() ?? item.tagName;
    if (r.width <= 0 || r.height <= 0 || r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) return ['outside viewport: ' + label];
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit && item.contains(hit) ? [] : ['covered: ' + label];
  })), { message: 'All five entries stay visible and uncovered.' }).toEqual([]);
}

test.beforeAll(async ({ playwright }) => {
  control = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin, 'User-Agent': 'portrait-navigation-fixture-control' },
  });
  const login = await control.post('/api/admin/login', { data: fixtureAccount });
  expect(login.status()).toBe(200);
  csrf = (await login.json()).csrfToken;
  const response = await control.get('/api/admin/draft');
  expect(response.status()).toBe(200);
  baseline = await response.json() as Draft;
  const config = structuredClone(baseline.config);
  expect(config.gallery.photos).toHaveLength(5);
  expect(config.site.avatarMediaId).not.toBeNull();
  config.gallery.enabled = true;
  config.gallery.photos.forEach(photo => { photo.visible = true; });
  config.ageGate.exitUrl = 'https://www.wikipedia.org/';
  config.footer.contactEmail = 'fixture@qingtang.invalid';
  const entry = config.links.find(link => link.id === 'x_profile')!;
  entry.enabled = true; entry.visible = true; entry.url = 'https://x.com/light_gallery_fixture';
  expectedNavigation = config.links.filter(link => link.visible).sort((a, b) => a.position - b.position).map(link => ({ label: link.label, available: Boolean(link.enabled && link.url) }));
  const photos = config.gallery.photos.filter(photo => photo.visible).sort((a, b) => a.position - b.position);
  firstPhotoMedia = photos[0]!.mediaId;
  expectedMedia = [config.site.avatarMediaId!, photos[4]!.mediaId].sort();
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

test('portrait navigation keeps only its avatar and fifth-photo background behind confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const protectedRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/site' || url.pathname.startsWith('/media/')) protectedRequests.push(url.pathname);
  });
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  expect(protectedRequests).toEqual([]);
  await expect(page.getByTestId('light-gallery')).toHaveCount(0);
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const portrait = page.getByTestId('light-gallery');
  await expect(portrait).toHaveAttribute('data-experience', 'portrait-navigation');
  await expect.poll(() => portrait.locator('img').evaluateAll(images => images.length === 2 && images.every(image => (image as HTMLImageElement).naturalWidth > 0)), { timeout: 20_000 }).toBe(true);
  expect([...new Set(protectedRequests.filter(path => path.startsWith('/media/')).map(path => decodeURIComponent(path.slice('/media/'.length))))].sort()).toEqual(expectedMedia);
  const background = portrait.locator('.lg-backdrop-photo img');
  await expect(background).toHaveCount(1);
  const lqip = portrait.locator('.lg-backdrop-lqip');
  await expect(lqip).toHaveCount(1);
  await expect(lqip).toHaveAttribute('style', /data:image\/webp;base64/);
  await expect(lqip).toHaveClass(/is-ready/);
  expect(await background.evaluate(image => Boolean(image.closest('[aria-hidden="true"]')))).toBe(true);
  expect(await portrait.locator('.lg-backdrop').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await expectNoGallery(portrait);
  await expectDirectNavigation(page, portrait);
});

test('compact buttons leave the portrait clear across desktop tablet and mobile widths', async ({ page }) => {
  const portrait = await enterPortrait(page);
  for (const [width, height] of [[1440, 1000], [1854, 1018], [850, 1000], [768, 1000], [390, 844], [320, 844], [375, 568], [320, 568]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectDirectNavigation(page, portrait, height < 600);
    const dimensions = await portrait.locator('.lg-platform').evaluateAll(items => items.map(item => { const r = item.getBoundingClientRect(); return { width: r.width, right: r.right, height: r.height }; }));
    for (const rect of dimensions) {
      expect(rect.width).toBeLessThanOrEqual(width >= 850 ? 301 : Math.min(301, width * .45 + 1));
      expect(rect.right).toBeLessThanOrEqual(width * .5 + 1);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    const photo = await portrait.locator('.lg-backdrop-photo img').evaluate(element => {
      const image = element as HTMLImageElement, rect = image.getBoundingClientRect();
      return { ratio: rect.width / rect.height, naturalRatio: image.naturalWidth / image.naturalHeight,
        right: rect.right, subjectAnchor: (rect.left + rect.width * .46) / innerWidth, fit: getComputedStyle(image).objectFit };
    });
    expect(Math.abs(photo.ratio - photo.naturalRatio)).toBeLessThan(.002);
    expect(photo.fit).toBe('contain');
    if (width > 1100) expect(Math.abs(photo.right - width)).toBeLessThan(1);
    else {
      // Manual composition anchor for the existing fifth photo, not face detection.
      expect(photo.subjectAnchor).toBeGreaterThan(.7);
      expect(photo.subjectAnchor).toBeLessThan(.82);
    }
    const background = await portrait.locator('.lg-backdrop').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { fillsViewport: rect.left <= 0 && rect.top <= 0 && rect.right >= innerWidth && rect.bottom >= innerHeight,
        fill: getComputedStyle(element).backgroundImage };
    });
    expect(background.fillsViewport).toBe(true);
    expect(background.fill).toContain('gradient');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expectNoGallery(portrait);
  }
});

test('text-motion pause and reduced motion preserve background and navigation without WebGL', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const media: string[] = [];
  page.on('request', request => { const u = new URL(request.url()); if (u.pathname.startsWith('/media/')) media.push(u.pathname); });
  const portrait = await enterPortrait(page);
  const imageSource = await portrait.locator('.lg-backdrop-photo img').getAttribute('src');
  const mediaCount = media.length;
  await portrait.getByRole('button', { name: '静态浏览', exact: true }).click();
  await expect(portrait.getByRole('button', { name: '开启文字动效', exact: true })).toBeVisible();
  const title = portrait.locator('.lg-identity h1');
  const paused = await title.evaluate(element => getComputedStyle(element).backgroundPosition);
  await page.waitForTimeout(180);
  expect(await title.evaluate(element => getComputedStyle(element).backgroundPosition)).toBe(paused);
  await portrait.getByRole('button', { name: '开启文字动效', exact: true }).click();
  await expect(portrait.getByRole('button', { name: '静态浏览', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(portrait.getByRole('button', { name: '系统减少动态', exact: true })).toBeDisabled();
  expect(await portrait.locator('.lg-backdrop-photo img').getAttribute('src')).toBe(imageSource);
  expect(media.length).toBe(mediaCount);
  await expectNoGallery(portrait);
  await expectDirectNavigation(page, portrait);
});

test('memory access retains versioned bearer navigation and reset removes protected imagery', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mediaRequests: Array<Promise<{ id: string; bearer: boolean; version: string | null }>> = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/media/')) mediaRequests.push(request.allHeaders().then(headers => ({
      id: url.pathname, bearer: Boolean(headers.authorization?.startsWith('Bearer ')), version: url.searchParams.get('version'),
    })));
  });
  const portrait = await enterPortrait(page, { memory: true });
  const requests = await Promise.all(mediaRequests);
  expect(new Set(requests.filter(request => request.bearer && request.version === publishedVersion).map(request => request.id)).size).toBe(2);
  expect((await page.context().cookies()).some(cookie => cookie.name.includes('age'))).toBe(false);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await expectDirectNavigation(page, portrait);
  await page.context().route('https://x.com/light_gallery_fixture', route => route.fulfill({ contentType: 'text/plain', body: 'isolated portrait fixture' }));
  const resolved = page.waitForRequest(request => new URL(request.url()).pathname === '/api/links/x_profile/resolve' && request.method() === 'POST');
  const opened = page.waitForEvent('popup');
  await portrait.getByRole('navigation', { name: '个人导航', exact: true }).getByRole('link', { name: /X 主页/ }).click();
  const resolveRequest = await resolved;
  expect(Boolean((await resolveRequest.allHeaders()).authorization?.startsWith('Bearer '))).toBe(true);
  expect(resolveRequest.postDataJSON()).toMatchObject({ versionId: publishedVersion, source: 'weekly' });
  const popup = await opened;
  await expect(popup).toHaveURL('https://x.com/light_gallery_fixture');
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  await portrait.getByRole('button', { name: '重新确认年龄', exact: true }).click();
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  await expect(portrait).toHaveCount(0);
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  await expect(page.getByTestId('light-gallery')).toHaveCount(0);
});

test('empty photo data keeps a plain background and all navigation without hidden gallery requests', async ({ page }) => {
  await page.route('**/api/site', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ response, json: { ...data, gallery: { ...data.gallery, photos: [] } } });
  });
  const mediaPaths: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/media/')) mediaPaths.push(path); });
  const portrait = await enterPortrait(page, { imageCount: 1 });
  await expect(portrait.locator('.lg-backdrop-photo img')).toHaveCount(0);
  expect(new Set(mediaPaths).size).toBe(1);
  await expectNoGallery(portrait);
  await expectDirectNavigation(page, portrait);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 40)).toBe(true);
  const draft = await (await control.get('/api/admin/draft')).json() as Draft;
  expect(draft.config.gallery.photos).toHaveLength(5);
});

test('a single available photograph becomes the background without recreating the gallery', async ({ page }) => {
  await page.route('**/api/site', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ response, json: { ...data, gallery: { ...data.gallery, photos: data.gallery.photos.slice(0, 1) } } });
  });
  const mediaPaths: string[] = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/media/')) mediaPaths.push(path); });
  await page.setViewportSize({ width: 390, height: 844 });
  const portrait = await enterPortrait(page);
  const uniqueMedia = [...new Set(mediaPaths.map(path => decodeURIComponent(path.slice('/media/'.length))))].sort();
  expect(uniqueMedia).toEqual([baseline.config.site.avatarMediaId!, firstPhotoMedia].sort());
  await expect(portrait.locator('.lg-backdrop-photo img')).toHaveCount(1);
  await expectNoGallery(portrait);
  await expectDirectNavigation(page, portrait);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 40)).toBe(true);
});

test('arrow and page keys are no longer intercepted and there is no empty gallery scroll track', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const portrait = await enterPortrait(page);
  const entry = portrait.getByRole('link', { name: /X 主页/ });
  await entry.focus();
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp']) {
    expect(await entry.evaluate((element, key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, key)).toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 40)).toBe(true);
  await page.mouse.move(1100, 550);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(40);
  await expectNoGallery(portrait);
  await expectDirectNavigation(page, portrait);
});

test('site information remains available without hiding navigation in a modal menu', async ({ page }) => {
  const portrait = await enterPortrait(page);
  const trigger = portrait.getByRole('button', { name: '站点说明', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '站点说明', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => getComputedStyle(element).transitionDuration)).toContain('0.18s');
  await expect(dialog.getByRole('link', { name: 'fixture@qingtang.invalid', exact: true })).toHaveAttribute('href', 'mailto:fixture@qingtang.invalid');
  await expect(dialog.getByRole('navigation', { name: '个人导航', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭站点说明', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expectDirectNavigation(page, portrait);
});

test('the original homepage remains separate from the portrait-only preview', async ({ page }) => {
  await enterPortrait(page);
  await page.goto('/');
  await expect(page.getByTestId('public-content')).toBeVisible();
  await expect(page.getByTestId('light-gallery')).toHaveCount(0);
  await expect(page.locator('.gallery')).toBeVisible();
  await expect(page.locator('.gallery .photo')).toHaveCount(5);
});


async function enterLab(page: Page) {
  await page.goto('/?experience=lusion');
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const lab = page.getByTestId('story-lab');
  await expect(lab).toBeVisible({ timeout: 15_000 });
  return lab;
}

test('Story Lab renders the five-section narrative with a fixed panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const lab = await enterLab(page);
  await expect(lab.locator('.story-fixed')).toBeVisible();
  await expect(lab.locator('.story-bg-layer')).toHaveCount(5);
  await expect(lab.locator('.story-panel-section[aria-hidden="false"] .story-title')).toHaveText('与我相遇');
  await expect(lab.locator('.story-panel-section[aria-hidden="false"]').getByText('Telegram 防丢主页').first()).toBeVisible();
  await expect(lab.locator('.story-hint')).toBeVisible();
  await expect(lab.locator('.story-panel-section[aria-hidden="false"]').getByRole('navigation', { name: '个人导航', exact: true })).toHaveCount(1);
  const navBefore = await lab.locator('.story-panel').boundingBox();
  const height = await lab.evaluate(element => element.getBoundingClientRect().height);
  expect(height).toBeGreaterThan(3000);

  const station = async (index: number) => {
    await page.evaluate(fraction => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * fraction), index / 4);
    await page.waitForTimeout(700);
  };

  await station(1);
  await expect(lab.locator('.story-panel-section[aria-hidden="false"] .story-title')).toHaveText('个人简介');
  await expect(lab.locator('.story-panel-section[aria-hidden="false"]').getByText('X 粉丝')).toBeVisible();
  await expect(lab.locator('.story-panel-section[aria-hidden="false"]').getByText('Telegram 防丢主页').first()).toBeVisible();
  await expect.poll(() => lab.locator('.story-bg-layer').nth(1).evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  const panelAfter = await lab.locator('.story-panel').boundingBox();
  expect(panelAfter?.x).toBeCloseTo(navBefore!.x, 0);
  expect(panelAfter?.y).toBeCloseTo(navBefore!.y, 0);

  await station(2);
  await expect(lab.locator('.story-panel-section[aria-hidden="false"] .story-title')).toHaveText('预告频道');
  await expect(lab.locator('.story-post')).not.toHaveCount(0);

  await station(3);
  await expect(lab.locator('.story-panel-section[aria-hidden="false"] .story-title')).toHaveText('会员有什么');
  await expect(lab.locator('.story-panel-section[aria-hidden="false"]').getByText('永久会员')).toBeVisible();
  await expect(lab.locator('.story-panel-section[aria-hidden="false"]').getByText('USDT', { exact: false }).first()).toBeVisible();

  await station(4);
  await expect(lab.locator('.story-panel-section[aria-hidden="false"] .story-title')).toHaveText('购买方式');
  await expect(lab.locator('.story-hint')).toBeHidden();
  await lab.getByRole('button', { name: '查看完整教程', exact: true }).click();
  const tutorial = page.getByRole('dialog', { name: '会员购买教程', exact: true });
  await expect(tutorial).toBeVisible();
  await expect(tutorial.getByText('一次性加入链接')).toBeVisible();
  await tutorial.getByRole('button', { name: '关闭会员购买教程', exact: true }).click();
  await expect(tutorial).not.toBeVisible();
});

test('Story Lab keeps the fixed rail and down hint on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const lab = await enterLab(page);
  await expect(lab.locator('.story-fixed')).toBeHidden();
  await expect(lab.locator('.story-mobile')).toBeVisible();
  await expect(lab.locator('.story-mobile-section')).toHaveCount(5);
  await expect(lab.locator('.story-mobile-hero-caption .story-title').first()).toHaveText('与我相遇');
  await expect(lab.locator('.story-mobile-hint').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(700);
  await expect(lab.locator('.story-mobile-hero-caption .story-title').last()).toHaveText('购买方式');
  await expect(lab.locator('.story-mobile-hint')).toHaveCount(4);
});

test('Story Lab respects reduced motion and the static toggle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lab = await enterLab(page);
  await expect(lab).toHaveAttribute('data-motion', 'off');
  await expect(lab.getByRole('button', { name: '系统减少动态', exact: true })).toBeDisabled();
  await expect(lab.locator('.story-panel-section[aria-hidden="false"] .story-title')).toHaveText('与我相遇');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(lab.getByRole('button', { name: '静态浏览', exact: true })).toBeEnabled();
  await lab.getByRole('button', { name: '静态浏览', exact: true }).click();
  await expect(lab).toHaveAttribute('data-motion', 'off');
  await expect(lab.getByRole('button', { name: '开启动效', exact: true })).toBeVisible();
});
