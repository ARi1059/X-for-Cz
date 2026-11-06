import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { Draft } from '../src/components/client-api.ts';
import { fixtureAccount } from './fixture.ts';

// Only the disposable browser-test service is used; no local user data is read.
const origin = 'http://localhost:3103';
let control: APIRequestContext;
let csrf = '';
let baseline: Draft;

async function replaceDraft(config: Draft['config']) {
  const currentResponse = await control.get('/api/admin/draft');
  expect(currentResponse.status()).toBe(200);
  const current = await currentResponse.json() as Draft;
  const saved = await control.put('/api/admin/draft', {
    data: { expectedRevision: current.revision, config }, headers: { 'X-CSRF-Token': csrf },
  });
  expect(saved.status()).toBe(200);
  return saved.json() as Promise<Draft>;
}

test.beforeAll(async ({ playwright }) => {
  control = await playwright.request.newContext({
    baseURL: origin, extraHTTPHeaders: { Origin: origin, 'User-Agent': 'motion-polish-fixture-control' },
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
  config.links.forEach(link => {
    link.visible = true;
    link.enabled = link.id === 'x_profile';
    link.url = link.id === 'x_profile' ? 'https://x.com/motion_polish_fixture' : '';
  });
  const saved = await replaceDraft(config);
  const publication = await control.post('/api/admin/publish', {
    data: { expectedRevision: saved.revision }, headers: { 'X-CSRF-Token': csrf },
  });
  expect(publication.status()).toBe(201);
});

test.afterAll(async () => {
  try { if (control && baseline) await replaceDraft(baseline.config); }
  finally { await control?.dispose(); }
});

async function enter(page: Page, portrait = false) {
  await page.goto(portrait ? '/?experience=light-gallery' : '/');
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const content = page.getByTestId(portrait ? 'light-gallery' : 'public-content');
  await expect(content).toBeVisible({ timeout: 15_000 });
  await expect(content).toHaveAttribute('data-motion', 'on', { timeout: 15_000 });
  await expect.poll(() => content.locator('img').evaluateAll((images, count) =>
    images.length === count && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0), portrait ? 2 : 6
  ), { timeout: 20_000 }).toBe(true);
  return content;
}

async function expectSelection(content: Locator, number: number) {
  await expect(content.locator('.gallery-controls')).toContainText(`${number} / 5`);
  await expect(content.locator('.photo[aria-current="true"]')).toHaveCount(1);
  await expect(content.locator('.photo').nth(number - 1)).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => content.locator('.gallery-strip').evaluate((strip, index) => {
    const photo = strip.querySelectorAll('.photo')[index];
    if (!photo) return false;
    const outer = strip.getBoundingClientRect(), inner = photo.getBoundingClientRect();
    return inner.left >= outer.left - 2 && inner.right <= outer.right + 2;
  }, number - 1), { timeout: 12_000, message: 'The selected photo must actually be inside the horizontal viewport.' }).toBe(true);
}

async function transform(element: Locator) {
  return element.evaluate(node => getComputedStyle(node).transform);
}

test('mobile keeps composed lighting still and images visible when motion is paused or reduced', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const content = await enter(page);
  await expect.poll(() => content.locator('.noir-link-shell').evaluateAll(items => items.every(item => getComputedStyle(item).opacity === '1'))).toBe(true);
  const wing = content.locator('.noir-light-wing-left');
  const initial = await transform(wing);
  await page.waitForTimeout(1000);
  expect(await transform(wing)).toBe(initial);
  await expect(content).toHaveAttribute('data-motion', 'on');
  expect(await content.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).decoding === 'async'))).toBe(true);
  await content.getByRole('button', { name: '暂停动效', exact: true }).click();
  await expect(content).toHaveAttribute('data-motion', 'off');
  await expect.poll(() => content.locator('.photo-art, .noir-link-shell').evaluateAll(items => items.every(item => getComputedStyle(item).opacity === '1'))).toBe(true);
  await content.getByRole('button', { name: '启用动效', exact: true }).click();
  await expect(content).toHaveAttribute('data-motion', 'on');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(content).toHaveAttribute('data-motion', 'off');
  await expect(content.getByRole('button', { name: '系统已减少动态效果' })).toBeDisabled();
  await expect.poll(() => content.locator('.photo-art, .noir-link-shell').evaluateAll(items => items.every(item => getComputedStyle(item).opacity === '1' && getComputedStyle(item).transform === 'none'))).toBe(true);
  await page.screenshot({ path: 'var/screenshots/motion-polish-home-390.png', fullPage: true });
});

