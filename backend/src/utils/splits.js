// backend/src/utils/splits.js
// Complete implementation of all 6 Split Methods with deterministic paise remainder distribution

const { MAX_AMOUNT_PAISE, parsePaise, parseNonNegativePaise, parseSignedPaise } = require('./validators');

/**
 * 1. Equal Split
 * Divides total amount in paise equally among N participants.
 * Deterministically assigns 1 extra paisa to the first R participants (sorted by user ID ascending).
 * 
 * @param {number} totalPaise
 * @param {number[]} participantIds
 * @returns {Array<{ userId: number, sharePaise: number, shareValue: number|null, adjustmentPaise: number }>}
 */
function calculateEqualSplit(totalPaise, participantIds) {
  totalPaise = parsePaise(totalPaise, 'totalPaise');
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new Error('At least one participant is required for equal split');
  }
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  // Deterministic order: sort participant IDs ascending
  const sortedIds = [...new Set(participantIds.map(Number))].sort((a, b) => a - b);
  const n = sortedIds.length;
  const base = Math.floor(totalPaise / n);
  const remainder = totalPaise % n;

  return sortedIds.map((userId, index) => ({
    userId,
    sharePaise: index < remainder ? base + 1 : base,
    shareValue: null,
    adjustmentPaise: 0,
  }));
}

/**
 * 2. Exact Amounts Split
 * Validates that explicit participant amounts sum up exactly to totalPaise.
 * 
 * @param {number} totalPaise
 * @param {Array<{ userId: number, amountPaise: number }>} participants
 * @returns {Array<{ userId: number, sharePaise: number, shareValue: number|null, adjustmentPaise: number }>}
 */
function calculateExactSplit(totalPaise, participants) {
  totalPaise = parsePaise(totalPaise, 'totalPaise');
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('At least one participant is required for exact split');
  }
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  let runningSum = 0;
  const seenUsers = new Set();
  const result = [];

  for (const [index, p] of participants.entries()) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new Error(`participants[${index}]: must be an object. Expected an exact split participant.`);
    }
    const userId = Number(p.userId);
    if (Number(p.amountPaise) < 0) {
      const error = new Error(
        `participants[${index}].amountPaise: participant ${userId} cannot have a negative exact share. Expected an integer paise amount from 1 to ${MAX_AMOUNT_PAISE}.`
      );
      error.status = 400;
      throw error;
    }
    const sharePaise = parsePaise(p.amountPaise, `participants[${index}].amountPaise`);

    if (isNaN(userId) || isNaN(sharePaise)) {
      throw new Error('Invalid participant userId or amountPaise');
    }
    if (seenUsers.has(userId)) {
      throw new Error(`Duplicate participant detected: ${userId}`);
    }
    if (sharePaise < 0) {
      throw new Error(`Participant ${userId} cannot have a negative exact share`);
    }

    seenUsers.add(userId);
    runningSum += sharePaise;
    parseNonNegativePaise(runningSum, 'exact split amount sum');
    result.push({
      userId,
      sharePaise,
      shareValue: sharePaise,
      adjustmentPaise: 0,
    });
  }

  if (runningSum !== totalPaise) {
    const diff = (totalPaise - runningSum) / 100;
    throw new Error(
      `Exact split amounts sum (₹${(runningSum / 100).toFixed(2)}) does not match total amount (₹${(totalPaise / 100).toFixed(2)}). Difference: ₹${diff.toFixed(2)}`
    );
  }

  return result.sort((a, b) => a.userId - b.userId);
}

/**
 * 3. Percentage Split
 * Allocates shares based on percentage. Ensures sum of percentages equals 100.
 * Allocates base paise via floor, then awards remaining paise to participants
 * with highest fractional remainders (tie-broken by user ID ascending).
 * 
 * @param {number} totalPaise
 * @param {Array<{ userId: number, percentage: number }>} participants
 * @returns {Array<{ userId: number, sharePaise: number, shareValue: number, adjustmentPaise: number }>}
 */
