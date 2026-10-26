import { randomUUID } from 'node:crypto';
import { test, expect, authenticateForUi, openGroupThroughUi, openExpenseModal, fillExpenseBasics, expenseRow, balanceSnapshot } from './helpers/fixtures.js';
import { seedExpense } from './helpers/api.js';

async function prepareGroupPage(page, group, owner) {
  await authenticateForUi(page, owner);
  await openGroupThroughUi(page, group);
}

async function saveExpense(dialog, description, amount, buttonName = 'Create Expense') {
  await fillExpenseBasics(dialog, description, amount);
  await dialog.getByRole('button', { name: buttonName }).click();
}

async function selectSplitAmounts(dialog, splitType, values) {
  await dialog.getByRole('button', { name: splitType }).click();
  const numbers = dialog.locator('input[type="number"]');
  for (let index = 0; index < values.length; index += 1) {
    await numbers.nth(index + 1).fill(String(values[index]));
  }
}

async function openDetailsFor(page, description) {
  const row = expenseRow(page, description);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Details' }).click();
  const details = page.getByRole('dialog');
  await expect(details).toBeVisible();
  return details;
}

test.describe('expense creation and split interactions', () => {
  test('equal split of Rs 100 shows deterministic paise shares and integer money payloads', async ({ page, api, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Equal Rs100 ${randomUUID().slice(0, 6)}`;
    let submittedPayload;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/api/groups/${group.id}/expenses`)) {
        submittedPayload = request.postDataJSON();
      }
    });
    const dialog = await openExpenseModal(page);
    await saveExpense(dialog, description, '100.00');
    await expect(page.locator('.toast')).toContainText('Expense added successfully');
    const row = expenseRow(page, description);
    await expect(row).toContainText('equal');
    await expect(row).toContainText(/100\.00/);
    expect(Number.isSafeInteger(submittedPayload.amountPaise)).toBe(true);
    expect(submittedPayload.amountPaise).toBe(10000);
    expect(submittedPayload.payers.every((payer) => Number.isSafeInteger(payer.amountPaise))).toBe(true);

    const details = await openDetailsFor(page, description);
    await expect(details.getByText(/33\.34/)).toBeVisible();
    await expect(details.getByText(/33\.33/)).toHaveCount(2);
    await expect(details.getByText(/100\.00/).first()).toBeVisible();
    await details.getByRole('button', { name: 'Close' }).last().click();
    await balanceSnapshot(api, group.id, users[0]);
  });

  test('exact split saves matching shares and presents the missing and expected totals for a mismatch', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Exact split ${randomUUID().slice(0, 6)}`;
    let dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '100.00');
    await selectSplitAmounts(dialog, '2. Exact', ['20.00', '30.00', '50.00']);
    await expect(dialog.getByRole('status')).toContainText('Exact shares equal total');
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    const row = expenseRow(page, description);
    await expect(row).toContainText('exact');
    let details = await openDetailsFor(page, description);
    await expect(details.getByText(/20\.00/)).toBeVisible();
    await expect(details.getByText(/30\.00/)).toBeVisible();
    await expect(details.getByText(/50\.00/)).toBeVisible();
    await details.getByRole('button', { name: 'Close' }).last().click();

    const mismatch = `Exact mismatch ${randomUUID().slice(0, 6)}`;
    dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, mismatch, '100.00');
    await selectSplitAmounts(dialog, '2. Exact', ['20.00', '30.00', '40.00']);
    const feedback = dialog.getByRole('status');
    await expect(feedback).toContainText('10.00');
    await expect(dialog.getByRole('button', { name: 'Create Expense' })).toBeDisabled();
    // The requested UI copy must include both the entered sum (Rs 90) and total (Rs 100).
    await expect(feedback).toContainText(/90\.00.*100\.00|100\.00.*90\.00/);
    await expect(expenseRow(page, mismatch)).toHaveCount(0);
  });

  test('50/50 percentage split saves and shows the resulting shares', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Percentage halves ${randomUUID().slice(0, 6)}`;
    const dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '100.00');
    await dialog.getByRole('button', { name: '3. Percentage' }).click();
    await dialog.getByRole('checkbox').nth(2).uncheck();
    const numbers = dialog.locator('input[type="number"]');
    await numbers.nth(1).fill('50');
    await numbers.nth(2).fill('50');
    await expect(dialog.getByRole('status')).toContainText('Percentages sum to 100%');
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    await expect(expenseRow(page, description)).toContainText('percentage');
    const details = await openDetailsFor(page, description);
    await expect(details.getByText(/50\.00/)).toHaveCount(2);
  });

  test('33.33 + 33.33 + 33.34 percentage split is accepted as exactly 100%', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Percentage hundred ${randomUUID().slice(0, 6)}`;
    const dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '100.00');
    await dialog.getByRole('button', { name: '3. Percentage' }).click();
    const numbers = dialog.locator('input[type="number"]');
    await numbers.nth(1).fill('33.33');
    await numbers.nth(2).fill('33.33');
    await numbers.nth(3).fill('33.34');
    await expect(dialog.getByRole('status')).toContainText('100%');
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    await expect(expenseRow(page, description)).toContainText('percentage');
    const details = await openDetailsFor(page, description);
    await expect(details.locator('.modal-body')).toContainText(/33\.33|33\.34/);
  });

  test('33.33 percentages are rejected with a clear exact-total message', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Percentage 99.99 ${randomUUID().slice(0, 6)}`;
    const dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '100.00');
    await dialog.getByRole('button', { name: '3. Percentage' }).click();
    const numbers = dialog.locator('input[type="number"]');
    for (const index of [1, 2, 3]) await numbers.nth(index).fill('33.33');
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    await expect(dialog.locator('.alert.alert-danger')).toContainText(/must sum to 100%|exactly 100/i);
    await expect(expenseRow(page, description)).toHaveCount(0);
  });

  for (const invalidPercentage of ['-5', 'letters', '33.333']) {
    test(`percentage input ${invalidPercentage} is rejected in the browser`, async ({ page, users, group }) => {
      await prepareGroupPage(page, group, users[0]);
      const dialog = await openExpenseModal(page);
      await fillExpenseBasics(dialog, `Invalid percent ${randomUUID().slice(0, 6)}`, '100.00');
      await dialog.getByRole('button', { name: '3. Percentage' }).click();
      const input = dialog.locator('input[type="number"]').nth(1);
      if (invalidPercentage === 'letters') {
        await input.focus();
        await page.keyboard.press('Control+A');
        await page.keyboard.type('letters');
      } else {
        await input.fill(invalidPercentage);
      }
      await dialog.getByRole('button', { name: 'Create Expense' }).click();
      const nativeMessage = await input.evaluate((element) => element.validationMessage);
      await expect(dialog.getByRole('status')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Create Expense' })).toBeDisabled();
      if (nativeMessage) expect(nativeMessage.length).toBeGreaterThan(0);
      await expect(dialog.getByRole('heading', { name: 'Add New Expense' })).toBeVisible();
    });
  }

  test('itemized expense saves item assignments; an item with no assignees shows a clear error', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Itemized ${randomUUID().slice(0, 6)}`;
    let dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '60.00');
    await dialog.getByRole('button', { name: '4. Itemized' }).click();
    await dialog.getByPlaceholder('Item name (e.g. Pizza)').fill('Airport taxi');
    await dialog.locator('input[type="number"]').nth(1).fill('60.00');
    await expect(dialog.getByText('Itemized total matches expense total')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    await expect(expenseRow(page, description)).toContainText('itemized');

    const missingAssignees = `No assignees ${randomUUID().slice(0, 6)}`;
    dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, missingAssignees, '60.00');
    await dialog.getByRole('button', { name: '4. Itemized' }).click();
    await dialog.getByPlaceholder('Item name (e.g. Pizza)').fill('Unassigned item');
    await dialog.locator('input[type="number"]').nth(1).fill('60.00');
    for (const user of users) {
      await dialog.getByRole('button', { name: user.user.name, exact: true }).last().click();
    }
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    await expect(dialog.locator('.alert.alert-danger')).toContainText(/assign.*at least one user|at least one user/i);
    await expect(expenseRow(page, missingAssignees)).toHaveCount(0);
  });

  test('multi-payer amounts must match; saved paise are integers and the UI offers no duplicate payer rows', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Multi payer ${randomUUID().slice(0, 6)}`;
    let payload;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/api/groups/${group.id}/expenses`)) payload = request.postDataJSON();
    });
    let dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '100.00');
    await dialog.getByRole('button', { name: /Multiple Payers/ }).click();
    let numberInputs = dialog.locator('input[type="number"]');
    await expect(numberInputs).toHaveCount(4);
    await numberInputs.nth(1).fill('60.00');
    await numberInputs.nth(2).fill('40.00');
    await dialog.getByRole('button', { name: 'Create Expense' }).click();
    const row = expenseRow(page, description);
    await expect(row).toContainText('2 Payers (Multi)');
    expect(Number.isSafeInteger(payload.amountPaise)).toBe(true);
    expect(payload.payers.map((payer) => payer.amountPaise)).toEqual([6000, 4000]);
    expect(new Set(payload.payers.map((payer) => payer.userId)).size).toBe(payload.payers.length);

    dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, `Multi mismatch ${randomUUID().slice(0, 6)}`, '100.00');
    await dialog.getByRole('button', { name: /Multiple Payers/ }).click();
    numberInputs = dialog.locator('input[type="number"]');
    await numberInputs.nth(1).fill('60.00');
    await numberInputs.nth(2).fill('30.00');
    await expect(dialog.getByText(/10\.00 remaining/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create Expense' })).toBeDisabled();
  });
});

test.describe('expense limits, editing, cancellation, and voiding', () => {
  const invalidAmounts = ['0', '-1', '100.567', 'letters', '1e21', '10000001'];
  for (const amount of invalidAmounts) {
    test(`rejects expense amount ${amount} with visible validation`, async ({ page, users, group }) => {
      await prepareGroupPage(page, group, users[0]);
      const description = `Bad amount ${randomUUID().slice(0, 6)}`;
      const dialog = await openExpenseModal(page);
      await dialog.getByPlaceholder('e.g. Swiggy Dinner, Groceries, WiFi').fill(description);
      const input = dialog.getByPlaceholder('0.00', { exact: true });
      if (amount === 'letters') {
        await input.focus();
        await page.keyboard.press('Control+A');
        await page.keyboard.type('letters');
      } else {
        await input.fill(amount);
      }
      await dialog.getByRole('button', { name: 'Create Expense' }).click();
      const nativeMessage = await input.evaluate((element) => element.validationMessage);
      const alert = dialog.locator('.alert.alert-danger');
      await expect.poll(async () => (await alert.count()) > 0 || Boolean(nativeMessage)).toBe(true);
      if (await alert.count()) {
        const text = await alert.innerText();
        expect(text).not.toMatch(/postgres|sql|stack|constraint/i);
        expect(text.length).toBeGreaterThan(4);
      } else {
        expect(nativeMessage.length).toBeGreaterThan(0);
      }
      await expect(expenseRow(page, description)).toHaveCount(0);
    });
  }

  test('accepts exactly Rs 1 crore and displays the saved total', async ({ page, users, group, api }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Max valid ${randomUUID().slice(0, 6)}`;
    const dialog = await openExpenseModal(page);
    await saveExpense(dialog, description, '10000000');
    const row = expenseRow(page, description);
    await expect(row).toContainText(/1,00,00,000\.00|10,000,000\.00/);
    const details = await openDetailsFor(page, description);
    await expect(details.locator('.modal-body')).toContainText(/1,00,00,000\.00|10,000,000\.00/);
    await balanceSnapshot(api, group.id, users[0]);
  });

  for (const split of ['1. Equal', '2. Exact', '3. Percentage', '4. Itemized']) {
    test(`edits a ${split} expense and shows a new version`, async ({ page, users, group }) => {
      await prepareGroupPage(page, group, users[0]);
      const description = `Editable ${split} ${randomUUID().slice(0, 5)}`;
      let dialog = await openExpenseModal(page);
      await fillExpenseBasics(dialog, description, '100.00');
      if (split === '2. Exact') await selectSplitAmounts(dialog, split, ['20.00', '30.00', '50.00']);
      if (split === '3. Percentage') await selectSplitAmounts(dialog, split, ['33.3', '33.3', '33.4']);
      if (split === '4. Itemized') {
        await dialog.getByRole('button', { name: split }).click();
        await dialog.getByPlaceholder('Item name (e.g. Pizza)').fill('Edit flow item');
        await dialog.locator('input[type="number"]').nth(1).fill('100.00');
      }
      await dialog.getByRole('button', { name: 'Create Expense' }).click();
      const row = expenseRow(page, description);
      await expect(row).toBeVisible();
      await row.getByTitle('Edit expense').click();
      dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Edit Expense' })).toBeVisible();
      const revisedDescription = `${description} revised`;
      await dialog.getByPlaceholder('e.g. Swiggy Dinner, Groceries, WiFi').fill(revisedDescription);
      await dialog.getByPlaceholder('e.g. Corrected item shares, updated amounts').fill('Corrected description in browser test');
      await dialog.getByRole('button', { name: 'Update Expense' }).click();
      await expect(page.locator('.toast')).toContainText('Expense updated successfully');
      const revisedRow = expenseRow(page, revisedDescription);
      await revisedRow.getByRole('button', { name: 'Details' }).click();
      const details = page.getByRole('dialog');
      await expect(details).toContainText('Revision History (2 versions)');
      await expect(details).toContainText(/v2/);
    });
  }

  test('editing the amount changes member balances by the corresponding paise', async ({ page, api, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Balance edit ${randomUUID().slice(0, 6)}`;
    let dialog = await openExpenseModal(page);
    await saveExpense(dialog, description, '10.00');
    const before = await balanceSnapshot(api, group.id, users[0]);
    const beforeMap = new Map(before.map((balance) => [Number(balance.userId), Number(balance.netBalancePaise)]));
    const row = expenseRow(page, description);
    await row.getByTitle('Edit expense').click();
    dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('0.00', { exact: true }).fill('20.00');
    await dialog.getByPlaceholder('e.g. Corrected item shares, updated amounts').fill('Updated total');
    await dialog.getByRole('button', { name: 'Update Expense' }).click();
    await expect(page.locator('.toast')).toContainText('Expense updated successfully');
    const after = await balanceSnapshot(api, group.id, users[0]);
    expect(after.some((balance) => Number(balance.netBalancePaise) !== beforeMap.get(Number(balance.userId)))).toBe(true);
    expect(after.reduce((sum, balance) => sum + Number(balance.netBalancePaise), 0)).toBe(0);
    await expect(expenseRow(page, description)).toContainText(/20\.00/);
  });

  test('void confirmation restores balances and a voided expense has no edit action', async ({ page, api, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Void from UI ${randomUUID().slice(0, 6)}`;
    await seedExpense(api, users[0], group.id, {
      description,
      amountPaise: 9000,
      participantIds: users.map((user) => user.user.id),
    });
    await page.reload();
    const before = await balanceSnapshot(api, group.id, users[0]);
    expect(before.some((balance) => Number(balance.netBalancePaise) !== 0)).toBe(true);
    const row = expenseRow(page, description);
    await row.getByTitle('Void expense').click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toContainText('Financial balances will be restored');
    await confirmation.getByRole('button', { name: 'Void Expense' }).click();
    await expect(expenseRow(page, description).getByText('Voided', { exact: true })).toBeVisible();
    await expect(expenseRow(page, description).getByTitle('Edit expense')).toHaveCount(0);
    const after = await balanceSnapshot(api, group.id, users[0]);
    expect(after.every((balance) => Number(balance.netBalancePaise) === 0)).toBe(true);
  });

  test('double-clicking Save creates one expense and the modal disables while submitting', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    const description = `Double save ${randomUUID().slice(0, 6)}`;
    const dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, description, '12.00');
    let postCount = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/api/groups/${group.id}/expenses`)) postCount += 1;
    });
    await page.route(`**/api/groups/${group.id}/expenses`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });
    const saveButton = dialog.getByRole('button', { name: 'Create Expense' });
    await saveButton.dblclick({ delay: 5 });
    await expect(saveButton).toBeDisabled();
    await expect(expenseRow(page, description)).toHaveCount(1);
    expect(postCount).toBe(1);
  });

  test('cancel and close discard an expense draft', async ({ page, users, group }) => {
    await prepareGroupPage(page, group, users[0]);
    let dialog = await openExpenseModal(page);
    await fillExpenseBasics(dialog, 'Draft that should disappear', '99.00');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    dialog = await openExpenseModal(page);
    await expect(dialog.getByPlaceholder('e.g. Swiggy Dinner, Groceries, WiFi')).toHaveValue('');
    await expect(dialog.getByPlaceholder('0.00', { exact: true })).toHaveValue('');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(expenseRow(page, 'Draft that should disappear')).toHaveCount(0);
  });

  test('a user who left the group cannot reopen its expense page to edit', async ({ page, api, users, group }) => {
    const expense = await seedExpense(api, users[1], group.id, {
      description: `Member own expense ${randomUUID().slice(0, 6)}`,
      amountPaise: 1000,
      participantIds: [users[1].user.id],
    });
    await authenticateForUi(page, users[1]);
    await openGroupThroughUi(page, group);
    await page.getByRole('button', { name: /Members/ }).click();
    await page.getByRole('button', { name: 'Leave Group' }).click();
    const confirmation = page.getByRole('dialog');
    await confirmation.getByRole('button', { name: 'Leave Group' }).click();
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByText(group.name, { exact: true })).toHaveCount(0);

    await page.goto(`/groups/${group.id}`);
    await expect(page.locator('.toast')).toContainText(/access|member/i);
    await expect(page.getByTitle('Edit expense')).toHaveCount(0);
    expect(expense.id).toBeTruthy();
  });
});
