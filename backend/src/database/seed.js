// backend/src/database/seed.js
// Database seeding script with realistic data, users, all 6 split methods, settlements, and activity logs

const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../db');
const { calculateSplit } = require('../utils/splits');
const { toPaise } = require('../utils/money');

async function seed() {
  console.log('--- Seeding SettleUpExpenses Database ---');

  try {
    await withTransaction(async (client) => {
      // Clear existing records
      console.log('Clearing existing records...');
      await client.query(`
        TRUNCATE activity_logs, settlement_status_history, settlements, 
                 expense_versions, expense_items, expense_participants, 
                 expense_payers, expenses, group_members, groups, users, idempotency_records 
        RESTART IDENTITY CASCADE;
      `);

      // 1. Create Users
      console.log('Creating demo users...');
      const passwordHash = await bcrypt.hash('password123', 10);

      const usersData = [
        { name: 'Aarav Sharma', email: 'aarav@example.com', upi: 'aarav@okhdfcbank' },
        { name: 'Priya Patel', email: 'priya@example.com', upi: 'priya@okaxis' },
        { name: 'Rohan Iyer', email: 'rohan@example.com', upi: 'rohan@paytm' },
        { name: 'Ananya Gupta', email: 'ananya@example.com', upi: 'ananya@icici' },
        { name: 'Vikram Singh', email: 'vikram@example.com', upi: 'vikram@upi' },
        { name: 'Pratiksha Dogare', email: 'dongarepratiksha62@gmail.com', upi: 'pratiksha@upi' },
      ];

      const users = [];
      for (const u of usersData) {
        const res = await client.query(
          `INSERT INTO users (name, email, password_hash, upi_id)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [u.name, u.email, passwordHash, u.upi]
        );
        users.push(res.rows[0]);
      }

      // Map users for convenient reference
      const [aarav, priya, rohan, ananya, vikram] = users;

      // 2. Create Groups
      console.log('Creating groups...');
      const group1Res = await client.query(
        `INSERT INTO groups (name, description, invite_code, created_by)
         VALUES ('Flat 402 Indiranagar', 'Bangalore flatmates sharing rent, utilities, and domestic expenses', 'FLAT402B', $1)
         RETURNING *`,
        [aarav.id]
      );
      const flatGroup = group1Res.rows[0];

      const group2Res = await client.query(
        `INSERT INTO groups (name, description, invite_code, created_by)
         VALUES ('Goa Trip 2026', 'Friends reunion trip to North Goa with villas, beach shacks, and water sports', 'GOA2026X', $1)
         RETURNING *`,
        [priya.id]
      );
      const goaGroup = group2Res.rows[0];

      // Add memberships
      // Flat 402: Aarav (owner), Priya (admin), Rohan (member), Ananya (member)
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, status) VALUES
         ($1, $2, 'owner', 'active'),
         ($1, $3, 'admin', 'active'),
         ($1, $4, 'member', 'active'),
         ($1, $5, 'member', 'active')`,
        [flatGroup.id, aarav.id, priya.id, rohan.id, ananya.id]
      );

      // Goa Trip: Priya (owner), Aarav (admin), Rohan (member), Ananya (member), Vikram (member)
      await client.query(
        `INSERT INTO group_members (group_id, user_id, role, status) VALUES
         ($1, $2, 'owner', 'active'),
         ($1, $3, 'admin', 'active'),
         ($1, $4, 'member', 'active'),
         ($1, $5, 'member', 'active'),
         ($1, $6, 'member', 'active')`,
        [goaGroup.id, priya.id, aarav.id, rohan.id, ananya.id, vikram.id]
      );

      // Helper to insert an expense
      async function insertExpense({
        groupId,
        createdBy,
        description,
        totalPaise,
        category,
        notes,
        expenseDate,
        splitType,
        payers,
        splitData,
        participantIds,
        items = [],
      }) {
        const expRes = await client.query(
          `INSERT INTO expenses (group_id, created_by, description, total_amount_paise, category, notes, expense_date, split_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8) RETURNING *`,
          [groupId, createdBy.id, description, totalPaise, category, notes, expenseDate, splitType]
        );
        const exp = expRes.rows[0];

        // Payers
        for (const p of payers) {
          await client.query(
            `INSERT INTO expense_payers (expense_id, user_id, amount_paise) VALUES ($1, $2, $3)`,
            [exp.id, p.userId, p.amountPaise]
          );
        }

        // Calculate splits
        let participants = [];
        if (splitType === 'itemized') {
          participants = calculateSplit('itemized', totalPaise, {
            items,
            sharedTaxPaise: splitData?.sharedTaxPaise || 0,
          }, participantIds);

          for (const it of items) {
            await client.query(
              `INSERT INTO expense_items (expense_id, item_name, amount_paise, assigned_user_ids)
               VALUES ($1, $2, $3, $4)`,
              [exp.id, it.name, it.amountPaise, JSON.stringify(it.assignedUserIds)]
            );
          }
        } else {
          participants = calculateSplit(splitType, totalPaise, splitData, participantIds);
        }

        for (const pt of participants) {
          await client.query(
            `INSERT INTO expense_participants (expense_id, user_id, share_amount_paise, share_value, adjustment_paise)
             VALUES ($1, $2, $3, $4, $5)`,
            [exp.id, pt.userId, pt.sharePaise, pt.shareValue || 0, pt.adjustmentPaise || 0]
          );
        }

        // Snapshot
        await client.query(
          `INSERT INTO expense_versions (expense_id, version, snapshot, modified_by, reason)
           VALUES ($1, 1, $2, $3, 'Initial record')`,
          [
            exp.id,
            JSON.stringify({ expense: exp, payers, participants, items }),
            createdBy.id,
          ]
        );

        // Activity log
        await client.query(
          `INSERT INTO activity_logs (group_id, actor_id, entity_type, entity_id, action, metadata)
           VALUES ($1, $2, 'expense', $3, 'created', $4)`,
          [
            groupId,
            createdBy.id,
            exp.id,
            JSON.stringify({ description, amountPaise: totalPaise, splitType }),
          ]
        );

        return exp;
      }

      console.log('Seeding expenses covering all 6 split methods and multiple payers...');

      // Expense 1: Equal split (High-Speed ACT Fibernet WiFi Bill ₹1,499)
      await insertExpense({
        groupId: flatGroup.id,
        createdBy: aarav,
        description: 'ACT Fibernet 300 Mbps Internet',
        totalPaise: 149900,
        category: 'Utilities',
        notes: 'Monthly billing for October 2026',
        expenseDate: '2026-10-01',
        splitType: 'equal',
        payers: [{ userId: aarav.id, amountPaise: 149900 }],
        participantIds: [aarav.id, priya.id, rohan.id, ananya.id],
      });

      // Expense 2: Exact amounts split (Nature Basket Monthly Organic Groceries ₹4,350)
      await insertExpense({
        groupId: flatGroup.id,
        createdBy: priya,
        description: 'Nature Basket Grocery & Vegetables',
        totalPaise: 435000,
        category: 'Groceries',
        notes: 'Individual organic items tallied at checkout',
        expenseDate: '2026-10-05',
        splitType: 'exact',
        payers: [{ userId: priya.id, amountPaise: 435000 }],
        splitData: [
          { userId: aarav.id, amountPaise: 120000 },
          { userId: priya.id, amountPaise: 145000 },
          { userId: rohan.id, amountPaise: 90000 },
          { userId: ananya.id, amountPaise: 80000 },
        ],
      });

      // Expense 3: Percentage split (BESCOM Electricity Bill with AC usage ₹3,600)
      await insertExpense({
        groupId: flatGroup.id,
        createdBy: rohan,
        description: 'BESCOM Electricity Bill',
        totalPaise: 360000,
        category: 'Utilities',
        notes: 'Aarav and Rohan ran AC in bedrooms: 35% and 35%, Priya & Ananya 15% each',
        expenseDate: '2026-10-10',
        splitType: 'percentage',
        payers: [{ userId: rohan.id, amountPaise: 360000 }],
        splitData: [
          { userId: aarav.id, percentage: 35 },
          { userId: rohan.id, percentage: 35 },
          { userId: priya.id, percentage: 15 },
          { userId: ananya.id, percentage: 15 },
        ],
      });

      // Expense 4: Multiple Payers + Shares split (Goa Sea-Facing Private Villa ₹24,000)
      // Aarav paid ₹15,000, Priya paid ₹9,000.
      // Aarav & Vikram had master suites (3 shares each), Priya, Rohan, Ananya had regular beds (2 shares each). Total shares = 3+3+2+2+2 = 12
      await insertExpense({
        groupId: goaGroup.id,
        createdBy: aarav,
        description: 'Goa 4BHK Anjuna Sea-Facing Villa Booking',
        totalPaise: 2400000,
        category: 'Travel & Accommodation',
        notes: 'Advance booking paid jointly by Aarav and Priya',
        expenseDate: '2026-10-15',
        splitType: 'shares',
        payers: [
          { userId: aarav.id, amountPaise: 1500000 },
          { userId: priya.id, amountPaise: 900000 },
        ],
        splitData: [
          { userId: aarav.id, shares: 3 },
          { userId: vikram.id, shares: 3 },
          { userId: priya.id, shares: 2 },
          { userId: rohan.id, shares: 2 },
          { userId: ananya.id, shares: 2 },
        ],
        participantIds: [aarav.id, vikram.id, priya.id, rohan.id, ananya.id],
      });

      // Expense 5: Adjustment split (Dinner at Fisherman’s Wharf ₹5,500)
      // Equal base split + adjustments: Vikram had expensive cocktails (+₹1,000), Ananya didn't drink (-₹500), Rohan (-₹500)
      await insertExpense({
        groupId: goaGroup.id,
        createdBy: vikram,
        description: "Fisherman's Wharf Seafood & Cocktails",
        totalPaise: 550000,
        category: 'Food & Dining',
        notes: 'Base dinner split equally + beverage adjustment',
        expenseDate: '2026-10-17',
        splitType: 'adjustment',
        payers: [{ userId: vikram.id, amountPaise: 550000 }],
        splitData: [
          { userId: vikram.id, adjustmentPaise: 100000 },
          { userId: ananya.id, adjustmentPaise: -50000 },
          { userId: rohan.id, adjustmentPaise: -50000 },
          { userId: aarav.id, adjustmentPaise: 0 },
          { userId: priya.id, adjustmentPaise: 0 },
        ],
      });

      // Expense 6: Itemized split with shared tax and delivery fee (Swiggy Party Order ₹2,350)
      const swiggyItems = [
        { name: 'Peri Peri Chicken Pizza (Large)', amountPaise: 85000, assignedUserIds: [aarav.id, rohan.id] },
        { name: 'Paneer Makhani Sourdough Pizza', amountPaise: 70000, assignedUserIds: [priya.id, ananya.id] },
        { name: 'Garlic Breadsticks with Dip', amountPaise: 35000, assignedUserIds: [aarav.id, priya.id, rohan.id, ananya.id] },
        { name: 'Belgian Chocolate Milkshakes (x2)', amountPaise: 25000, assignedUserIds: [priya.id, ananya.id] },
      ];
      // Sum of items = 850 + 700 + 350 + 250 = 2150. Total = 2350 (shared tax/delivery = ₹200 = 20000 paise)
      await insertExpense({
        groupId: flatGroup.id,
        createdBy: priya,
        description: 'Swiggy Weekend Pizza Feast',
        totalPaise: 235000,
        category: 'Food & Dining',
        notes: 'Itemized pizzas and drinks + shared GST and delivery fee',
        expenseDate: '2026-10-18',
        splitType: 'itemized',
        payers: [{ userId: priya.id, amountPaise: 235000 }],
        splitData: { sharedTaxPaise: 20000 },
        participantIds: [aarav.id, priya.id, rohan.id, ananya.id],
        items: swiggyItems,
      });

      // Expense 7: Subset of participants (Grand Island Scuba Diving ₹7,500 - only 3 people)
      await insertExpense({
        groupId: goaGroup.id,
        createdBy: rohan,
        description: 'Grand Island Scuba Diving & Parasailing',
        totalPaise: 750000,
        category: 'Entertainment',
        notes: 'Only Aarav, Rohan, and Vikram participated in scuba diving',
        expenseDate: '2026-10-18',
        splitType: 'equal',
        payers: [{ userId: rohan.id, amountPaise: 750000 }],
        participantIds: [aarav.id, rohan.id, vikram.id],
      });

      // 3. Seed Settlements in Various Statuses
      console.log('Seeding settlements across various statuses...');

      // Settlement 1: CONFIRMED payment (Aarav paid Priya ₹500 via UPI)
      const st1 = await client.query(
        `INSERT INTO settlements 
         (group_id, created_by, from_user, to_user, amount_paise, status, payment_method, reference_id, notes, marked_paid_at, confirmed_at, confirmed_by)
         VALUES ($1, $2, $2, $3, 50000, 'confirmed', 'upi', 'UPI/20261019/987654321', 'Settled partial groceries', CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 day', $3)
         RETURNING *`,
        [flatGroup.id, aarav.id, priya.id]
      );
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, NULL, 'pending', $2, 'Proposed'),
                ($1, 'pending', 'marked_paid', $2, 'Paid via GPay'),
                ($1, 'marked_paid', 'confirmed', $3, 'Received in HDFC bank')`,
        [st1.rows[0].id, aarav.id, priya.id]
      );

      // Settlement 2: MARKED_PAID (Rohan paid Priya ₹1,000 via UPI, awaiting confirmation)
      const st2 = await client.query(
        `INSERT INTO settlements 
         (group_id, created_by, from_user, to_user, amount_paise, status, payment_method, reference_id, notes, marked_paid_at)
         VALUES ($1, $2, $2, $3, 100000, 'marked_paid', 'upi', 'UPI/20261021/456789123', 'Transferred via PhonePe', CURRENT_TIMESTAMP - INTERVAL '4 hours')
         RETURNING *`,
        [flatGroup.id, rohan.id, priya.id]
      );
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, NULL, 'pending', $2, 'Proposed'),
                ($1, 'pending', 'marked_paid', $2, 'Transferred via PhonePe')`,
        [st2.rows[0].id, rohan.id]
      );

      // Settlement 3: PENDING proposal in Goa Trip (Vikram proposed to pay Aarav ₹2,000)
      const st3 = await client.query(
        `INSERT INTO settlements 
         (group_id, created_by, from_user, to_user, amount_paise, status, payment_method, notes)
         VALUES ($1, $2, $2, $3, 200000, 'pending', 'upi', 'Proposed settlement for villa stay')
         RETURNING *`,
        [goaGroup.id, vikram.id, aarav.id]
      );
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, NULL, 'pending', $2, 'Proposal created')`,
        [st3.rows[0].id, vikram.id]
      );

      // Settlement 4: REJECTED payment (Ananya submitted incorrect reference)
      const st4 = await client.query(
        `INSERT INTO settlements 
         (group_id, created_by, from_user, to_user, amount_paise, status, payment_method, reference_id, notes, marked_paid_at, rejected_at, rejected_by)
         VALUES ($1, $2, $2, $3, 30000, 'rejected', 'upi', 'UPI/INVALID_REF', 'Payment not credited', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '2 days', $3)
         RETURNING *`,
        [flatGroup.id, ananya.id, aarav.id]
      );
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, previous_status, new_status, changed_by, notes)
         VALUES ($1, NULL, 'pending', $2, 'Created'),
                ($1, 'pending', 'marked_paid', $2, 'Marked paid with ref'),
                ($1, 'marked_paid', 'rejected', $3, 'Transaction reference not found in bank')`,
        [st4.rows[0].id, ananya.id, aarav.id]
      );

      console.log('✓ Database seeding completed successfully!');
    });
  } catch (err) {
    console.error('Seeding error:', err);
    throw err;
  }
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seed };
