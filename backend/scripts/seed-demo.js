// Rebuilds only the dedicated "Goa Trip" demo group in the configured database.
// Safe to rerun: the three demo users and group are upserted, and that group's
// transactions are reset before the deterministic sample data is inserted.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../src/db');
const { calculateSplit } = require('../src/utils/splits');

const DEMO_PASSWORD = 'Demo@12345';
const DEMO_GROUP_NAME = 'Goa Trip';
const DEMO_DESCRIPTION = 'SettleUp demo group: expense splits and settlement states';

async function upsertDemoUser(client, user) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash, upi_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           upi_id = EXCLUDED.upi_id,
           updated_at = CURRENT_TIMESTAMP
     RETURNING id, name, email, upi_id`,
    [user.name, user.email, passwordHash, user.upiId]
  );
  return result.rows[0];
}

async function insertExpense(client, {
  groupId,
  creatorId,
  description,
  amountPaise,
  splitType,
  splitData,
  participantIds,
  payers,
  items = [],
  voidAfterCreate = false,
}) {
  const payerTotal = payers.reduce((sum, payer) => sum + payer.amountPaise, 0);
  if (payerTotal !== amountPaise) {
    throw new Error(`${description}: payer amounts do not equal the expense total`);
  }

  const participants = calculateSplit(splitType, amountPaise, splitData, participantIds);
  const participantTotal = participants.reduce((sum, participant) => sum + participant.sharePaise, 0);
  if (participantTotal !== amountPaise) {
    throw new Error(`${description}: participant shares do not equal the expense total`);
  }

  const expenseResult = await client.query(
    `INSERT INTO expenses
       (group_id, created_by, description, total_amount_paise, category, notes, split_type)
     VALUES ($1, $2, $3, $4, 'Demo', 'Seeded by backend/scripts/seed-demo.js', $5)
     RETURNING *`,
    [groupId, creatorId, description, amountPaise, splitType]
  );
  const expense = expenseResult.rows[0];

  for (const payer of payers) {
    await client.query(
      'INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, $3)',
      [expense.id, payer.userId, payer.amountPaise]
    );
  }

  for (const participant of participants) {
    await client.query(
      `INSERT INTO expense_participants
         (expense_id, user_id, share_amount_paise, share_value, adjustment_paise)
       VALUES ($1, $2, $3, $4, $5)`,
      [expense.id, participant.userId, participant.sharePaise, participant.shareValue || 0, participant.adjustmentPaise || 0]
    );
  }

  for (const item of items) {
    await client.query(
      `INSERT INTO expense_items (expense_id, item_name, amount_paise, assigned_user_ids)
       VALUES ($1, $2, $3, $4)`,
      [expense.id, item.name, item.amountPaise, JSON.stringify(item.assignedUserIds)]
    );
  }

  const snapshot = { expense, payers, participants, items };
  await client.query(
    `INSERT INTO expense_versions (expense_id, version, snapshot, modified_by, reason)
     VALUES ($1, 1, $2, $3, 'Initial demo expense')`,
    [expense.id, JSON.stringify(snapshot), creatorId]
  );
  await client.query(
    `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
     VALUES ($1, $2, 'expense', $3, 'created', $4)`,
    [groupId, creatorId, expense.id, JSON.stringify({ description, amountPaise, demoSeed: true })]
  );

  if (voidAfterCreate) {
    const voidResult = await client.query(
      `UPDATE expenses
       SET is_voided = true, voided_by = $1, voided_at = CURRENT_TIMESTAMP,
           version = 2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [creatorId, expense.id]
    );
    await client.query(
      `INSERT INTO expense_versions (expense_id, version, snapshot, modified_by, reason)
       VALUES ($1, 2, $2, $3, 'Voided demo expense')`,
      [expense.id, JSON.stringify({ ...snapshot, expense: voidResult.rows[0] }), creatorId]
    );
    await client.query(
      `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
       VALUES ($1, $2, 'expense', $3, 'voided', $4)`,
      [groupId, creatorId, expense.id, JSON.stringify({ description, demoSeed: true })]
    );
    return voidResult.rows[0];
  }

  return expense;
}

