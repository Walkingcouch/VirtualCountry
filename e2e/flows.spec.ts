import { expect, test, type Page } from '@playwright/test';

/**
 * Signed-in journeys, using the invented demo people. Needs the demo database and demo mode.
 * Run with: E2E_FULL=1 npm run test:e2e
 * Sign-up and first-time set-up need a confirmation email, so they are covered by the manual checklist in docs/OPERATIONS.md.
 */
test.skip(!process.env.E2E_FULL, 'Set E2E_FULL=1 to run the signed-in journeys against the demo database.');
test.describe.configure({ mode: 'serial' });

const stamp = Date.now().toString(36);
const storyTitle = `E2E story ${stamp}`;
const PASSPHRASE = 'country-demo';

async function signInAs(page: Page, name: 'Rose' | 'Tom' | 'Maya' | 'Daniel' | 'Sam' | 'Dr Lee') {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible({ timeout: 60_000 });
}
async function signOut(page: Page) {
  await page.goto('/me');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('record a story and share it with the whole community', async ({ page }) => {
  await signInAs(page, 'Maya');
  await page.goto('/record');
  await page.getByLabel('Title').fill(storyTitle);
  await page.getByLabel('Story').fill('An invented story written by the end-to-end test.');
  await page.getByRole('button', { name: /whole community/i }).first().click();
  await page.getByRole('button', { name: 'Lock and save' }).click();
  await expect(page).toHaveURL(/\/stories\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { level: 1, name: storyTitle })).toBeVisible();
  await expect(page.getByText('An invented story written by the end-to-end test.')).toBeVisible();
  await signOut(page);
});

test('another member can open it, and an administrator without content keys cannot', async ({ page }) => {
  await signInAs(page, 'Daniel');
  await page.goto('/stories');
  await expect(page.getByText(storyTitle)).toBeVisible({ timeout: 60_000 });
  await signOut(page);

  await signInAs(page, 'Sam');
  await page.goto('/stories');
  await expect(page.getByText(storyTitle)).toHaveCount(0);
  await signOut(page);
});

test('the holder pauses the story and everyone else loses access', async ({ page }) => {
  await signInAs(page, 'Maya');
  await page.goto('/stories');
  await page.getByText(storyTitle).click();
  await page.getByRole('button', { name: 'Pause for sorry business' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Paused' })).toBeVisible({ timeout: 60_000 });
  await signOut(page);

  await signInAs(page, 'Daniel');
  await page.goto('/stories');
  await expect(page.getByRole('heading', { name: /stories/i }).first()).toBeVisible();
  await expect(page.getByText(storyTitle)).toHaveCount(0);
  await signOut(page);
});

test('the holder lifts the pause, then deletes the story for good', async ({ page }) => {
  await signInAs(page, 'Maya');
  await page.goto('/stories');
  await page.getByText(storyTitle).click();
  await page.getByRole('button', { name: 'Lift the pause' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pause lifted' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Delete this item' }).click();
  await page.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(page).toHaveURL(/\/stories$/, { timeout: 60_000 });
  await expect(page.getByText(storyTitle)).toHaveCount(0);
  await signOut(page);
});

test('a member sends a message and another member reads it', async ({ page }) => {
  const text = `E2E hello ${stamp}`;
  await signInAs(page, 'Daniel');
  await page.goto('/messages');
  await page.getByRole('button', { name: /community|everyone|rangers/i }).first().click();
  await page.getByRole('textbox', { name: /message/i }).fill(text);
  await page.getByRole('button', { name: /^send$/i }).click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 60_000 });
  await signOut(page);

  await signInAs(page, 'Tom');
  await page.goto('/messages');
  await page.getByRole('button', { name: /community|everyone|rangers/i }).first().click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 60_000 });
  await signOut(page);
});

test('the partner administrator sees the bridge and nothing else from the community', async ({ page }) => {
  await signInAs(page, 'Dr Lee');
  await page.goto('/messages?tab=bridges');
  await expect(page.getByText(/Demo Country/).first()).toBeVisible({ timeout: 60_000 });
  await page.goto('/stories');
  await expect(page.getByText(/sorry business|river|country/i)).toHaveCount(0);
  await signOut(page);
});

test('a Cultural Authority sees the releases, community and legacy screens', async ({ page }) => {
  await signInAs(page, 'Rose');
  await page.goto('/releases');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: 'Governance log' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Chain intact/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  await page.goto('/legacy');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await signOut(page);
});

test('lock closes the private space and the passphrase opens it again', async ({ page }) => {
  await signInAs(page, 'Maya');
  await page.getByRole('button', { name: /lock/i }).first().click();
  await expect(page.getByText('Your private space is locked')).toBeVisible();
  await page.getByLabel('Passphrase').fill('wrong-passphrase-here');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('alert')).toContainText('did not work');
  await page.getByLabel('Passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /lock/i }).first().click();
  await page.getByRole('button', { name: /recovery card/i }).click();
  await expect(page.getByLabel('Recovery code')).toBeVisible();
  await expect(page.getByLabel('New passphrase')).toBeVisible();
});
