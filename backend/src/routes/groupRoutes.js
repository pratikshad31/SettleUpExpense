// backend/src/routes/groupRoutes.js
// Groups and group-scoped endpoints

const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const expenseController = require('../controllers/expenseController');
const settlementController = require('../controllers/settlementController');
const balanceController = require('../controllers/balanceController');
const activityController = require('../controllers/activityController');
const { authenticate } = require('../middleware/auth');
const { requireGroupMember, requireGroupAdmin } = require('../middleware/groupAuth');
const { idempotency } = require('../middleware/idempotency');

// All group routes require authentication
router.use(authenticate);

// Top-level group operations
router.post('/', groupController.createGroup);
router.get('/', groupController.getUserGroups);
router.post('/join', groupController.joinGroupByInviteCode);

// Specific group details and membership
router.get('/:groupId', requireGroupMember, groupController.getGroupDetails);
router.post('/:groupId/members', requireGroupAdmin, groupController.addMember);
router.put('/:groupId/members/:userId/role', requireGroupAdmin, groupController.updateMemberRole);
router.post('/:groupId/leave', requireGroupMember, groupController.leaveGroup);

// Expenses scoped to group
router.get('/:groupId/expenses', requireGroupMember, expenseController.getGroupExpenses);
router.post('/:groupId/expenses', requireGroupMember, expenseController.createExpense);

// Balances, debts, and settlement suggestions
router.get('/:groupId/balances', requireGroupMember, balanceController.getGroupBalances);
router.get('/:groupId/debts', requireGroupMember, balanceController.getGroupDebts);

// Settlements scoped to group
router.get('/:groupId/settlements', requireGroupMember, settlementController.getGroupSettlements);
router.post('/:groupId/settlements', requireGroupMember, idempotency(), settlementController.createSettlement);

// Activity logs scoped to group
router.get('/:groupId/activity', requireGroupMember, activityController.getGroupActivity);

module.exports = router;
