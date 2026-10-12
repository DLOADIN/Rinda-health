import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Get help now' })).toBeVisible();
  });

  test('renders at 360 px with no horizontal scroll', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('participant tap targets are at least 44 px (NFR-08)', async ({ page }) => {
    for (const name of ['Get help now', 'Exit to a neutral screen']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('Get help now opens the referral list with call links (FR-12)', async ({ page }) => {
    await page.getByRole('button', { name: 'Get help now' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('a[href="tel:112"]')).toBeVisible();
    await expect(dialog.locator('a[href="tel:114"]')).toBeVisible();
  });

  test('Exit replaces history so Back shows no earlier content (FR-42)', async ({ page }) => {
    await page.getByRole('button', { name: 'Exit to a neutral screen' }).click();
    await expect(page).toHaveURL(/\/exit$/);
    await page.goBack();
    await expect(page).not.toHaveURL('http://localhost:4173/');
  });

  test('pressing Escape twice exits (FR-42)', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/exit$/);
  });

  test('switching language sets <html lang> (FR-21)', async ({ page }) => {
    await page.getByRole('radio', { name: 'Ikinyarwanda' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'rw');
  });

  test('has no axe violations (WCAG 2.2 AA)', async ({ page }) => {
    test.setTimeout(90_000); // the landing page is long, so the full scan takes a while
    // Scan the settled page: sections fade in on scroll, and half-faded text would read as low contrast.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Get help now' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test('makes first-party requests only (NFR-02)', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http'))
        external.push(url.host);
    });
    await page.reload();
    await page.getByRole('button', { name: 'Get help now' }).click();
    expect(external).toEqual([]);
  });
});

test('the app shell and Get help now work offline after first load (NFR-04, FR-12)', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit cannot route offline navigations through the service worker',
  );
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Get help now' }).click();
  await expect(page.getByRole('dialog').locator('a[href="tel:112"]')).toBeVisible();
  await context.setOffline(false);
});

test('Escape closes Get help now without exiting (FR-42 with FR-12)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get help now' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/\/exit$/);
});