async function insertSettlement(client, { groupId, payerId, receiverId, amountPaise, status, note }) {
  const confirmed = status === 'confirmed';
  const result = await client.query(
    `INSERT INTO settlements
       (group_id, created_by, from_user, to_user, amount_paise, status,
        payment_method, notes, confirmed_at, confirmed_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'upi', $7,
             $8, $9)
     RETURNING *`,
    [groupId, payerId, payerId, receiverId, amountPaise, status, note,
      confirmed ? new Date() : null, confirmed ? receiverId : null]
  );
  const settlement = result.rows[0];

  await client.query(
    `INSERT INTO settlement_status_history
       (settlement_id, previous_status, new_status, changed_by, notes)
     VALUES ($1, NULL, $2, $3, $4)`,
    [settlement.id, status, confirmed ? receiverId : payerId, note]
  );
  await client.query(
    `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
     VALUES ($1, $2, 'settlement', $3, $4, $5)`,
    [groupId, confirmed ? receiverId : payerId, settlement.id, confirmed ? 'confirmed' : 'created', JSON.stringify({ amountPaise, status, demoSeed: true })]
  );
  return settlement;
}

async function seedDemo() {
  const seeded = await withTransaction(async (client) => {
    const alice = await upsertDemoUser(client, { name: 'Alice', email: 'alice@example.com', upiId: 'alice@okaxis' });
    const bob = await upsertDemoUser(client, { name: 'Bob', email: 'bob@example.com', upiId: 'bob@okaxis' });
    const carol = await upsertDemoUser(client, { name: 'Carol', email: 'carol@example.com', upiId: 'carol@okaxis' });
    const userIds = [alice.id, bob.id, carol.id];

    let groupResult = await client.query(
      'SELECT * FROM groups WHERE name = $1 AND created_by = $2 ORDER BY id ASC LIMIT 1 FOR UPDATE',
      [DEMO_GROUP_NAME, alice.id]
    );
    let group = groupResult.rows[0];
    if (!group) {
      const inviteCode = `GOA${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      groupResult = await client.query(
        `INSERT INTO groups (name, description, invite_code, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [DEMO_GROUP_NAME, DEMO_DESCRIPTION, inviteCode, alice.id]
      );
      group = groupResult.rows[0];
    } else {
      await client.query('UPDATE groups SET description = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [DEMO_DESCRIPTION, group.id]);
    }

    // This is a dedicated demo group. Rebuild only its sample transactions on rerun.
    await client.query(
      "DELETE FROM activity_logs WHERE group_id = $1 AND metadata->>'demoSeed' = 'true'",
      [group.id]
    );
    await client.query(
      "DELETE FROM expenses WHERE group_id = $1 AND notes = 'Seeded by backend/scripts/seed-demo.js'",
      [group.id]
    );
    await client.query(
      "DELETE FROM settlements WHERE group_id = $1 AND notes LIKE 'Demo seed:%'",
      [group.id]
    );

    for (const [user, role] of [[alice, 'owner'], [bob, 'member'], [carol, 'member']]) {
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (group_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'active', updated_at = CURRENT_TIMESTAMP`,
        [group.id, user.id, role]
      );
    }

    const equal = await insertExpense(client, {
      groupId: group.id, creatorId: alice.id, description: 'Demo: Equal split - Rs 100.00',
      amountPaise: 10000, splitType: 'equal', splitData: userIds, participantIds: userIds,
      payers: [{ userId: alice.id, amountPaise: 10000 }],
    });
    const exact = await insertExpense(client, {
      groupId: group.id, creatorId: alice.id, description: 'Demo: Exact split',
      amountPaise: 9000, splitType: 'exact',
      splitData: [
        { userId: alice.id, amountPaise: 3000 },
        { userId: bob.id, amountPaise: 2000 },
        { userId: carol.id, amountPaise: 4000 },
      ],
      participantIds: userIds, payers: [{ userId: alice.id, amountPaise: 9000 }],
    });
    const percentage = await insertExpense(client, {
      groupId: group.id, creatorId: alice.id, description: 'Demo: Percentage split - 33.33 / 33.33 / 33.34',
      amountPaise: 9000, splitType: 'percentage',
      splitData: [
        { userId: alice.id, percentage: 33.33 },
        { userId: bob.id, percentage: 33.33 },
        { userId: carol.id, percentage: 33.34 },
      ],
      participantIds: userIds, payers: [{ userId: alice.id, amountPaise: 9000 }],
    });
    const itemizedItems = [
      { name: 'Taxi', amountPaise: 3000, assignedUserIds: [alice.id, bob.id] },
      { name: 'Snacks', amountPaise: 3000, assignedUserIds: [bob.id, carol.id] },
    ];
    const itemized = await insertExpense(client, {
      groupId: group.id, creatorId: alice.id, description: 'Demo: Itemized taxi and snacks',
      amountPaise: 6000, splitType: 'itemized',
      splitData: { items: itemizedItems, sharedTaxPaise: 0 }, participantIds: userIds,
      payers: [{ userId: alice.id, amountPaise: 6000 }], items: itemizedItems,
    });
    const multiPayer = await insertExpense(client, {
      groupId: group.id, creatorId: alice.id, description: 'Demo: Multi-payer expense',
      amountPaise: 6000, splitType: 'equal', splitData: userIds, participantIds: userIds,
      payers: [
        { userId: alice.id, amountPaise: 4000 },
        { userId: bob.id, amountPaise: 2000 },
      ],
    });
    const voided = await insertExpense(client, {
      groupId: group.id, creatorId: alice.id, description: 'Demo: Voided hotel deposit',
      amountPaise: 3000, splitType: 'equal', splitData: userIds, participantIds: userIds,
      payers: [{ userId: bob.id, amountPaise: 3000 }], voidAfterCreate: true,
    });

    const pending = await insertSettlement(client, {
      groupId: group.id, payerId: bob.id, receiverId: alice.id, amountPaise: 1000,
      status: 'pending', note: 'Demo seed: pending payment; mark paid or confirm from the Settle Up tab.',
    });
    const confirmed = await insertSettlement(client, {
      groupId: group.id, payerId: carol.id, receiverId: alice.id, amountPaise: 1000,
      status: 'confirmed', note: 'Demo seed: confirmed payment.',
    });

    return {
      groupId: group.id,
      userIds,
      expenses: [equal.id, exact.id, percentage.id, itemized.id, multiPayer.id, voided.id],
      settlements: [pending.id, confirmed.id],
    };
  });

  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND status = 'active') AS active_members,
       (SELECT COUNT(*) FROM expenses WHERE group_id = $1 AND notes = 'Seeded by backend/scripts/seed-demo.js') AS expenses,
       (SELECT COUNT(*) FROM expenses WHERE group_id = $1 AND notes = 'Seeded by backend/scripts/seed-demo.js' AND is_voided) AS voided_expenses,
       (SELECT COUNT(*) FROM settlements WHERE group_id = $1 AND notes LIKE 'Demo seed:%' AND status = 'pending') AS pending_settlements,
       (SELECT COUNT(*) FROM settlements WHERE group_id = $1 AND notes LIKE 'Demo seed:%' AND status = 'confirmed') AS confirmed_settlements`,
    [seeded.groupId]
  );
  const equalShares = await pool.query(
    `SELECT array_agg(ep.share_amount_paise ORDER BY ep.user_id) AS shares
     FROM expense_participants ep
     JOIN expenses e ON e.id = ep.expense_id
     WHERE e.group_id = $1 AND e.description LIKE 'Demo: Equal split%'`,
    [seeded.groupId]
  );

  console.log(`Demo seed ready: groupId=${seeded.groupId}, users=${seeded.userIds.length}, expenses=${seeded.expenses.length}, settlements=${seeded.settlements.length}.`);
  console.log(`Verified demo data: ${JSON.stringify(counts.rows[0])}; equal split shares (paise): ${JSON.stringify(equalShares.rows[0].shares)}.`);
  console.log('Demo login emails: alice@example.com, bob@example.com, carol@example.com; password: Demo@12345.');
}

seedDemo()
  .catch((error) => {
    console.error('Demo seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
