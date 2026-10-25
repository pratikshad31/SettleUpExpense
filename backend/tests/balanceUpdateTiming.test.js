// backend/tests/balanceUpdateTiming.test.js
// Verifies that balances only update when a settlement is CONFIRMED, never on PENDING or REJECTED.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db');
const { seed } = require('../src/database/seed');

describe('Balance Update Lifecycle & Timing Tests', () => {
  let aaravToken;
  let priyaToken;
  let groupId;

  before(async () => {
    await seed();

    // Login as Aarav (user 1)
    const aaravLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'aarav@example.com', password: 'password123' });
    assert.strictEqual(aaravLogin.status, 200);
    aaravToken = aaravLogin.body.token;

    // Login as Priya (user 2)
    const priyaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'priya@example.com', password: 'password123' });
    assert.strictEqual(priyaLogin.status, 200);
    priyaToken = priyaLogin.body.token;

    // Get Flat 402 Indiranagar group
    const grpRes = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${aaravToken}`);
    assert.strictEqual(grpRes.status, 200);
    groupId = grpRes.body.groups[0].id;
  });

  after(async () => {
    await pool.end();
  });

  it('balances do NOT change when payment is recorded (PENDING) or REJECTED, only on CONFIRMED', async () => {
    // 1. Get baseline balances
    const initialBalRes = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set('Authorization', `Bearer ${aaravToken}`);
    assert.strictEqual(initialBalRes.status, 200);

    const initialBalances = initialBalRes.body.balances;
    const aaravInitial = initialBalances.find((b) => b.userId === 1)?.netBalancePaise || 0;
    const priyaInitial = initialBalances.find((b) => b.userId === 2)?.netBalancePaise || 0;

    // 2. Aarav records a payment of ₹100 (10000 paise) to Priya
    const payAmountPaise = 10000;
    const createRes = await request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({
        fromUser: 1,
        toUser: 2,
        amountPaise: payAmountPaise,
        paymentMethod: 'upi',
        status: 'pending',
        notes: 'Timing test payment',
      });

    assert.strictEqual(createRes.status, 201);
    const settlementId = createRes.body.settlement.id;
    assert.strictEqual(createRes.body.settlement.status, 'pending');

    // 3. VERIFY: Balances MUST NOT change when status is PENDING!
    const pendingBalRes = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set('Authorization', `Bearer ${aaravToken}`);
    assert.strictEqual(pendingBalRes.status, 200);

    const aaravPending = pendingBalRes.body.balances.find((b) => b.userId === 1)?.netBalancePaise || 0;
    const priyaPending = pendingBalRes.body.balances.find((b) => b.userId === 2)?.netBalancePaise || 0;

    assert.strictEqual(aaravPending, aaravInitial, 'Aarav balance must not change on PENDING payment');
    assert.strictEqual(priyaPending, priyaInitial, 'Priya balance must not change on PENDING payment');

    // 4. Priya REJECTS the payment
    const rejectRes = await request(app)
      .post(`/api/settlements/${settlementId}/reject`)
      .set('Authorization', `Bearer ${priyaToken}`)
      .send({ reason: 'Did not receive in bank account' });

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.settlement.status, 'rejected');

    // 5. VERIFY: Balances MUST NOT change when status is REJECTED!
    const rejectedBalRes = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set('Authorization', `Bearer ${aaravToken}`);
    assert.strictEqual(rejectedBalRes.status, 200);

    const aaravRejected = rejectedBalRes.body.balances.find((b) => b.userId === 1)?.netBalancePaise || 0;
    const priyaRejected = rejectedBalRes.body.balances.find((b) => b.userId === 2)?.netBalancePaise || 0;

    assert.strictEqual(aaravRejected, aaravInitial, 'Aarav balance must remain unchanged after REJECT');
    assert.strictEqual(priyaRejected, priyaInitial, 'Priya balance must remain unchanged after REJECT');

    // 6. Aarav records the payment again
    const createRes2 = await request(app)
      .post(`/api/groups/${groupId}/settlements`)
      .set('Authorization', `Bearer ${aaravToken}`)
      .send({
        fromUser: 1,
        toUser: 2,
        amountPaise: payAmountPaise,
        paymentMethod: 'upi',
        status: 'pending',
        notes: 'Retry payment',
      });

    assert.strictEqual(createRes2.status, 201);
    const settlementId2 = createRes2.body.settlement.id;
    assert.strictEqual(createRes2.body.settlement.status, 'pending');

    // 7. Priya CONFIRMS the payment
    const confirmRes = await request(app)
      .post(`/api/settlements/${settlementId2}/confirm`)
      .set('Authorization', `Bearer ${priyaToken}`);

    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.settlement.status, 'confirmed');

    // 8. VERIFY: ONLY NOW balances MUST update!
    const confirmedBalRes = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set('Authorization', `Bearer ${aaravToken}`);
    assert.strictEqual(confirmedBalRes.status, 200);

    const aaravConfirmed = confirmedBalRes.body.balances.find((b) => b.userId === 1)?.netBalancePaise || 0;
    const priyaConfirmed = confirmedBalRes.body.balances.find((b) => b.userId === 2)?.netBalancePaise || 0;

    // Aarav paid Priya payAmountPaise:
    // Aarav's balance increases by payAmountPaise (+10000) (less negative or more positive)
    // Priya's balance decreases by payAmountPaise (-10000)
    assert.strictEqual(aaravConfirmed, aaravInitial + payAmountPaise, 'Aarav net balance must increase by payAmountPaise on CONFIRMED');
    assert.strictEqual(priyaConfirmed, priyaInitial - payAmountPaise, 'Priya net balance must decrease by payAmountPaise on CONFIRMED');
  });
});
