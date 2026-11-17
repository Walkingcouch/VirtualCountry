import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const POLICY_PAGES = [
  { path: '/privacy', heading: 'PRIVACY NOTICE' },
  { path: '/terms', heading: 'TERMS OF USE' },
  { path: '/icip', heading: 'ICIP STATEMENT' },
  { path: '/contact', heading: 'CONTACT' },
];

test('a visitor who is not signed in is sent to sign in', async ({ page }) => {
  await page.goto('/stories');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /virtual country/i })).toBeVisible();
});

test('sign-in form is labelled and catches mismatched passwords before sending anything', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /new here/i }).click();
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Password', { exact: true }).fill('first-password-1');
  await page.getByLabel('Confirm password').fill('second-password-2');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'do not match' })).toBeVisible();
});

for (const p of POLICY_PAGES) {
  test(`${p.path} opens without signing in and is marked as a draft`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Draft for legal review');
  });
}

for (const path of ['/login', ...POLICY_PAGES.map((p) => p.path)]) {
  test(`${path} has no accessibility violations (WCAG 2.2 AA rules)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test(`${path} does not scroll sideways`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('security headers are set and no outside map service is allowed', async ({ request }) => {
  const res = await request.get('/login');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/mapbox/i);
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['strict-transport-security']).toContain('max-age');
});

test('an unknown address never leaves a visitor stuck', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page).toHaveURL(/\/login$/);
});

test('keyboard users can reach the sign-in form in order', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});
