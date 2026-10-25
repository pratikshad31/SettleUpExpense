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

export default function ExpenseModal({ isOpen, onClose, onSave, groupMembers, editExpense = null }) {
  const [description, setDescription] = useState('');
  const [amountINR, setAmountINR] = useState('');
  const [category, setCategory] = useState('General');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
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

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize or populate when opened
  useEffect(() => {
    if (!isOpen) return;
    setError('');

    const defaultMemberIds = (groupMembers || []).map((m) => Number(m.user_id));

    if (editExpense) {
      setDescription(editExpense.description);
      setAmountINR((Number(editExpense.total_amount_paise) / 100).toString());
      setCategory(editExpense.category || 'General');
      setExpenseDate(editExpense.expense_date ? editExpense.expense_date.split('T')[0] : '');
      setSplitType(editExpense.split_type || 'equal');

      // Payers
      const pList = editExpense.payers || [];
      if (pList.length > 1) {
        setIsMultiplePayers(true);
        const map = {};
        pList.forEach((p) => {
          map[p.userId] = (Number(p.amountPaise) / 100).toString();
        });
        setPayerAmounts(map);
      } else if (pList.length === 1) {
        setIsMultiplePayers(false);
        setSinglePayerId(pList[0].userId.toString());
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
      setExpenseDate(new Date().toISOString().split('T')[0]);
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
    const diff = totalPaise - sumItemsPaise;
    splitValidation = {
      valid: totalPaise > 0 && diff === 0 && items.length > 0,
      diffPaise: diff,
      message:
        diff === 0
          ? 'Itemized total matches expense total'
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
        sharedTaxPaise: 0,
      };
    }

    try {
      setSubmitting(true);
      await onSave({
        description: description.trim(),
        amountPaise: totalPaise,
        category,
        expenseDate,
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
                onChange={(e) => setAmountINR(e.target.value)}
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

          {/* Section: Who Paid? */}
          <div style={{ marginTop: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>
                Paid By
              </label>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setIsMultiplePayers(!isMultiplePayers)}
                style={{ fontSize: '0.8rem' }}
              >
                {isMultiplePayers ? 'Switch to Single Payer' : 'Multiple Payers'}
              </button>
            </div>

            {!isMultiplePayers ? (
              <select
                className="form-select"
                value={singlePayerId}
                onChange={(e) => setSinglePayerId(e.target.value)}
              >
                {groupMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ background: 'var(--bg-subtle)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.825rem' }}>
                  <span>Enter contribution for each payer:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: payerDifferencePaise === 0 ? 'var(--primary-dark)' : 'var(--danger)',
                    }}
                  >
                    {payerDifferencePaise === 0
                      ? '✓ Matched total'
                      : `₹${(Math.abs(payerDifferencePaise) / 100).toFixed(2)} ${payerDifferencePaise > 0 ? 'remaining' : 'over'}`}
                  </span>
                </div>
                {groupMembers.map((m) => (
                  <div
                    key={m.user_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                  >
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{m.name}</span>
                    <div style={{ width: 140 }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        placeholder="₹0.00"
                        value={payerAmounts[m.user_id] || ''}
                        onChange={(e) =>
                          setPayerAmounts({ ...payerAmounts, [m.user_id]: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Split Method Selector */}
          <div style={{ marginTop: 16 }}>
            <label className="form-label">Split Method</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { id: 'equal', label: '1. Equal' },
                { id: 'exact', label: '2. Exact' },
                { id: 'percentage', label: '3. Percentage' },
                { id: 'shares', label: '4. Shares' },
                { id: 'adjustment', label: '5. Adjustment' },
                { id: 'itemized', label: '6. Itemized' },
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

            {splitType === 'shares' && (
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
                        step="1"
                        min="1"
                        className="form-input"
                        placeholder="1"
                        disabled={!selectedParticipants.includes(m.user_id)}
                        value={shares[m.user_id] || ''}
                        onChange={(e) =>
                          setShares({ ...shares, [m.user_id]: e.target.value })
                        }
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>shares</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {splitType === 'adjustment' && (
              <div style={{ background: 'var(--bg-subtle)', padding: 14, borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Equal split base + positive or negative adjustment:
                </p>
                {groupMembers.map((m) => (
                  <div
                    key={m.user_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                  >
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{m.name}</span>
                    <div style={{ width: 140 }}>
                      <input
                        type="number"
                        step="0.01"
                        className="form-input"
                        placeholder="+/- ₹0.00"
                        value={adjustments[m.user_id] || ''}
                        onChange={(e) =>
                          setAdjustments({ ...adjustments, [m.user_id]: e.target.value })
                        }
                      />
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
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !splitValidation.valid || (isMultiplePayers && payerDifferencePaise !== 0)}
          >
            {submitting ? 'Saving...' : editExpense ? 'Update Expense' : 'Create Expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