test('photo controls keep rapid clicks, keyboard, native scroll and resized selection aligned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const content = await enter(page);
  const strip = content.locator('.gallery-strip');
  await strip.scrollIntoViewIfNeeded();
  await content.getByRole('button', { name: '下一张照片', exact: true }).evaluate(button => {
    // Several clicks in the same task exercise the selected-index ref rather than waiting for paint.
    for (let index = 0; index < 4; index++) (button as HTMLButtonElement).click();
  });
  await expectSelection(content, 5);
  await expect(content.locator('.noir-gallery-current')).toHaveText('05');
  await expect.poll(() => content.locator('.photo.selected .noir-photo-rule').evaluate(element => getComputedStyle(element).width)).toBe('24px');
  await content.getByRole('button', { name: '上一张照片', exact: true }).click();
  await expectSelection(content, 4);
  await expect(content.locator('.noir-gallery-current')).toHaveText('04');
  await strip.focus(); await page.keyboard.press('ArrowLeft');
  await expectSelection(content, 3);
  await page.keyboard.press('Home'); await expectSelection(content, 1);
  await page.keyboard.press('End'); await expectSelection(content, 5);
  await strip.evaluate(element => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    element.scrollTo({ left: 0, behavior: 'instant' });
  });
  await expectSelection(content, 1);
  await strip.evaluate(element => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    element.scrollTo({ left: element.scrollWidth, behavior: 'instant' });
  });
  await expectSelection(content, 5);
  await strip.focus(); await page.keyboard.press('ArrowLeft');
  await expectSelection(content, 4);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectSelection(content, 4);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectSelection(content, 4);
  // At tablet width two edge cards share a clamped scroll anchor. An explicit
  // choice must survive scrollend and its queued animation-frame callback.
  await page.setViewportSize({ width: 768, height: 1000 });
  await strip.focus(); await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expectSelection(content, 2);
  await page.waitForTimeout(300);
  await expectSelection(content, 2);
  await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft');
  await expectSelection(content, 4);
  await page.waitForTimeout(300);
  await expectSelection(content, 4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('portrait name finishes its greeting and replays only after explicitly enabling motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const content = await enter(page, true);
  const title = content.locator('.lg-identity h1');
  const motion = content.locator('.lg-motion');
  await expect(motion).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => title.evaluate(element => parseFloat(getComputedStyle(element).backgroundPositionX)), { timeout: 8000 }).toBe(32);
  const settled = await title.evaluate(element => getComputedStyle(element).backgroundPosition);
  await page.waitForTimeout(1000);
  expect(await title.evaluate(element => getComputedStyle(element).backgroundPosition)).toBe(settled);
  const entrance = await content.locator('.lg-link-shell').evaluateAll(elements => elements.map(element => ({
    opacity: getComputedStyle(element).opacity,
    transform: getComputedStyle(element).transform,
  })));
  expect(entrance).toHaveLength(5);
  entrance.forEach(row => { expect(row.opacity).toBe('1'); expect(row.transform).toBe('none'); });
  await motion.click(); await expect(motion).toHaveAttribute('aria-pressed', 'false');
  await expect(content).toHaveAttribute('data-motion', 'off');
  const paused = await title.evaluate(element => getComputedStyle(element).backgroundPosition);
  await page.waitForTimeout(200);
  expect(await title.evaluate(element => getComputedStyle(element).backgroundPosition)).toBe(paused);
  await motion.click(); await expect(motion).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => title.evaluate(element => parseFloat(getComputedStyle(element).backgroundPositionX)), { timeout: 1000 }).toBeGreaterThan(32);
  await expect.poll(() => title.evaluate(element => parseFloat(getComputedStyle(element).backgroundPositionX)), { timeout: 8000 }).toBe(32);
  await expect(content).toHaveAttribute('data-experience', 'portrait-navigation');
  await expect(content.locator('canvas, .lg-exhibition, .lg-selection')).toHaveCount(0);
  await page.screenshot({ path: 'var/screenshots/motion-polish-portrait-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'var/screenshots/motion-polish-portrait-390.png', fullPage: true });
});

for (const portrait of [false, true]) {
  test(`${portrait ? 'portrait' : 'home'} navigation has hover press release and keyboard feedback with static opt-out`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const content = await enter(page, portrait);
    const nav = content.getByRole('navigation', { name: '个人导航', exact: true });
    const link = nav.getByRole('link', { name: /X 主页/ });
    const disabled = nav.getByRole('button').first();
    await expect(disabled).toBeDisabled();
    await link.hover();
    await expect.poll(() => link.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBeCloseTo(-1, 2);
    await page.mouse.down();
    await expect.poll(() => link.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m11)).toBeCloseTo(.985, 3);
    // Release away from the link so this interaction test never opens an external destination.
    await page.mouse.move(2, 2); await page.mouse.up();
    await expect.poll(() => transform(link)).toBe('none');
    await disabled.hover();
    expect(await transform(disabled)).toBe('none');
    await page.mouse.down(); expect(await transform(disabled)).toBe('none');
    await page.mouse.move(2, 2); await page.mouse.up();
    await link.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(link).toBeFocused();
    expect(await link.evaluate(element => element.matches(':focus-visible'))).toBe(true);
    expect(await link.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }))).toEqual({ style: 'solid', width: '2px' });
    await content.getByRole('button', { name: portrait ? '静态浏览' : '暂停动效', exact: true }).click();
    await expect(content).toHaveAttribute('data-motion', 'off');
    await link.hover(); expect(await transform(link)).toBe('none');
    await page.mouse.down(); expect(await transform(link)).toBe('none');
    await page.mouse.move(2, 2); await page.mouse.up();
    expect(await transform(link)).toBe('none');
    await page.screenshot({ path: `var/screenshots/motion-polish-${portrait ? 'portrait' : 'home'}-1440.png`, fullPage: true });
  });
}
