// frontend/src/components/ExpenseModal.jsx
// Interactive expense creation and editing modal supporting all 6 split methods and multiple payers

import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Plus, Trash2, Users, IndianRupee, AlertCircle, CheckCircle2 } from 'lucide-react';
import { inrToPaise, formatINR } from '../utils/formatters';

const CATEGORIES = [
  'General',
  'Food & Dining',
  'Groceries',
  'Utilities',
  'Travel & Accommodation',
  'Entertainment',
  'Rent',
  'Shopping',
  'Other',
];

// Format a date as YYYY-MM-DD for a <input type="date"> using the user's LOCAL timezone.
// expense_date is a DATE column that serialises as the previous UTC day (for IST,
// 2026-10-18 becomes "2026-10-17T18:30:00.000Z"), so slicing the ISO string shifted
// every edited expense back by one day.
function toLocalDateInputValue(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The part of the expense total the items do not cover, as an INR string for an input.
function remainderToINR(totalPaise, itemsSumPaise) {
  const remainder = totalPaise - itemsSumPaise;
  return remainder > 0 ? (remainder / 100).toString() : '0';
}

export default function ExpenseModal({ isOpen, onClose, onSave, groupMembers, editExpense = null }) {
  const [description, setDescription] = useState('');
  const [amountINR, setAmountINR] = useState('');
  const [category, setCategory] = useState('General');
  const [expenseDate, setExpenseDate] = useState(toLocalDateInputValue(new Date()));
  const [notes, setNotes] = useState('');
  const [editReason, setEditReason] = useState('Updated expense');

  // Payers State
  const [isMultiplePayers, setIsMultiplePayers] = useState(false);
  const [singlePayerId, setSinglePayerId] = useState('');
  const [payerAmounts, setPayerAmounts] = useState({}); // { [userId]: inrString }

  // Split Type State
  const [splitType, setSplitType] = useState('equal');
  const [selectedParticipants, setSelectedParticipants] = useState([]); // [userId]
  const [exactShares, setExactShares] = useState({}); // { [userId]: inrString }
  const [percentages, setPercentages] = useState({}); // { [userId]: percentString }
  const [shares, setShares] = useState({}); // { [userId]: shareNumberString }
  const [adjustments, setAdjustments] = useState({}); // { [userId]: inrString }

  // Itemized State
  const [items, setItems] = useState([
    { name: '', amountINR: '', assignedUserIds: [] },
  ]);
  // Shared tax / delivery fee for itemized splits. Items may legitimately sum to less
  // than the expense total (see seed.js expense 6: items 2150 + shared tax 200 = 2350);
  // backend utils/splits.js distributes that remainder across participants. null = derive
  // from the unallocated remainder; a string = the user's own value.
  const [sharedTaxOverride, setSharedTaxOverride] = useState(null);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize or populate when opened
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSharedTaxOverride(null);

    const defaultMemberIds = (groupMembers || []).map((m) => Number(m.user_id));

    if (editExpense) {
      setDescription(editExpense.description);
      setAmountINR((Number(editExpense.total_amount_paise) / 100).toString());
      setCategory(editExpense.category || 'General');
      setExpenseDate(editExpense.expense_date ? toLocalDateInputValue(editExpense.expense_date) : '');
      setNotes(editExpense.notes || '');
      setSplitType(editExpense.split_type || 'equal');

      // Payers
      const pList = editExpense.payers || [];
      if (pList.length > 1) {
        setIsMultiplePayers(true);
        const map = {};
        let maxPaise = -1;
        let primaryPayer = '';
        pList.forEach((p) => {
          const paise = Number(p.amountPaise);
          map[p.userId] = (paise / 100).toString();
          if (paise > maxPaise) {
            maxPaise = paise;
            primaryPayer = p.userId.toString();
          }
        });
        setPayerAmounts(map);
        if (primaryPayer) setSinglePayerId(primaryPayer);
      } else if (pList.length === 1) {
        setIsMultiplePayers(false);
        const singleId = pList[0].userId.toString();
        setSinglePayerId(singleId);
        const map = {};
        (groupMembers || []).forEach((m) => {
          map[m.user_id] =
            m.user_id.toString() === singleId
              ? (Number(pList[0].amountPaise) / 100).toString()
              : '';
        });
        setPayerAmounts(map);
      } else {
        setIsMultiplePayers(false);
        if (groupMembers && groupMembers.length > 0) {
          setSinglePayerId(groupMembers[0].user_id.toString());
        }
      }

      // Participants
      const partList = editExpense.participants || [];
      const partIds = partList.map((pt) => pt.userId);
      setSelectedParticipants(partIds);

      if (editExpense.split_type === 'exact') {
        const exactMap = {};
        partList.forEach((pt) => {
          exactMap[pt.userId] = (Number(pt.shareAmountPaise) / 100).toString();
        });
        setExactShares(exactMap);
      } else if (editExpense.split_type === 'percentage') {
        const pctMap = {};
        partList.forEach((pt) => {
          pctMap[pt.userId] = (Number(pt.shareValue) || 0).toString();
        });
        setPercentages(pctMap);
      } else if (editExpense.split_type === 'shares') {
        const shMap = {};
        partList.forEach((pt) => {
          shMap[pt.userId] = (Number(pt.shareValue) || 1).toString();
        });
        setShares(shMap);
      } else if (editExpense.split_type === 'adjustment') {
        const adjMap = {};
        partList.forEach((pt) => {
          adjMap[pt.userId] = (Number(pt.adjustmentPaise || 0) / 100).toString();
        });
        setAdjustments(adjMap);
      }

      if (editExpense.split_type === 'itemized' && editExpense.items && editExpense.items.length > 0) {
        setItems(
          editExpense.items.map((it) => ({
            name: it.name || '',
            amountINR: (Number(it.amountPaise) / 100).toString(),
            assignedUserIds:
              it.assignedUserIds && it.assignedUserIds.length > 0
                ? it.assignedUserIds.map(Number)
                : defaultMemberIds,
          }))
        );
      } else {
        setItems([
          { name: '', amountINR: '', assignedUserIds: defaultMemberIds },
        ]);
      }
    } else {
      // Default creation state
      setDescription('');
      setAmountINR('');
      setCategory('General');
      setNotes('');
      setExpenseDate(toLocalDateInputValue(new Date()));
      setSplitType('equal');
      setIsMultiplePayers(false);

      if (groupMembers && groupMembers.length > 0) {
        setSinglePayerId(groupMembers[0].user_id.toString());
        setSelectedParticipants(groupMembers.map((m) => m.user_id));

        const initialMap = {};
        groupMembers.forEach((m) => {
          initialMap[m.user_id] = '';
        });
        setPayerAmounts(initialMap);
        setExactShares(initialMap);

        const initialPct = {};
        const evenPct = (100 / groupMembers.length).toFixed(2);
        groupMembers.forEach((m) => {
          initialPct[m.user_id] = evenPct;
        });
        setPercentages(initialPct);

        const initialShares = {};
        groupMembers.forEach((m) => {
          initialShares[m.user_id] = '1';
        });
        setShares(initialShares);

        const initialAdj = {};
        groupMembers.forEach((m) => {
          initialAdj[m.user_id] = '0';
        });
        setAdjustments(initialAdj);

        setItems([
          { name: '', amountINR: '', assignedUserIds: groupMembers.map((m) => m.user_id) },
        ]);
      }
    }
  }, [isOpen, editExpense, groupMembers]);

  const totalPaise = inrToPaise(amountINR);

  // Derived during render rather than synced in an effect: whatever the items do not
  // cover is the shared tax/fee — exactly the rule backend utils/splits.js applies —
  // so editing an item amount updates it immediately with no cascading render. The
  // user's own typed value takes precedence until the modal is reopened.
  const autoSharedTaxINR =
    splitType === 'itemized' && totalPaise > 0
      ? remainderToINR(
          totalPaise,
          items.reduce((acc, it) => acc + inrToPaise(it.amountINR), 0)
        )
      : '0';
  const sharedTaxINR = sharedTaxOverride ?? autoSharedTaxINR;

  // Payer calculation
  const totalAssignedPayersPaise = isMultiplePayers
    ? Object.values(payerAmounts).reduce((acc, val) => acc + inrToPaise(val), 0)
    : totalPaise;
  const payerDifferencePaise = totalPaise - totalAssignedPayersPaise;

  // Split calculation & validations
  let splitValidation = { valid: true, message: '', diffPaise: 0 };

  if (splitType === 'equal') {
    if (selectedParticipants.length === 0) {
      splitValidation = { valid: false, message: 'Select at least one participant' };
    }
  } else if (splitType === 'exact') {
    const sumExactPaise = selectedParticipants.reduce(
      (acc, uid) => acc + inrToPaise(exactShares[uid] || 0),
      0
    );
    const diff = totalPaise - sumExactPaise;
    splitValidation = {
      valid: totalPaise > 0 && diff === 0,
      diffPaise: diff,
      message:
        diff === 0
          ? 'Exact shares equal total'
          : diff > 0
          ? `₹${(diff / 100).toFixed(2)} left to assign`
          : `₹${(Math.abs(diff) / 100).toFixed(2)} over allocated`,
    };
  } else if (splitType === 'percentage') {
    const sumPct = selectedParticipants.reduce(
      (acc, uid) => acc + (parseFloat(percentages[uid]) || 0),
      0
    );
    const diff = 100 - sumPct;
    splitValidation = {
      valid: Math.abs(diff) < 0.05,
      diffPaise: 0,
      message:
        Math.abs(diff) < 0.05
          ? 'Percentages sum to 100%'
          : diff > 0
          ? `${diff.toFixed(1)}% remaining to reach 100%`
          : `${Math.abs(diff).toFixed(1)}% over 100%`,
    };
  } else if (splitType === 'shares') {
    const sumShares = selectedParticipants.reduce(
      (acc, uid) => acc + (parseFloat(shares[uid]) || 0),
      0
    );
    splitValidation = {
      valid: sumShares > 0,
      message: sumShares > 0 ? `Total: ${sumShares} shares` : 'Enter shares (>0)',
    };
  } else if (splitType === 'adjustment') {
    const sumAdjPaise = selectedParticipants.reduce(
      (acc, uid) => acc + inrToPaise(adjustments[uid] || 0),
      0
    );
    splitValidation = {
      valid: totalPaise >= sumAdjPaise,
      message:
        totalPaise >= sumAdjPaise
          ? `Sum of adjustments: ₹${(sumAdjPaise / 100).toFixed(2)}`
          : `Adjustments exceed total amount`,
    };
  } else if (splitType === 'itemized') {
    const sumItemsPaise = items.reduce((acc, it) => acc + inrToPaise(it.amountINR), 0);
    const sharedTaxPaise = inrToPaise(sharedTaxINR);
    const diff = totalPaise - (sumItemsPaise + sharedTaxPaise);
    splitValidation = {
      valid: totalPaise > 0 && items.length > 0 && sharedTaxPaise >= 0 && diff === 0,
      diffPaise: diff,
      message:
        sharedTaxPaise < 0
          ? 'Shared tax / fee cannot be negative'
          : diff === 0
          ? sharedTaxPaise > 0
            ? `Items + shared tax of ₹${(sharedTaxPaise / 100).toFixed(2)} equal the total`
            : 'Itemized total matches expense total'
          : diff > 0
          ? `₹${(diff / 100).toFixed(2)} remaining to assign`
          : `₹${(Math.abs(diff) / 100).toFixed(2)} over total`,
    };
  }

  const toggleParticipant = (userId) => {
    setSelectedParticipants((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        name: '',
        amountINR: '',
        assignedUserIds: (groupMembers || []).map((m) => Number(m.user_id)),
      },
    ]);
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index][field] = value;
      return copy;
    });
  };

  const toggleItemUser = (itemIndex, userId) => {
    const targetId = Number(userId);
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== itemIndex) return item;
        const currentList = (item.assignedUserIds || []).map(Number);
        const exists = currentList.includes(targetId);
        const updatedList = exists
          ? currentList.filter((id) => id !== targetId)
          : [...currentList, targetId];

        return {
          ...item,
          assignedUserIds: updatedList,
        };
      })
    );
  };

  // Payer synchronization & helper actions
  const handleAmountChange = (val) => {
    setAmountINR(val);
    if (!isMultiplePayers && singlePayerId) {
      setPayerAmounts((prev) => ({
        ...prev,
        [singlePayerId]: val,
      }));
    }
  };

  const handleSinglePayerChange = (userId) => {
    const strId = userId.toString();
    setSinglePayerId(strId);
    const updated = {};
    (groupMembers || []).forEach((m) => {
      updated[m.user_id] = m.user_id.toString() === strId ? amountINR : '';
    });
    setPayerAmounts(updated);
  };

  const handlePayerModeChange = (targetMultiple) => {
    if (targetMultiple === isMultiplePayers) return;

    if (targetMultiple) {
      // Single -> Multiple: carry over current single payer amount
      const currentSumPaise = Object.values(payerAmounts).reduce(
        (acc, val) => acc + inrToPaise(val),
        0
      );
      const targetPaise = inrToPaise(amountINR);

      if (currentSumPaise !== targetPaise && targetPaise > 0) {
        const updated = {};
        (groupMembers || []).forEach((m) => {
          updated[m.user_id] =
            m.user_id.toString() === singlePayerId.toString() ? amountINR : '';
        });
        setPayerAmounts(updated);
      }
      setIsMultiplePayers(true);
    } else {
      // Multiple -> Single: select highest contributor as single payer
      let bestPayerId = singlePayerId;
      let maxPaise = -1;

      Object.entries(payerAmounts).forEach(([uid, amt]) => {
        const p = inrToPaise(amt);
        if (p > maxPaise && p > 0) {
          maxPaise = p;
          bestPayerId = uid.toString();
        }
      });

      if (bestPayerId) {
        setSinglePayerId(bestPayerId.toString());
        const updated = {};
        (groupMembers || []).forEach((m) => {
          updated[m.user_id] =
            m.user_id.toString() === bestPayerId.toString() ? amountINR : '';
        });
        setPayerAmounts(updated);
      }
      setIsMultiplePayers(false);
    }
  };

  const handleSplitPayerEqually = () => {
    if (totalPaise <= 0 || !groupMembers || groupMembers.length === 0) return;
    const count = groupMembers.length;
    const basePaise = Math.floor(totalPaise / count);
    let remainder = totalPaise % count;

    const updated = {};
    groupMembers.forEach((m) => {
      const share = basePaise + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      updated[m.user_id] = (share / 100).toFixed(2);
    });
    setPayerAmounts(updated);
  };

  const handleSetPayerFull = (userId) => {
    if (!amountINR || Number(amountINR) <= 0) return;
    const targetId = userId.toString();
    const updated = {};
    (groupMembers || []).forEach((m) => {
      updated[m.user_id] = m.user_id.toString() === targetId ? amountINR : '';
    });
    setPayerAmounts(updated);
  };

  const handleFillRemainingPayer = (userId) => {
    if (payerDifferencePaise <= 0) return;
    const currentPaise = inrToPaise(payerAmounts[userId] || 0);
    const newPaise = currentPaise + payerDifferencePaise;
    setPayerAmounts((prev) => ({
      ...prev,
      [userId]: (newPaise / 100).toFixed(2),
    }));
  };

  const handleClearPayers = () => {
    const updated = {};
    (groupMembers || []).forEach((m) => {
      updated[m.user_id] = '';
    });
    setPayerAmounts(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }
    if (totalPaise <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    // Payer validation
    let payloadPayers = [];
    if (isMultiplePayers) {
      if (payerDifferencePaise !== 0) {
        setError(`Payer contributions do not match total amount (Difference: ₹${(payerDifferencePaise / 100).toFixed(2)})`);
        return;
      }
      payloadPayers = Object.entries(payerAmounts)
        .filter(([_, amt]) => inrToPaise(amt) > 0)
        .map(([uid, amt]) => ({
          userId: Number(uid),
          amountPaise: inrToPaise(amt),
        }));
    } else {
      payloadPayers = [
        {
          userId: Number(singlePayerId),
          amountPaise: totalPaise,
        },
      ];
    }

    // Split payload formatting
    let payloadSplitData = null;
    let payloadParticipantIds = selectedParticipants;

    if (splitType === 'equal') {
      payloadSplitData = selectedParticipants;
    } else if (splitType === 'exact') {
      if (!splitValidation.valid) {
        setError(splitValidation.message);
        return;
      }
      payloadSplitData = selectedParticipants.map((uid) => ({
        userId: uid,
        amountPaise: inrToPaise(exactShares[uid] || 0),
      }));
    } else if (splitType === 'percentage') {
      if (!splitValidation.valid) {
        setError(splitValidation.message);
        return;
      }
      payloadSplitData = selectedParticipants.map((uid) => ({
        userId: uid,
        percentage: parseFloat(percentages[uid]) || 0,
      }));
    } else if (splitType === 'shares') {
      payloadSplitData = selectedParticipants.map((uid) => ({
        userId: uid,
        shares: parseFloat(shares[uid]) || 1,
      }));
    } else if (splitType === 'adjustment') {
      payloadSplitData = selectedParticipants.map((uid) => ({
        userId: uid,
        adjustmentPaise: inrToPaise(adjustments[uid] || 0),
      }));
    } else if (splitType === 'itemized') {
      if (!splitValidation.valid) {
        setError(splitValidation.message);
        return;
      }
      payloadSplitData = {
        items: items.map((it) => ({
          name: it.name.trim() || 'Item',
          amountPaise: inrToPaise(it.amountINR),
          assignedUserIds:
            it.assignedUserIds && it.assignedUserIds.length > 0
              ? it.assignedUserIds.map(Number)
              : (groupMembers || []).map((m) => Number(m.user_id)),
        })),
        sharedTaxPaise: inrToPaise(sharedTaxINR),
      };
    }

    try {
      setSubmitting(true);
      await onSave({
        description: description.trim(),
        amountPaise: totalPaise,
        category,
        expenseDate,
        notes,
        splitType,
        payers: payloadPayers,
        splitData: payloadSplitData,
        participantIds: payloadParticipantIds,
        items: splitType === 'itemized' ? payloadSplitData.items : undefined,
        reason: editReason,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  // Why the submit button is (or is not) clickable — surfaced in the footer so a
  // disabled button never silently swallows the click.
  const payerBlocked = isMultiplePayers && payerDifferencePaise !== 0;
  const submitBlocked = !splitValidation.valid || payerBlocked;
  const blockedReason = !splitValidation.valid
    ? splitValidation.message
    : `Payer contributions do not match the total (difference ₹${(Math.abs(payerDifferencePaise) / 100).toFixed(2)})`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editExpense ? 'Edit Expense' : 'Add New Expense'}
      maxWidth={680}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
        <div className="modal-body" style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Basic Details */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Description *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Swiggy Dinner, Groceries, WiFi"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="0.00"
                value={amountINR}
                onChange={(e) => handleAmountChange(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Expense Date</label>
              <input
                type="date"
                className="form-input"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          {/* Section: Notes */}
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              rows="3"
              placeholder="Optional — receipt link, context, or how the split was agreed"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="form-helper">Visible to everyone in the group. Leave blank for none.</div>
          </div>

          {/* Section: Who Paid? */}
          <div style={{ marginTop: 14, marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                Paid By
              </label>

              {/* Segmented Mode Selector */}
              <div
                style={{
                  display: 'inline-flex',
                  background: 'var(--bg-subtle)',
                  padding: 3,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  className={`btn btn-sm ${!isMultiplePayers ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handlePayerModeChange(false)}
                  style={{
                    border: 'none',
                    boxShadow: !isMultiplePayers ? 'var(--shadow-sm)' : 'none',
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: !isMultiplePayers ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  👤 Single Payer
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${isMultiplePayers ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handlePayerModeChange(true)}
                  style={{
                    border: 'none',
                    boxShadow: isMultiplePayers ? 'var(--shadow-sm)' : 'none',
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: isMultiplePayers ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  👥 Multiple Payers
                </button>
              </div>
            </div>

            {!isMultiplePayers ? (
              <div>
                <select
                  className="form-select"
                  value={singlePayerId}
                  onChange={(e) => handleSinglePayerChange(e.target.value)}
                  style={{ marginBottom: 8 }}
                >
                  {groupMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>

                {/* Quick Member Selection Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {groupMembers.map((m) => {
                    const isSelected = singlePayerId.toString() === m.user_id.toString();
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => handleSinglePayerChange(m.user_id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          border: isSelected
                            ? '1px solid var(--primary)'
                            : '1px solid var(--border-light)',
                          background: isSelected ? 'var(--primary)' : 'var(--bg-card)',
                          color: isSelected ? '#ffffff' : 'var(--text-main)',
                          fontWeight: isSelected ? 600 : 400,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem' }}>{isSelected ? '✓' : '👤'}</span>
                        <span>{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  padding: 12,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                }}
              >
                {/* Multiple Payers Toolbar */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: '1px solid var(--border-light)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleSplitPayerEqually}
                      title="Split total amount equally across all members"
                      style={{ fontSize: '0.775rem', padding: '3px 8px' }}
                    >
                      ⚖️ Split Equally
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleClearPayers}
                      title="Clear all contributions"
                      style={{ fontSize: '0.775rem', padding: '3px 8px' }}
                    >
                      Clear All
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: '0.825rem',
                      fontWeight: 700,
                      color:
                        payerDifferencePaise === 0 ? 'var(--primary-dark)' : 'var(--danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {payerDifferencePaise === 0
                      ? '✓ Matched total'
                      : `₹${(Math.abs(payerDifferencePaise) / 100).toFixed(2)} ${
                          payerDifferencePaise > 0 ? 'remaining' : 'over'
                        }`}
                  </div>
                </div>

                {/* Member Contribution Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {groupMembers.map((m) => {
                    const currentPaise = inrToPaise(payerAmounts[m.user_id] || 0);
                    const isPaying = currentPaise > 0;
                    return (
                      <div
                        key={m.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: isPaying ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 600,
                              color: 'var(--text-main)',
                            }}
                          >
                            {m.name}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {m.email}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {payerDifferencePaise > 0 && currentPaise === 0 && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleFillRemainingPayer(m.user_id)}
                              title="Fill remaining amount for this member"
                              style={{
                                fontSize: '0.725rem',
                                padding: '2px 6px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              + ₹{(payerDifferencePaise / 100).toFixed(2)}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => handleSetPayerFull(m.user_id)}
                            title="Mark as paid full amount"
                            style={{
                              fontSize: '0.725rem',
                              padding: '2px 6px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Paid Full
                          </button>

                          <div style={{ width: 110 }}>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="form-input"
                              placeholder="₹0.00"
                              value={payerAmounts[m.user_id] || ''}
                              onChange={(e) =>
                                setPayerAmounts({
                                  ...payerAmounts,
                                  [m.user_id]: e.target.value,
                                })
                              }
                              style={{
                                textAlign: 'right',
                                padding: '5px 8px',
                                fontSize: '0.85rem',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section: Split Method Selector */}
          <div style={{ marginTop: 16 }}>
            <label className="form-label">Split Method</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { id: 'equal', label: '1. Equal' },
                { id: 'exact', label: '2. Exact' },
                { id: 'percentage', label: '3. Percentage' },
                { id: 'itemized', label: '4. Itemized' },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`btn ${splitType === m.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSplitType(m.id)}
                  style={{ fontSize: '0.825rem', padding: '6px 8px' }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Live Indicator */}
            {totalPaise > 0 && splitType !== 'equal' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 12,
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  background: splitValidation.valid ? 'var(--success-light)' : 'var(--warning-light)',
                  color: splitValidation.valid ? 'var(--primary-dark)' : 'var(--warning)',
                }}
              >
                {splitValidation.valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{splitValidation.message}</span>
              </div>
            )}

            {/* Split Content per Type */}
            {splitType === 'equal' && (
              <div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Split equally among {selectedParticipants.length} member(s) (approx. ₹
                  {selectedParticipants.length > 0 && totalPaise > 0
                    ? ((totalPaise / selectedParticipants.length) / 100).toFixed(2)
                    : '0.00'}{' '}
                  each):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {groupMembers.map((m) => (
                    <label
                      key={m.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(m.user_id)}
                        onChange={() => toggleParticipant(m.user_id)}
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {splitType === 'exact' && (
              <div>
                {groupMembers.map((m) => (
                  <div
                    key={m.user_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(m.user_id)}
                        onChange={() => toggleParticipant(m.user_id)}
                      />
                      <span>{m.name}</span>
                    </label>
                    <div style={{ width: 140 }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        placeholder="₹0.00"
                        disabled={!selectedParticipants.includes(m.user_id)}
                        value={exactShares[m.user_id] || ''}
                        onChange={(e) =>
                          setExactShares({ ...exactShares, [m.user_id]: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {splitType === 'percentage' && (
              <div style={{ background: 'var(--bg-subtle)', padding: 14, borderRadius: 'var(--radius-md)' }}>
                {groupMembers.map((m) => (
                  <div
                    key={m.user_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedParticipants.includes(m.user_id)}
                        onChange={() => toggleParticipant(m.user_id)}
                      />
                      <span>{m.name}</span>
                    </label>
                    <div style={{ width: 140, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className="form-input"
                        placeholder="0.0"
                        disabled={!selectedParticipants.includes(m.user_id)}
                        value={percentages[m.user_id] || ''}
                        onChange={(e) =>
                          setPercentages({ ...percentages, [m.user_id]: e.target.value })
                        }
                      />
                      <span>%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {splitType === 'itemized' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Item Breakdown</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="btn btn-outline btn-sm"
                  >
                    <Plus size={14} /> Add Item
                  </button>
                </div>

                {items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg-subtle)',
                      padding: 10,
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Item name (e.g. Pizza)"
                        value={it.name}
                        onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                        style={{ flex: 2 }}
                        required
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        placeholder="Amount (₹)"
                        value={it.amountINR}
                        onChange={(e) => handleItemChange(idx, 'amountINR', e.target.value)}
                        style={{ flex: 1 }}
                        required
                      />
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                      Assigned Members:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {groupMembers.map((m) => {
                        const isAssigned = (it.assignedUserIds || []).map(Number).includes(Number(m.user_id));
                        return (
                          <button
                            type="button"
                            key={m.user_id}
                            onClick={() => toggleItemUser(idx, m.user_id)}
                            className={`btn btn-sm ${isAssigned ? 'btn-primary' : 'btn-outline'}`}
                            style={{
                              fontSize: '0.78rem',
                              padding: '3px 10px',
                              borderRadius: 'var(--radius-full)',
                              background: isAssigned ? 'var(--primary)' : 'var(--bg-subtle)',
                              color: isAssigned ? '#ffffff' : 'var(--text-muted)',
                              border: isAssigned ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                              fontWeight: isAssigned ? 600 : 500,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>{isAssigned ? '✓' : '+'}</span>
                            <span>{m.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Shared tax / delivery fee: the remainder when items sum to less than the total */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginTop: 4,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-light)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Shared tax / delivery fee</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Distributed across participants along with the items above.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <IndianRupee size={14} style={{ color: 'var(--text-muted)' }} />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      aria-label="Shared tax or delivery fee"
                      value={sharedTaxINR}
                      onChange={(e) => setSharedTaxOverride(e.target.value)}
                      style={{ width: 130 }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Version Reason (when editing) */}
          {editExpense && (
            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Reason for Edit *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Corrected item shares, updated amounts"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                required
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div
            style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', minWidth: 0 }}
            role="status"
            aria-live="polite"
          >
            {submitBlocked && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--warning)',
                  minWidth: 0,
                }}
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{blockedReason}</span>
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || submitBlocked}
          >
            {submitting ? 'Saving...' : editExpense ? 'Update Expense' : 'Create Expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
