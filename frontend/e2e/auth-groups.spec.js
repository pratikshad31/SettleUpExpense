import { randomUUID } from 'node:crypto';
import { test, expect, authenticateForUi, createExpiredToken, openGroupThroughUi } from './helpers/fixtures.js';
import { registerUser, seedExpense } from './helpers/api.js';
import { balanceSnapshot } from './helpers/fixtures.js';

test.describe('authentication through the browser', () => {
  test('registers a valid user, logs out, and rejects a duplicate email with a clear message', async ({ page}) => {
    const email = `ui-signup-${randomUUID()}@example.test`;
    await page.goto('/signup');
    await page.locator('#name').fill('Browser Signup User');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('E2eTestPass1!');
    await page.locator('#confirmPassword').fill('E2eTestPass1!');
    await page.getByRole('button', { name: /Get Started/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByText('Browser Signup User', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('settleup_token'))).toBeNull();

    await page.goto('/signup');
    await page.locator('#name').fill('Duplicate Browser User');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill('E2eTestPass1!');
    await page.locator('#confirmPassword').fill('E2eTestPass1!');
    await page.getByRole('button', { name: /Get Started/ }).click();
    await expect(page.locator('.alert.alert-danger')).toContainText('already exists');
  });

  test('shows validation for empty fields, invalid email, and weak password', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /Get Started/ }).click();
    await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText(/Email address.*valid|Enter a valid email/i).first()).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();

    await page.locator('#name').fill('Weak Password User');
    await page.locator('#email').fill('not-an-email');
    await page.locator('#password').fill('weak');
    await page.locator('#confirmPassword').fill('weak');
    await page.getByRole('button', { name: /Get Started/ }).click();
    await expect(page.getByText('Please enter a valid email address', { exact: true })).toBeVisible();
    await expect(page.getByText('Password must satisfy all security rules below')).toBeVisible();
  });

  test('keeps wrong-password and unknown-email login errors identical; refresh persists and logout protects routes', async ({ page, api }) => {
    const user = await registerUser(api, { name: 'Login Flow User' });
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByText('Login Flow User', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Login Flow User', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('settleup_token'))).toBeNull();
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Email Address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('WrongPass1!');
    await page.getByRole('button', { name: 'Sign In' }).click();
    const error = page.locator('.alert.alert-danger');
    await expect(error).toBeVisible();
    const wrongPasswordMessage = (await error.innerText()).trim();

    await page.getByLabel('Email Address').fill(`missing-${randomUUID()}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill('WrongPass1!');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(error).toBeVisible();
    expect((await error.innerText()).trim()).toBe(wrongPasswordMessage);
    expect(wrongPasswordMessage).toMatch(/invalid email or password/i);
  });

  for (const tokenType of ['expired', 'tampered']) {
    test(`${tokenType} token in storage redirects a protected route to login`, async ({ page, users }) => {
      const originalToken = users[0].token;
      const token = tokenType === 'expired'
        ? createExpiredToken(users[0].user.id)
        : (() => {
          const parts = originalToken.split('.');
          parts[2] = `${parts[2].slice(0, -1)}${parts[2].endsWith('a') ? 'b' : 'a'}`;
          return parts.join('.');
        })();
      await page.addInitScript((storedToken) => localStorage.setItem('settleup_token', storedToken), token);
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Welcome to SettleUp' })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('settleup_token'))).toBeNull();
    });
  }
});

test.describe('group and member flows', () => {
  test('creates a group in the UI, lists it, and opens its details', async ({ page, users, api }) => {
    await authenticateForUi(page, users[0]);
    const groupName = `UI Created ${randomUUID().slice(0, 8)}`;
    await page.getByRole('button', { name: 'Create Group' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type="text"]').fill(groupName);
    await dialog.getByPlaceholder('What is this group for?').fill('Created by real browser actions');
    await dialog.getByRole('button', { name: 'Create Group' }).click();
    await expect(page).toHaveURL(/\/groups\/\d+$/);
    await expect(page.getByText(groupName, { exact: true })).toBeVisible();
    const groupId = Number(page.url().split('/').at(-1));
    await balanceSnapshot(api, groupId, users[0]);

    await page.getByRole('link', { name: 'Groups' }).click();
    await expect(page.getByText(groupName, { exact: true })).toBeVisible();
    await page.getByText(groupName, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  });

  test('empty and overlong group names give visible feedback without exposing database details', async ({ page, users }) => {
    await authenticateForUi(page, users[0]);
    await page.getByRole('button', { name: 'Create Group' }).first().click();
    let dialog = page.getByRole('dialog');
    const nameInput = dialog.locator('input[type="text"]');
    await dialog.getByRole('button', { name: 'Create Group' }).click();
    expect(await nameInput.evaluate((input) => input.validationMessage)).not.toBe('');
    await expect(dialog).toBeVisible();

    await nameInput.fill('L'.repeat(151));
    await dialog.getByRole('button', { name: 'Create Group' }).click();
    const message = dialog.locator('.alert.alert-danger');
    await expect(message).toBeVisible();
    await expect(message).not.toContainText(/postgres|sql|stack|constraint/i);
  });

  test('adds an existing member and shows clear errors for unknown and duplicate members', async ({ page, api, users, group }) => {
    const candidate = await registerUser(api, { name: 'Invited Browser Member' });
    await authenticateForUi(page, users[0]);
    await openGroupThroughUi(page, group);
    await page.getByRole('button', { name: /Members/ }).click();

    const emailInput = page.getByPlaceholder('friend@example.com');
    await emailInput.fill(candidate.email);
    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.locator('.toast')).toContainText('added to the group successfully');
    await expect(page.getByText('Invited Browser Member', { exact: true })).toBeVisible();

    await emailInput.fill('unknown-person@example.test');
    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.locator('.toast')).toContainText('not registered');

    await emailInput.fill(candidate.email);
    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.locator('.toast')).toContainText('already an active member');

    await emailInput.fill(users[1].email);
    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.locator('.toast')).toContainText('already an active member');
  });

  test('group details show members, seeded expenses, and balances', async ({ page, api, users, group }) => {
    const description = `Details seed ${randomUUID().slice(0, 8)}`;
    await seedExpense(api, users[0], group.id, {
      description,
      amountPaise: 10000,
      participantIds: users.map((user) => user.user.id),
    });
    await authenticateForUi(page, users[0]);
    await openGroupThroughUi(page, group);
    await expect(page.getByRole('button', { name: /Members/ })).toContainText('3');
    await expect(page.getByRole('row').filter({ hasText: description })).toBeVisible();
    for (const user of users) await expect(page.getByText(user.user.name, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Balances' }).click();
    await expect(page.getByText('Group Net Balances')).toBeVisible();
    const balances = await balanceSnapshot(api, group.id, users[0]);
    expect(balances).toHaveLength(3);
  });

  test('member list does not reveal an unrelated user; user-search UI is documented as absent', async ({ page, api, users, group }) => {
    const outsider = await registerUser(api, { name: 'Unrelated Search Outsider' });
    await authenticateForUi(page, users[0]);
    await openGroupThroughUi(page, group);
    await page.getByRole('button', { name: /Members/ }).click();
    await expect(page.getByText(users[1].user.name, { exact: true })).toBeVisible();
    await expect(page.getByText(outsider.user.name, { exact: true })).toHaveCount(0);
    await expect(page.getByPlaceholder(/search users/i)).toHaveCount(0);
  });

  test.skip('user search returns only users who share an active group', async () => {
    // The React app currently has no user-search control; Add Member accepts an exact email.
    // Keep this requirement visible until a real search UI exists to exercise it end to end.
  });
});
