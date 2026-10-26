import { randomUUID } from 'node:crypto';
import { test, expect, authenticateForUi, openGroupThroughUi, balanceSnapshot } from './helpers/fixtures.js';
import { registerUser, seedExpense } from './helpers/api.js';
import process from 'node:process';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5174';

async function makeUserPage(browser, user) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await authenticateForUi(page, user);
  return { context, page };
}

async function seedTwoPersonDebt(api, group, owner, debtor, amountPaise = 10000) {
  return seedExpense(api, owner, group.id, {
    description: `Settlement debt ${randomUUID().slice(0, 6)}`,
    amountPaise,
    participantIds: [owner.user.id, debtor.user.id],
  });
}

async function openSettleTab(page, group) {
  await openGroupThroughUi(page, group);
  await page.getByRole('button', { name: /Settle Up/ }).click();
  await expect(page.getByRole('heading', { name: 'Recorded Settlements' })).toBeVisible();
}

async function recordSettlementThroughUi(page, group, receiver, amountRupees) {
  await openSettleTab(page, group);
  await page.getByRole('button', { name: 'Record Settlement' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Record Settlement Payment' })).toBeVisible();
  await dialog.locator('select').nth(1).selectOption(String(receiver.user.id));
  await dialog.getByPlaceholder('0.00', { exact: true }).fill(String(amountRupees));
  await dialog.getByRole('button', { name: 'Record Payment' }).click();
  return dialog;
}

function settlementRow(page, payerName, receiverName) {
  return page.getByRole('row').filter({ hasText: payerName }).filter({ hasText: receiverName });
}

async function requestLeaveThroughUi(page) {
  await page.getByRole('button', { name: /Members/ }).click();
  await page.getByRole('button', { name: 'Leave Group' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toContainText(/leave this group/i);
  await confirmation.getByRole('button', { name: 'Leave Group' }).click();
}

test.describe('settlement UI with separate user contexts', () => {
  test('payer creates a pending settlement visible to both users and can mark it paid, but cannot confirm it', async ({ browser, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const payer = await makeUserPage(browser, users[1]);
    const receiver = await makeUserPage(browser, users[0]);
    try {
      const before = await balanceSnapshot(api, group.id, users[0]);
      const beforeByUser = new Map(before.map((balance) => [Number(balance.userId), Number(balance.netBalancePaise)]));
      const dialog = await recordSettlementThroughUi(payer.page, group, users[0], '20.00');
      await expect(payer.page.locator('.toast')).toContainText('recorded as pending');
      const payerRow = settlementRow(payer.page, users[1].user.name, users[0].user.name);
      await expect(payerRow.getByText('pending', { exact: true })).toBeVisible();
      await expect(payerRow.getByRole('button', { name: 'Mark Paid' })).toBeVisible();
      await expect(payerRow.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
      await dialog.waitFor({ state: 'detached' });

      await openSettleTab(receiver.page, group);
      const receiverRow = settlementRow(receiver.page, users[1].user.name, users[0].user.name);
      await expect(receiverRow.getByText('pending', { exact: true })).toBeVisible();
      await expect(receiverRow.getByRole('button', { name: 'Confirm' })).toBeVisible();
      await expect(receiverRow.getByRole('button', { name: 'Reject' })).toBeVisible();
      const stillPending = await balanceSnapshot(api, group.id, users[0]);
      expect(stillPending.map((balance) => Number(balance.netBalancePaise))).toEqual(
        before.map((balance) => Number(balance.netBalancePaise))
      );

      await payerRow.getByRole('button', { name: 'Mark Paid' }).click();
      const markDialog = payer.page.getByRole('dialog');
      await expect(markDialog.getByRole('heading', { name: 'Mark Settlement as Paid' })).toBeVisible();
      await markDialog.getByRole('button', { name: 'Mark as Paid' }).click();
      await expect(payer.page.locator('.toast')).toContainText('marked as paid');
      await expect(settlementRow(payer.page, users[1].user.name, users[0].user.name).getByText('marked paid', { exact: true })).toBeVisible();
      await expect(settlementRow(payer.page, users[1].user.name, users[0].user.name).getByRole('button', { name: 'Confirm' })).toHaveCount(0);
      await openSettleTab(receiver.page, group);
      await expect(settlementRow(receiver.page, users[1].user.name, users[0].user.name).getByRole('button', { name: 'Confirm' })).toBeVisible();
      const markedPaidBalances = await balanceSnapshot(api, group.id, users[0]);
      expect(markedPaidBalances.map((balance) => Number(balance.netBalancePaise))).toEqual(
        [...beforeByUser.values()]
      );
    } finally {
      await Promise.all([payer.context.close(), receiver.context.close()]);
    }
  });

  test('receiver confirmation updates balances only after the visible status becomes confirmed', async ({ browser, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const payer = await makeUserPage(browser, users[1]);
    const receiver = await makeUserPage(browser, users[0]);
    try {
      const before = await balanceSnapshot(api, group.id, users[0]);
      await recordSettlementThroughUi(payer.page, group, users[0], '20.00');
      await expect(payer.page.locator('.toast')).toContainText('recorded as pending');
      const pendingBalances = await balanceSnapshot(api, group.id, users[0]);
      expect(pendingBalances.map((balance) => Number(balance.netBalancePaise))).toEqual(
        before.map((balance) => Number(balance.netBalancePaise))
      );

      await openSettleTab(receiver.page, group);
      const row = settlementRow(receiver.page, users[1].user.name, users[0].user.name);
      await row.getByRole('button', { name: 'Confirm' }).click();
      await expect(receiver.page.locator('.toast')).toContainText('Payment confirmed');
      await expect(settlementRow(receiver.page, users[1].user.name, users[0].user.name).getByText('confirmed', { exact: true })).toBeVisible();
      const after = await balanceSnapshot(api, group.id, users[0]);
      const beforeById = new Map(before.map((balance) => [Number(balance.userId), Number(balance.netBalancePaise)]));
      expect(after.find((balance) => Number(balance.userId) === users[1].user.id).netBalancePaise)
        .toBe(beforeById.get(users[1].user.id) + 2000);
      expect(after.find((balance) => Number(balance.userId) === users[0].user.id).netBalancePaise)
        .toBe(beforeById.get(users[0].user.id) - 2000);
    } finally {
      await Promise.all([payer.context.close(), receiver.context.close()]);
    }
  });

  test('receiver rejection is visible and leaves balances unchanged', async ({ browser, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const payer = await makeUserPage(browser, users[1]);
    const receiver = await makeUserPage(browser, users[0]);
    try {
      const before = await balanceSnapshot(api, group.id, users[0]);
      await recordSettlementThroughUi(payer.page, group, users[0], '20.00');
      await openSettleTab(receiver.page, group);
      const row = settlementRow(receiver.page, users[1].user.name, users[0].user.name);
      await row.getByRole('button', { name: 'Reject' }).click();
      const confirmation = receiver.page.getByRole('dialog');
      await expect(confirmation.getByRole('heading', { name: 'Reject Settlement Payment' })).toBeVisible();
      await confirmation.getByRole('button', { name: 'Reject Payment' }).click();
      await expect(receiver.page.locator('.toast')).toContainText('Settlement rejected');
      await expect(settlementRow(receiver.page, users[1].user.name, users[0].user.name).getByText('rejected', { exact: true })).toBeVisible();
      const after = await balanceSnapshot(api, group.id, users[0]);
      expect(after.map((balance) => Number(balance.netBalancePaise))).toEqual(
        before.map((balance) => Number(balance.netBalancePaise))
      );
    } finally {
      await Promise.all([payer.context.close(), receiver.context.close()]);
    }
  });

  test('over-limit and no-debt settlement attempts show the maximum or no-debt message', async ({ browser, users, group, api }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const debtor = await makeUserPage(browser, users[1]);
    const creditor = await makeUserPage(browser, users[0]);
    try {
      await openSettleTab(debtor.page, group);
      await debtor.page.getByRole('button', { name: 'Record Settlement' }).click();
      let dialog = debtor.page.getByRole('dialog');
      await dialog.locator('select').nth(1).selectOption(String(users[0].user.id));
      await dialog.getByPlaceholder('0.00', { exact: true }).fill('51.00');
      await dialog.getByRole('button', { name: 'Record Payment' }).click();
      await expect(dialog.locator('.alert.alert-danger')).toContainText(/Maximum allowed: 5000/);
      await expect(dialog.locator('.alert.alert-danger')).toContainText(/outstanding debt of 5000/);

      await openSettleTab(creditor.page, group);
      await creditor.page.getByRole('button', { name: 'Record Settlement' }).click();
      dialog = creditor.page.getByRole('dialog');
      await dialog.locator('select').nth(1).selectOption(String(users[1].user.id));
      await dialog.getByPlaceholder('0.00', { exact: true }).fill('1.00');
      await dialog.getByRole('button', { name: 'Record Payment' }).click();
      await expect(dialog.locator('.alert.alert-danger')).toContainText('you do not owe this member anything');
    } finally {
      await Promise.all([debtor.context.close(), creditor.context.close()]);
      await balanceSnapshot(api, group.id, users[0]);
    }
  });

  test('rapid receiver double-confirm leaves one confirmed payment and clear UI feedback', async ({ browser, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const payer = await makeUserPage(browser, users[1]);
    const receiver = await makeUserPage(browser, users[0]);
    try {
      await recordSettlementThroughUi(payer.page, group, users[0], '20.00');
      await openSettleTab(receiver.page, group);
      const row = settlementRow(receiver.page, users[1].user.name, users[0].user.name);
      const confirm = row.getByRole('button', { name: 'Confirm' });
      await confirm.dblclick({ delay: 5 });
      await expect(settlementRow(receiver.page, users[1].user.name, users[0].user.name).getByText('confirmed', { exact: true })).toBeVisible();
      await expect(receiver.page.locator('.toast')).toContainText(/confirmed|already|in progress/i);
      await balanceSnapshot(api, group.id, users[0]);
    } finally {
      await Promise.all([payer.context.close(), receiver.context.close()]);
    }
  });

  test('payer can see the recipient UPI details, while an unrelated user cannot open the group', async ({ browser, users, api, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const outsider = await registerUser(api, { name: 'Unrelated UPI User' });
    const payer = await makeUserPage(browser, users[1]);
    const unrelated = await makeUserPage(browser, outsider);
    try {
      await recordSettlementThroughUi(payer.page, group, users[0], '10.00');
      await openSettleTab(payer.page, group);
      const row = settlementRow(payer.page, users[1].user.name, users[0].user.name);
      await row.getByTitle('Show UPI QR Code').click();
      const upiDialog = payer.page.getByRole('dialog');
      await expect(upiDialog.getByRole('heading', { name: 'Pay with UPI' })).toBeVisible();
      await expect(upiDialog).toContainText(users[0].user.upi_id);
      await expect(upiDialog).toContainText(users[0].user.name);

      await unrelated.page.goto(`/groups/${group.id}`);
      await expect(unrelated.page.getByRole('heading', { name: 'Group not found or access denied' })).toBeVisible();
      await expect(unrelated.page.getByText(users[0].user.upi_id, { exact: true })).toHaveCount(0);
    } finally {
      await Promise.all([payer.context.close(), unrelated.context.close()]);
      await balanceSnapshot(api, group.id, users[0]);
    }
  });
});

test.describe('leaving groups and ownership', () => {
  test('leaving with a non-zero balance shows the amount in paise', async ({ page, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    await authenticateForUi(page, users[1]);
    await openGroupThroughUi(page, group);
    await requestLeaveThroughUi(page);
    await expect(page.locator('.toast')).toContainText('Cannot leave group: your net balance is -5000 paise. Settle up first.');
    await balanceSnapshot(api, group.id, users[0]);
  });

  test('leaving with a pending settlement is blocked with the pending count', async ({ browser, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const payer = await makeUserPage(browser, users[1]);
    try {
      await recordSettlementThroughUi(payer.page, group, users[0], '10.00');
      await requestLeaveThroughUi(payer.page);
      await expect(payer.page.locator('.toast')).toContainText('you have 1 pending settlement(s)');
      await balanceSnapshot(api, group.id, users[0]);
    } finally {
      await payer.context.close();
    }
  });

  test('settle the full debt in the UI, leave successfully, and lose access by direct URL', async ({ browser, api, users, group }) => {
    await seedTwoPersonDebt(api, group, users[0], users[1]);
    const payer = await makeUserPage(browser, users[1]);
    const receiver = await makeUserPage(browser, users[0]);
    try {
      await recordSettlementThroughUi(payer.page, group, users[0], '50.00');
      await openSettleTab(receiver.page, group);
      const receiverRow = settlementRow(receiver.page, users[1].user.name, users[0].user.name);
      await receiverRow.getByRole('button', { name: 'Confirm' }).click();
      await expect(receiver.page.locator('.toast')).toContainText('Payment confirmed');
      await expect(settlementRow(receiver.page, users[1].user.name, users[0].user.name).getByText('confirmed', { exact: true })).toBeVisible();
      const settled = await balanceSnapshot(api, group.id, users[0]);
      expect(settled.find((balance) => Number(balance.userId) === users[1].user.id).netBalancePaise).toBe(0);

      await openGroupThroughUi(payer.page, group);
      await requestLeaveThroughUi(payer.page);
      await expect(payer.page).toHaveURL(/\/dashboard\/?$/);
      await expect(payer.page.getByText(group.name, { exact: true })).toHaveCount(0);
      await payer.page.goto(`/groups/${group.id}`);
      await expect(payer.page.getByRole('heading', { name: 'Group not found or access denied' })).toBeVisible();
      await balanceSnapshot(api, group.id, users[0]);
    } finally {
      await Promise.all([payer.context.close(), receiver.context.close()]);
    }
  });

  test('owner leaves and the earliest remaining member sees ownership in the UI', async ({ browser, api, users, group }) => {
    const owner = await makeUserPage(browser, users[0]);
    const nextMember = await makeUserPage(browser, users[1]);
    try {
      await openGroupThroughUi(owner.page, group);
      await requestLeaveThroughUi(owner.page);
      await expect(owner.page).toHaveURL(/\/dashboard\/?$/);
      await expect(owner.page.getByText(group.name, { exact: true })).toHaveCount(0);

      await openGroupThroughUi(nextMember.page, group);
      await nextMember.page.getByRole('button', { name: /Members/ }).click();
      const memberRow = nextMember.page.getByText(users[1].user.name, { exact: true }).locator('..').locator('..');
      await expect(memberRow).toContainText('Creator');
      await balanceSnapshot(api, group.id, users[1]);
    } finally {
      await Promise.all([owner.context.close(), nextMember.context.close()]);
    }
  });
});

test('profile name and UPI edits persist after reload and invalid UPI is explained', async ({ page, api }) => {
  const user = await registerUser(api, { name: 'Profile Browser User' });
  await authenticateForUi(page, user);
  await page.getByRole('link', { name: user.user.name }).click();
  await expect(page.getByRole('heading', { name: 'Account Settings & Profile' })).toBeVisible();
  const profileInputs = page.locator('form').first().locator('input');
  await profileInputs.nth(0).fill('Updated Browser Profile');
  await profileInputs.nth(2).fill('updatedprofile@okaxis');
  await page.getByRole('button', { name: 'Save Profile Changes' }).click();
  await expect(page.locator('.toast')).toContainText('Profile updated successfully');
  await page.reload();
  await expect(profileInputs.nth(0)).toHaveValue('Updated Browser Profile');
  await expect(profileInputs.nth(2)).toHaveValue('updatedprofile@okaxis');

  await profileInputs.nth(2).fill('not-a-valid-upi');
  await page.getByRole('button', { name: 'Save Profile Changes' }).click();
  await expect(page.locator('.alert.alert-danger')).toContainText(/invalid.*upi|upi.*format/i);
});
