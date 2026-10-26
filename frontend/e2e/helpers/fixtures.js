import { test as base, expect } from '@playwright/test';
import { createApiContext, registerUser, createGroup, addMember } from './api.js';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const backendRequire = createRequire(new URL('../../../backend/package.json', import.meta.url));
const jwt = backendRequire('jsonwebtoken');

export const test = base.extend({
  api: [async ({}, use) => {
    const api = await createApiContext();
    await use(api);
    await api.dispose();
  }, { scope: 'worker' }],

  users: [async ({ api }, use) => {
    const users = await Promise.all([
      registerUser(api, { name: 'E2E Owner' }),
      registerUser(api, { name: 'E2E Member One' }),
      registerUser(api, { name: 'E2E Member Two' }),
    ]);
    await use(users);
  }, { scope: 'worker' }],

  group: async ({ api, users }, use) => {
    const group = await createGroup(api, users[0], { name: `UI Flow ${Date.now()}-${Math.random().toString(16).slice(2, 7)}` });
    await addMember(api, users[0], group.id, users[1].email);
    await addMember(api, users[0], group.id, users[2].email);
    try {
      await use({ ...group, users });
    } finally {
      await assertSomeActiveUserBalancesSumToZero(api, group.id, users);
    }
  },
});

export { expect };

export async function authenticateForUi(page, user) {
  await page.addInitScript((token) => {
    window.localStorage.setItem('settleup_token', token);
  }, user.token);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

export async function loginThroughUi(page, user) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

export function createExpiredToken(userId) {
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    const envText = readFileSync(new URL('../../../backend/.env', import.meta.url), 'utf8');
    const line = envText.split(/\r?\n/).find((entry) => entry.startsWith('JWT_SECRET='));
    secret = line?.slice('JWT_SECRET='.length).trim().replace(/^['"]|['"]$/g, '');
  }
  if (!secret || secret.length < 32) {
    throw new Error('E2E expired-token setup requires JWT_SECRET from backend/.env');
  }
  return jwt.sign({ userId }, secret, { expiresIn: -60 });
}

export async function openGroupThroughUi(page, group) {
  await page.goto('/dashboard');
  await expect(page.getByText(group.name, { exact: true }).first()).toBeVisible();
  await page.getByText(group.name, { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
  await expect(page.getByRole('button', { name: /Expenses/ })).toBeVisible();
}

export async function openExpenseModal(page) {
  await page.getByRole('button', { name: /Add Expense/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Add New Expense' })).toBeVisible();
  return dialog;
}

export async function fillExpenseBasics(dialog, description, amountRupees) {
  await dialog.getByPlaceholder('e.g. Swiggy Dinner, Groceries, WiFi').fill(description);
  await dialog.getByPlaceholder('0.00', { exact: true }).fill(String(amountRupees));
}

export function expenseRow(page, description) {
  return page.getByRole('row').filter({ hasText: description });
}

export async function balanceSnapshot(api, groupId, user) {
  const response = await api.get(`groups/${groupId}/balances`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  expect(response.status(), 'GET /balances should be available to an active member').toBe(200);
  const body = await response.json();
  const sumPaise = body.balances.reduce((sum, balance) => sum + Number(balance.netBalancePaise), 0);
  expect(sumPaise, 'all member balances must sum to zero paise').toBe(0);
  return body.balances;
}

async function assertSomeActiveUserBalancesSumToZero(api, groupId, users) {
  for (const user of users) {
    const response = await api.get(`groups/${groupId}/balances`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (response.status() === 403) continue;
    expect(response.status(), 'an active test user must still be able to read group balances').toBe(200);
    const body = await response.json();
    expect(
      body.balances.reduce((sum, balance) => sum + Number(balance.netBalancePaise), 0),
      'after each UI flow, all group balances must still sum to zero paise'
    ).toBe(0);
    return;
  }
  throw new Error('No active test member remained to check /balances');
}