function calculatePercentageSplit(totalPaise, participants) {
  totalPaise = parsePaise(totalPaise, 'totalPaise');
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('At least one participant is required for percentage split');
  }
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  const seenUsers = new Set();
  let totalPct = 0;

  for (const p of participants) {
    const userId = Number(p.userId);
    const pct = Number(p.percentage);
    if (isNaN(userId) || isNaN(pct)) {
      throw new Error('Invalid participant userId or percentage');
    }
    if (seenUsers.has(userId)) {
      throw new Error(`Duplicate participant detected: ${userId}`);
    }
    if (pct < 0) {
      throw new Error(`Percentage cannot be negative for user ${userId}`);
    }
    seenUsers.add(userId);
    totalPct += pct;
  }

  // Allow floating tolerance of 0.01%
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Percentages must sum to 100%. Current sum: ${totalPct.toFixed(2)}%`);
  }

  // Calculate base paise and fractional remainder
  const computed = participants.map((p) => {
    const userId = Number(p.userId);
    const pct = Number(p.percentage);
    const rawPaise = (totalPaise * pct) / 100;
    const basePaise = Math.floor(rawPaise);
    const fraction = rawPaise - basePaise;
    return {
      userId,
      percentage: pct,
      basePaise,
      fraction,
    };
  });

  const sumBase = computed.reduce((acc, c) => acc + c.basePaise, 0);
  const remainder = totalPaise - sumBase;

  // Sort by fraction descending, then userId ascending
  const sortedByPriority = [...computed].sort((a, b) => {
    if (Math.abs(b.fraction - a.fraction) > 0.000001) {
      return b.fraction - a.fraction;
    }
    return a.userId - b.userId;
  });

  const bonusUserIds = new Set(sortedByPriority.slice(0, remainder).map((c) => c.userId));

  const result = computed.map((c) => ({
    userId: c.userId,
    sharePaise: c.basePaise + (bonusUserIds.has(c.userId) ? 1 : 0),
    shareValue: c.percentage,
    adjustmentPaise: 0,
  }));

  return result.sort((a, b) => a.userId - b.userId);
}

/**
 * 4. Shares / Weights Split
 * Allocates shares based on proportional weights (e.g. 2 shares, 1 share).
 * Allocates base paise via floor, awards remainder paise to participants
 * with highest remainder from division.
 * 
 * @param {number} totalPaise
 * @param {Array<{ userId: number, shares: number }>} participants
 * @returns {Array<{ userId: number, sharePaise: number, shareValue: number, adjustmentPaise: number }>}
 */
function calculateSharesSplit(totalPaise, participants) {
  totalPaise = parsePaise(totalPaise, 'totalPaise');
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('At least one participant is required for shares split');
  }
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  const seenUsers = new Set();
  let totalShares = 0;

  for (const p of participants) {
    const userId = Number(p.userId);
    const shares = Number(p.shares);
    if (isNaN(userId) || isNaN(shares)) {
      throw new Error('Invalid participant userId or shares');
    }
    if (seenUsers.has(userId)) {
      throw new Error(`Duplicate participant detected: ${userId}`);
    }
    if (shares <= 0) {
      throw new Error(`Shares must be greater than 0 for user ${userId}`);
    }
    seenUsers.add(userId);
    totalShares += shares;
  }

  const computed = participants.map((p) => {
    const userId = Number(p.userId);
    const shares = Number(p.shares);
    const rawPaise = (totalPaise * shares) / totalShares;
    const basePaise = Math.floor(rawPaise);
    const fraction = rawPaise - basePaise;
    return {
      userId,
      shares,
      basePaise,
      fraction,
    };
  });

  const sumBase = computed.reduce((acc, c) => acc + c.basePaise, 0);
  const remainder = totalPaise - sumBase;

  const sortedByPriority = [...computed].sort((a, b) => {
    if (Math.abs(b.fraction - a.fraction) > 0.000001) {
      return b.fraction - a.fraction;
    }
    return a.userId - b.userId;
  });

  const bonusUserIds = new Set(sortedByPriority.slice(0, remainder).map((c) => c.userId));

  const result = computed.map((c) => ({
    userId: c.userId,
    sharePaise: c.basePaise + (bonusUserIds.has(c.userId) ? 1 : 0),
    shareValue: c.shares,
    adjustmentPaise: 0,
  }));

  return result.sort((a, b) => a.userId - b.userId);
}

/**
 * 5. Adjustment Split
 * Base split is equal split, with positive or negative adjustments applied.
 * Sum of adjustments is subtracted from total, remaining amount is split equally,
 * and individual adjustments added back.
 * 
 * @param {number} totalPaise
 * @param {Array<{ userId: number, adjustmentPaise: number }>} participants
 * @returns {Array<{ userId: number, sharePaise: number, shareValue: number|null, adjustmentPaise: number }>}
 */
function calculateAdjustmentSplit(totalPaise, participants) {
  totalPaise = parsePaise(totalPaise, 'totalPaise');
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('At least one participant is required for adjustment split');
  }
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  const seenUsers = new Set();
  let sumAdjustments = 0;

  for (const [index, p] of participants.entries()) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new Error(`participants[${index}]: must be an object. Expected an adjustment split participant.`);
    }
    const userId = Number(p.userId);
    const adj = p.adjustmentPaise === undefined ? 0 : parseSignedPaise(p.adjustmentPaise, `participants[${index}].adjustmentPaise`);
    if (isNaN(userId) || isNaN(adj)) {
      throw new Error('Invalid participant userId or adjustmentPaise');
    }
    if (seenUsers.has(userId)) {
      throw new Error(`Duplicate participant detected: ${userId}`);
    }
    seenUsers.add(userId);
    sumAdjustments += adj;
    if (!Number.isSafeInteger(sumAdjustments)) {
      throw new Error(`adjustmentPaise: combined value must be a safe integer. Expected an integer paise amount from -${MAX_AMOUNT_PAISE} to ${MAX_AMOUNT_PAISE}.`);
    }
  }

  const netDistributable = totalPaise - sumAdjustments;
  if (netDistributable < 0) {
    throw new Error(
      `Total adjustments (₹${(sumAdjustments / 100).toFixed(2)}) exceed total expense amount (₹${(totalPaise / 100).toFixed(2)})`
    );
  }

  const sortedParticipants = [...participants].sort((a, b) => Number(a.userId) - Number(b.userId));
  const n = sortedParticipants.length;
  const base = Math.floor(netDistributable / n);
  const remainder = netDistributable % n;

  const result = sortedParticipants.map((p, index) => {
    const userId = Number(p.userId);
    const adj = p.adjustmentPaise === undefined ? 0 : parseSignedPaise(p.adjustmentPaise, 'adjustmentPaise');
    const baseShare = index < remainder ? base + 1 : base;
    const finalShare = baseShare + adj;

    parseNonNegativePaise(finalShare, `participants[${index}].sharePaise`);

    if (finalShare < 0) {
      throw new Error(`Adjustment for user ${userId} results in a negative final share: ₹${(finalShare / 100).toFixed(2)}`);
    }

    return {
      userId,
      sharePaise: finalShare,
      shareValue: null,
      adjustmentPaise: adj,
    };
  });

  return result;
}

/**
 * 6. Itemized Split
 * Itemized expenses with individual items assigned to subsets of members,
 * plus shared tax/fees/discounts distributed proportionally to each member's item subtotal.
 * 
 * @param {number} totalPaise
 * @param {Array<{ name: string, amountPaise: number, assignedUserIds: number[] }>} items
 * @param {number} sharedTaxPaise - Additional fees/tax/delivery
 * @param {number[]} allParticipantIds - Full list of group members or participating users
 * @returns {Array<{ userId: number, sharePaise: number, shareValue: number|null, adjustmentPaise: number }>}
 */
function calculateItemizedSplit(totalPaise, items, sharedTaxPaise = 0, allParticipantIds = []) {
  totalPaise = parsePaise(totalPaise, 'totalPaise');
  sharedTaxPaise = parseNonNegativePaise(sharedTaxPaise, 'sharedTaxPaise');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one item is required for itemized split');
  }
  if (totalPaise <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  const userItemShares = {};

  // Accumulate member item shares
  let itemsTotalPaise = 0;
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`items[${index}]: must be an object. Expected an item with an integer paise amount.`);
    }
    const itemAmount = parsePaise(item.amountPaise, `items[${index}].amountPaise`);
    if (!Array.isArray(item.assignedUserIds) || item.assignedUserIds.length === 0) {
      throw new Error(`Item "${item.name}" must be assigned to at least one user`);
    }

    itemsTotalPaise += itemAmount;
    parseNonNegativePaise(itemsTotalPaise, 'item amount sum');

    // Split item amount equally among its assigned users
    const itemShares = calculateEqualSplit(itemAmount, item.assignedUserIds);
    for (const is of itemShares) {
      userItemShares[is.userId] = (userItemShares[is.userId] || 0) + is.sharePaise;
    }
  }

  // Calculate actual shared tax/fee/discrepancy to reach totalPaise
  const remainingTaxFee = totalPaise - itemsTotalPaise;
  if (remainingTaxFee < 0) {
    throw new Error(
      `Sum of items (₹${(itemsTotalPaise / 100).toFixed(2)}) exceeds total expense amount (₹${(totalPaise / 100).toFixed(2)})`
    );
  }

  // Determine all participants involved
  const activeUserIds = Object.keys(userItemShares).map(Number);
  const participantSet = new Set([...activeUserIds, ...(allParticipantIds || []).map(Number)]);
  const participantList = [...participantSet].sort((a, b) => a - b);

  // Distribute remaining tax/fees proportionally to each user's item share
  let taxShares = {};
  if (remainingTaxFee > 0) {
    if (itemsTotalPaise > 0) {
      // Proportional to item share
      const sharesInput = participantList.map((uid) => ({
        userId: uid,
        shares: (userItemShares[uid] || 0) > 0 ? userItemShares[uid] : 0,
      }));

      // If everyone had 0 item shares (edge case), split equally
      const totalItemWeights = sharesInput.reduce((acc, s) => acc + s.shares, 0);
      if (totalItemWeights === 0) {
        const equalTax = calculateEqualSplit(remainingTaxFee, participantList);
        for (const t of equalTax) {
          taxShares[t.userId] = t.sharePaise;
        }
      } else {
        // Proportional shares
        const propTax = calculateSharesSplit(remainingTaxFee, sharesInput.filter(s => s.shares > 0));
        for (const t of propTax) {
          taxShares[t.userId] = t.sharePaise;
        }
      }
    } else {
      // Equal tax distribution
      const equalTax = calculateEqualSplit(remainingTaxFee, participantList);
      for (const t of equalTax) {
        taxShares[t.userId] = t.sharePaise;
      }
    }
  }

  const result = participantList.map((userId) => {
    const itemShare = userItemShares[userId] || 0;
    const taxShare = taxShares[userId] || 0;
    return {
      userId,
      sharePaise: itemShare + taxShare,
      shareValue: itemShare,
      adjustmentPaise: taxShare,
    };
  }).filter((p) => p.sharePaise > 0);

  return result.sort((a, b) => a.userId - b.userId);
}

/**
 * Master dispatcher for all split methods
 * @param {string} splitType - 'equal'|'exact'|'percentage'|'shares'|'adjustment'|'itemized'
 * @param {number} totalPaise
 * @param {any} splitData
 * @param {number[]} fallbackMemberIds
 */
function calculateSplit(splitType, totalPaise, splitData, fallbackMemberIds = []) {
  switch (splitType) {
    case 'equal': {
      const ids = Array.isArray(splitData) && splitData.length > 0 ? splitData : fallbackMemberIds;
      return calculateEqualSplit(totalPaise, ids);
    }
    case 'exact':
      return calculateExactSplit(totalPaise, splitData);
    case 'percentage':
      return calculatePercentageSplit(totalPaise, splitData);
    case 'shares':
      return calculateSharesSplit(totalPaise, splitData);
    case 'adjustment':
      return calculateAdjustmentSplit(totalPaise, splitData);
    case 'itemized':
      return calculateItemizedSplit(
        totalPaise,
        splitData.items,
        splitData.sharedTaxPaise || 0,
        fallbackMemberIds
      );
    default:
      throw new Error(`Unknown split type: ${splitType}`);
  }
}

module.exports = {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  calculateSharesSplit,
  calculateAdjustmentSplit,
  calculateItemizedSplit,
  calculateSplit,
};
