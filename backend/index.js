const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "Database connected successfully!",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      message: "Database connection failed",
    });
  }
});

const PORT = process.env.PORT || 5000;


app.post('/users', async (req, res) => {
  const { name, upi_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (name, upi_id) VALUES ($1, $2) RETURNING *',
      [name, upi_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


app.post('/groups', async (req, res) => {
  const { name } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO groups (name) VALUES ($1) RETURNING *',
      [name]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.post('/groups/:groupId/members', async (req, res) => {
  const { groupId } = req.params;
  const { user_id } = req.body;

  // Convert IDs to numbers
  const groupIdNumber = Number(groupId);
  const userIdNumber = Number(user_id);

  // Validate group ID
  if (!Number.isInteger(groupIdNumber) || groupIdNumber <= 0) {
    return res.status(400).json({
      error: 'Group ID must be a positive integer'
    });
  }

  // Validate user ID
  if (!Number.isInteger(userIdNumber) || userIdNumber <= 0) {
    return res.status(400).json({
      error: 'User ID must be a positive integer'
    });
  }

  try {
    // Check group exists
    const groupResult = await pool.query(
      `SELECT id
       FROM groups
       WHERE id = $1`,
      [groupIdNumber]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Group not found'
      });
    }

    // Check user exists
    const userResult = await pool.query(
      `SELECT id
       FROM users
       WHERE id = $1`,
      [userIdNumber]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if user is already a member
    const existingMember = await pool.query(
      `SELECT id
       FROM group_members
       WHERE group_id = $1
       AND user_id = $2`,
      [groupIdNumber, userIdNumber]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({
        error: 'User is already a member of this group'
      });
    }

    // Add member
    const result = await pool.query(
      `INSERT INTO group_members
       (group_id, user_id)
       VALUES ($1, $2)
       RETURNING *`,
      [groupIdNumber, userIdNumber]
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});



app.get('/groups/:groupId/members', async (req, res) => {
  const { groupId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         gm.user_id,
         u.name,
         u.upi_id,
         gm.joined_at
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.user_id`,
      [groupId]
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});



app.post('/groups/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;
  const { paid_by, amount, description } = req.body;

  try {
    // Check group exists
    const groupResult = await pool.query(
      `SELECT id
       FROM groups
       WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Group not found'
      });
    }

    // Check payer exists in request
    if (paid_by === undefined || paid_by === null) {
      return res.status(400).json({
        error: 'Payer is required'
      });
    }

    // Check amount exists
    if (amount === undefined || amount === null) {
      return res.status(400).json({
        error: 'Expense amount is required'
      });
    }

    // Check description
    if (!description || description.trim() === '') {
      return res.status(400).json({
        error: 'Expense description is required'
      });
    }

    // Check payer ID
    if (isNaN(paid_by)) {
      return res.status(400).json({
        error: 'Payer ID must be a number'
      });
    }

    // Check amount
    if (isNaN(amount)) {
      return res.status(400).json({
        error: 'Expense amount must be a number'
      });
    }

    if (Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({
        error: 'Expense amount can have at most 2 decimal places'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Expense amount must be greater than 0'
      });
    }

    // Find group members
    const membersResult = await pool.query(
      `SELECT user_id
       FROM group_members
       WHERE group_id = $1`,
      [groupId]
    );

    const memberIds = membersResult.rows.map(row => row.user_id);
    const numMembers = memberIds.length;

    // Check group has members
    if (numMembers === 0) {
      return res.status(400).json({
        error: 'Group has no members'
      });
    }

    // Check payer is a member
    if (!memberIds.includes(Number(paid_by))) {
      return res.status(400).json({
        error: 'Payer must be a member of the group'
      });
    }

    // Create expense
    const expenseResult = await pool.query(
      `INSERT INTO expenses
       (group_id, paid_by, amount, description, split_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [groupId, paid_by, amount, description, 'equal']
    );

    const expense = expenseResult.rows[0];

    // Calculate equal split
    const baseShare =
      Math.floor((amount / numMembers) * 100) / 100;

    let totalAssigned = 0;

    for (let i = 0; i < memberIds.length; i++) {
      let share = baseShare;

      if (i === memberIds.length - 1) {
        share = amount - totalAssigned;
      }

      totalAssigned += share;

      await pool.query(
        `INSERT INTO expense_splits
         (expense_id, user_id, share_amount)
         VALUES ($1, $2, $3)`,
        [expense.id, memberIds[i], share]
      );
    }

    res.json({
      expense,
      message: 'Expense split created'
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});


app.get('/groups/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;
 

  try {
    const result = await pool.query(
      `SELECT
         e.id,
         e.group_id,
         e.paid_by,
         u.name AS paid_by_name,
         e.amount,
         e.description,
         e.split_type,
         e.created_at
       FROM expenses e
       JOIN users u ON e.paid_by = u.id
       WHERE e.group_id = $1
       ORDER BY e.id`,
      [groupId]
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

app.get('/groups/:groupId/balances', async (req, res) => {
  const { groupId } = req.params;

  try {
    // How much each person paid
    const paidResult = await pool.query(
      `SELECT paid_by AS user_id, SUM(amount) AS total_paid
       FROM expenses
       WHERE group_id = $1
       GROUP BY paid_by`,
      [groupId]
    );

    // How much each person owes
    const owedResult = await pool.query(
      `SELECT es.user_id, SUM(es.share_amount) AS total_owed
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = $1
       GROUP BY es.user_id`,
      [groupId]
    );

    // Combine paid and owed
    const balances = {};

    paidResult.rows.forEach(row => {
      balances[row.user_id] =
        (balances[row.user_id] || 0) +
        parseFloat(row.total_paid);
    });

    owedResult.rows.forEach(row => {
      balances[row.user_id] =
        (balances[row.user_id] || 0) -
        parseFloat(row.total_owed);
    });

    res.json(balances);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.get('/groups/:groupId/settle', async (req, res) => {
  const { groupId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         e.paid_by,
         payer.name AS payer_name,
         es.user_id,
         debtor.name AS debtor_name,
         es.share_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       JOIN users payer ON e.paid_by = payer.id
       JOIN users debtor ON es.user_id = debtor.id
       WHERE e.group_id = $1
       ORDER BY e.id`,
      [groupId]
    );

    const debts = {};
    const userNames = {};

    // Step 1: Create debts from each expense
    result.rows.forEach(row => {
      const fromUser = row.user_id;
      const toUser = row.paid_by;
      const amount = parseFloat(row.share_amount);

      userNames[fromUser] = row.debtor_name;
      userNames[toUser] = row.payer_name;

      if (fromUser === toUser) {
        return;
      }

      if (!debts[fromUser]) {
        debts[fromUser] = {};
      }

      debts[fromUser][toUser] =
        (debts[fromUser][toUser] || 0) + amount;
    });

    // Step 2: Cancel opposite debts
    const settlements = [];
    const processedPairs = new Set();

    for (const fromUser in debts) {
      for (const toUser in debts[fromUser]) {

        const pair = [fromUser, toUser].sort().join('-');

        if (processedPairs.has(pair)) {
          continue;
        }

        processedPairs.add(pair);

        const forward =
          debts[fromUser]?.[toUser] || 0;

        const reverse =
          debts[toUser]?.[fromUser] || 0;

        const difference =
          Math.round(Math.abs(forward - reverse) * 100) / 100;

        if (difference === 0) {
          continue;
        }

        if (forward > reverse) {
          settlements.push({
            from_user: userNames[fromUser],
            to_user: userNames[toUser],
            amount: difference
          });
        } else {
          settlements.push({
            from_user: userNames[toUser],
            to_user: userNames[fromUser],
            amount: difference
          });
        }
      }
    }

    // Keep output predictable
    settlements.sort((a, b) => {
      return a.from_user.localeCompare(b.from_user);
    });

    res.json({
      settlements,
      payment_count: settlements.length
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




app.patch('/settlements/:settlementId/pay', async (req, res) => {
  const { settlementId } = req.params;

  try {
    const result = await pool.query(
      `UPDATE settlements
       SET status = 'paid'
       WHERE id = $1
       AND status = 'pending'
       RETURNING *`,
      [settlementId]
    );

    if (result.rows.length === 0) {
      const checkResult = await pool.query(
        `SELECT status
         FROM settlements
         WHERE id = $1`,
        [settlementId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Settlement not found'
        });
      }

      return res.status(400).json({
        error: 'Settlement is already paid'
      });
    }

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});



app.post('/groups/:groupId/settlements', async (req, res) => {
  const { groupId } = req.params;
  const { from_user, to_user, amount } = req.body;

  try {
    // Check user is not paying themselves
    if (from_user === to_user) {
      return res.status(400).json({
        error: 'A user cannot pay themselves'
      });
    }

    // Check amount is a number
    if (isNaN(amount)) {
      return res.status(400).json({
        error: 'Settlement amount must be a number'
      });
    }

    // Check amount has at most 2 decimal places
    if (Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({
        error: 'Settlement amount can have at most 2 decimal places'
      });
    }

    // Check amount is greater than 0
    if (amount <= 0) {
      return res.status(400).json({
        error: 'Settlement amount must be greater than 0'
    });
  }

    // Check both users are members of the group
    const membersResult = await pool.query(
      `SELECT user_id
       FROM group_members
       WHERE group_id = $1
       AND user_id IN ($2, $3)`,
      [groupId, from_user, to_user]
    );

    if (membersResult.rows.length !== 2) {
      return res.status(400).json({
        error: 'Both users must be members of the group'
      });
    }

    // Save settlement
    const result = await pool.query(
      `INSERT INTO settlements
       (group_id, from_user, to_user, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [groupId, from_user, to_user, amount]
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});


app.get('/groups/:groupId/settlements', async (req, res) => {
  const { groupId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.group_id,
         s.from_user,
         fromUser.name AS from_user_name,
         s.to_user,
         toUser.name AS to_user_name,
         s.amount,
         s.status,
         s.created_at
       FROM settlements s
       JOIN users fromUser ON s.from_user = fromUser.id
       JOIN users toUser ON s.to_user = toUser.id
       WHERE s.group_id = $1
       ORDER BY s.id`,
      [groupId]
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});



app.get('/expenses/:expenseId/splits', async (req, res) => {
  const { expenseId } = req.params;

  try {
    // Check if expense exists
    const expenseResult = await pool.query(
      `SELECT id
       FROM expenses
       WHERE id = $1`,
      [expenseId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Expense not found'
      });
    }

    // Get split details
    const result = await pool.query(
      `SELECT
         es.id,
         es.expense_id,
         es.user_id,
         u.name AS user_name,
         es.share_amount
       FROM expense_splits es
       JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = $1
       ORDER BY es.user_id`,
      [expenseId]
    );

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});



app.get('/expenses/:expenseId', async (req, res) => {
  const { expenseId } = req.params;

  try {
    const expenseResult = await pool.query(
      `SELECT
         e.id,
         e.group_id,
         e.paid_by,
         u.name AS paid_by_name,
         e.amount,
         e.description,
         e.split_type,
         e.created_at
       FROM expenses e
       JOIN users u ON e.paid_by = u.id
       WHERE e.id = $1`,
      [expenseId]
    );

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Expense not found'
      });
    }

    const splitResult = await pool.query(
      `SELECT
         es.user_id,
         u.name AS user_name,
         es.share_amount
       FROM expense_splits es
       JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = $1
       ORDER BY es.user_id`,
      [expenseId]
    );

    res.json({
      expense: expenseResult.rows[0],
      splits: splitResult.rows
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});