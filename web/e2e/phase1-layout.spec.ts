import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { Draft } from '../src/components/client-api.ts';
import { fixtureAccount } from './fixture.ts';

// This suite only changes the disposable E2E server and its fixture database.
const origin = 'http://localhost:3103';
let control: APIRequestContext;
let csrf = '';
let baseline: Draft;
let fixtureConfig: Draft['config'];

async function replaceDraft(config: Draft['config']) {
  const currentResponse = await control.get('/api/admin/draft');
  expect(currentResponse.status()).toBe(200);
  const current = await currentResponse.json() as Draft;
  const saved = await control.put('/api/admin/draft', {
    data: { expectedRevision: current.revision, config },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(saved.status()).toBe(200);
  return saved.json() as Promise<Draft>;
}

async function publishFixture(config: Draft['config']) {
  const saved = await replaceDraft(config);
  const published = await control.post('/api/admin/publish', {
    data: { expectedRevision: saved.revision },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(published.status()).toBe(201);
}

async function enterPortrait(page: Page) {
  await page.goto('/?experience=light-gallery');
  await expect(page.getByRole('heading', { name: '仅限成年人' })).toBeVisible();
  await page.getByRole('button', { name: '我已年满 18 岁', exact: true }).click();
  const portrait = page.getByTestId('light-gallery');
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.locator('img').evaluateAll(images =>
    images.length === 2 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
  ), { timeout: 20_000 }).toBe(true);
  return portrait;
}

async function expectReachable(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  expect(await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && element.contains(hit));
  }), 'The center of the control should remain uncovered.').toBe(true);
}

test.beforeAll(async ({ playwright }) => {
  control = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin, 'User-Agent': 'phase1-layout-fixture-control' },
  });
  const login = await control.post('/api/admin/login', { data: fixtureAccount });
  expect(login.status()).toBe(200);
  csrf = (await login.json()).csrfToken;
  const response = await control.get('/api/admin/draft');
  expect(response.status()).toBe(200);
  baseline = await response.json() as Draft;
  fixtureConfig = structuredClone(baseline.config);
  fixtureConfig.gallery.enabled = true;
  fixtureConfig.gallery.photos.forEach(photo => { photo.visible = true; });
  fixtureConfig.ageGate.exitUrl = 'https://www.wikipedia.org/';
  fixtureConfig.footer.contactEmail = 'fixture@qingtang.invalid';
  fixtureConfig.links.forEach(link => {
    link.visible = true;
    link.enabled = link.id === 'x_profile';
    link.url = link.enabled ? 'https://x.com/phase1_layout_fixture' : null;
    link.emphasized = link.enabled;
  });
  await publishFixture(fixtureConfig);
});

test.afterAll(async () => {
  try { if (control && baseline) await replaceDraft(baseline.config); }
  finally { await control?.dispose(); }
});

test('phase one keeps readable navigation and separate 44px footer targets across eight viewports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const portrait = await enterPortrait(page);
  for (const [width, height] of [[1440, 1000], [1854, 1018], [850, 1000], [768, 1000], [390, 844], [320, 844], [375, 568], [320, 568]] as const) {
    await test.step(`${width} × ${height}`, async () => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const entries = portrait.locator('.lg-platform');
      await expect(entries).toHaveCount(5);
      for (const entry of await entries.all()) {
        await expectReachable(entry);
        const geometry = await entry.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { right: rect.right, height: rect.height, fontSize: parseFloat(getComputedStyle(element).fontSize) };
        });
        expect(geometry.right).toBeLessThanOrEqual(width / 2 + 1);
        expect(geometry.height).toBeGreaterThanOrEqual(44);
        if (width <= 549) expect(geometry.fontSize).toBeGreaterThanOrEqual(13);
      }
      if (width <= 549) {
        expect(await portrait.locator('.lg-identity h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(26);
        await expect(portrait.locator('.lg-eyebrow')).toBeHidden();
        const statusSizes = await portrait.locator('.lg-link-end small').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
        expect(statusSizes).toHaveLength(4);
        statusSizes.forEach(size => expect(size).toBeGreaterThanOrEqual(10));
      }
      const footerControls = portrait.locator('.lg-footer a, .lg-footer button');
      expect(await footerControls.count()).toBeGreaterThanOrEqual(3);
      for (const target of await footerControls.all()) await expectReachable(target);
      const rects = await footerControls.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      }));
      for (const [index, rect] of rects.entries()) {
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
        for (const other of rects.slice(index + 1)) {
          const overlapWidth = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
          const overlapHeight = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
          expect(overlapWidth > .5 && overlapHeight > .5, 'Footer hit areas must not overlap.').toBe(false);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      // Scrolling on short phones must preserve the background's natural proportions.
      const imageRatio = await portrait.locator('.lg-backdrop-photo img').evaluate(element => {
        const image = element as HTMLImageElement, rect = image.getBoundingClientRect();
        return Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight);
      });
      expect(imageRatio).toBeLessThan(.002);
    });
  }
});

test('mobile footer returns keyboard focus and an unavailable emphasized entry stays visually inactive', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let portrait = await enterPortrait(page);
  const trigger = portrait.getByRole('button', { name: '站点说明', exact: true });
  await expectReachable(trigger);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '站点说明', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '关闭站点说明', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  const available = portrait.locator('.lg-platform[data-state="available"]');
  await expect(available).toHaveCount(1);
  await expect(available).toHaveClass(/is-emphasized/);
  const activeBackground = await available.evaluate(element => getComputedStyle(element).backgroundImage);
  // The contract permits one emphasis at a time; move it to the disabled third entry.
  const config = structuredClone(fixtureConfig);
  const thirdEntry = [...config.links].sort((a, b) => a.position - b.position)[2]!;
  expect(thirdEntry.enabled).toBe(false);
  config.links.forEach(link => { link.emphasized = link.id === thirdEntry.id; });
  await publishFixture(config);
  await page.context().clearCookies();
  portrait = await enterPortrait(page);
  const inactive = portrait.locator('.lg-platform').nth(2);
  await expect(inactive).toBeDisabled();
  await expect(inactive).toHaveAttribute('data-state', 'unavailable');
  await expect(inactive).not.toHaveClass(/is-emphasized/);
  expect(await inactive.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(activeBackground);
  await expectReachable(inactive);
});
