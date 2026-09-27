import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { billAPI } from '../services/api';
import { CalendarClock, Plus, CheckCircle2, AlertCircle, Clock, Trash2, Edit2, Lock } from 'lucide-react';

export default function BillsView() {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState(null);

  // Form state
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState('House Rent');
  const [dueDay, setDueDay] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchBills = async () => {
    try {
      const res = await billAPI.getAll();
      setBills(res.data.bills || []);
    } catch (err) {
      console.error('Failed to fetch recurring bills:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const handleCreateBill = async (e) => {
    e.preventDefault();
    if (!billName.trim() || !billAmount || Number(billAmount) <= 0 || !dueDay || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await billAPI.create({
        name: billName.trim(),
        amount: Number(billAmount),
        category: billCategory,
        due_day: Number(dueDay)
      });

      setIsModalOpen(false);
      setBillName('');
      setBillAmount('');
      setDueDay(5);
      fetchBills();
    } catch (err) {
      console.error('Failed to create recurring bill:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to create bill.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBill = async (e) => {
    e.preventDefault();
    if (!editingBill || !billName.trim() || !billAmount || Number(billAmount) <= 0 || !dueDay || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await billAPI.update(editingBill.id, {
        name: billName.trim(),
        amount: Number(billAmount),
        category: billCategory,
        due_day: Number(dueDay)
      });

      setIsEditModalOpen(false);
      setEditingBill(null);
      setBillName('');
      setBillAmount('');
      setDueDay(5);
      fetchBills();
    } catch (err) {
      console.error('Failed to update recurring bill:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to update bill.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (bill) => {
    if (bill.status === 'paid' || bill.isPaidThisMonth) {
      alert('Paid bills cannot be edited during the same month. This bill will automatically become editable next month.');
      return;
    }
    setEditingBill(bill);
    setBillName(bill.name);
    setBillAmount(bill.amount);
    setBillCategory(bill.category || 'House Rent');
    setDueDay(bill.due_day || 5);
    setErrorMessage(null);
    setIsEditModalOpen(true);
  };

  const handleMarkAsPaid = async (id) => {
    try {
      await billAPI.markAsPaid(id);
      fetchBills();
    } catch (err) {
      console.error('Failed to mark bill as paid:', err);
      alert(err.response?.data?.error || 'Failed to mark bill as paid.');
    }
  };

  const handleDeleteBill = async (id) => {
    if (!window.confirm('Delete this recurring payment reminder?')) return;
    try {
      await billAPI.delete(id);
      fetchBills();
    } catch (err) {
      console.error('Failed to delete bill:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading Payment Reminders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
            <CalendarClock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Recurring Bills & Payment Reminders</h1>
            <p className="text-xs text-slate-500">
              Never miss a rent, EMI, or utility bill. Marking a bill as paid records the expense and locks editing for the month.
            </p>
          </div>
        </div>

        <button
          onClick={() => { setErrorMessage(null); setBillName(''); setBillAmount(''); setIsModalOpen(true); }}
          className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Recurring Bill</span>
        </button>
      </div>

      {/* Bills Grid */}
      {bills.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center text-xs text-slate-500 space-y-3 shadow-sm">
          <CalendarClock className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">No Recurring Bills Set Up</h3>
          <p className="max-w-md mx-auto">
            Add your monthly rent, EMI, electricity bill, or mobile recharge to receive automatic reminders!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bills.map((b) => {
            const isPaid = b.status === 'paid' || b.isPaidThisMonth;
            const isDueToday = b.status === 'due_today';
            const isOverdue = b.status === 'overdue';

            return (
              <div
                key={b.id}
                className={`bg-white border rounded-3xl p-5 shadow-sm space-y-3 relative transition-all ${
                  isPaid ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                      isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {isPaid ? '✓' : '📅'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{b.name}</h3>
                        {isPaid && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold">
                            <Lock className="w-3 h-3" /> Locked this month
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">{currency}{b.amount.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Edit Bill Button */}
                    <button
                      onClick={() => openEditModal(b)}
                      disabled={isPaid}
                      title={isPaid ? "Paid bills cannot be edited during the same month. Automatically editable next month." : "Edit Bill"}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isPaid
                          ? 'text-slate-300 cursor-not-allowed opacity-50'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Delete Bill Button */}
                    <button
                      onClick={() => handleDeleteBill(b.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete Bill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs flex items-center justify-between">
                  <span className="text-slate-700 font-medium">{b.dueMessage}</span>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    isPaid
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : isDueToday
                      ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                      : isOverdue
                      ? 'bg-red-100 text-red-800 border-red-300'
                      : 'bg-slate-200 text-slate-700 border-slate-300'
                  }`}>
                    {isPaid ? 'Paid ✓' : isDueToday ? 'Due Today 🔔' : isOverdue ? 'Overdue ⚠️' : 'Upcoming ⏰'}
                  </span>
                </div>

                {!isPaid ? (
                  <button
                    onClick={() => handleMarkAsPaid(b.id)}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>[ Mark as Paid ]</span>
                  </button>
                ) : (
                  <div className="space-y-1">
                    <button
                      disabled={true}
                      className="w-full py-2.5 rounded-xl bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200 cursor-not-allowed flex items-center justify-center gap-1.5 opacity-90"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>Paid for this month ✓ (Non-editable)</span>
                    </button>
                    <p className="text-[10px] text-slate-500 text-center italic">
                      This bill will automatically become editable again next month.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE BILL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add Recurring Payment</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCreateBill} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bill / Expense Name</label>
                <input
                  type="text"
                  value={billName}
                  onChange={(e) => setBillName(e.target.value)}
                  placeholder="e.g. House Rent, Electricity, Mobile"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency})</label>
                <input
                  type="number"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={billCategory}
                    onChange={(e) => setBillCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-2 text-xs text-slate-900 focus:outline-none focus:bg-white"
                  >
                    <option value="House Rent">House Rent</option>
                    <option value="EMI">EMI</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Mobile Recharge">Mobile Recharge</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Food">Food</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Policy Plans">Policy Plans</option>
                    <option value="Other Expense">Other Expense</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    placeholder="5"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                >
                  {submitting ? 'Saving...' : 'Add Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT BILL MODAL */}
      {isEditModalOpen && editingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Edit Recurring Payment</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleUpdateBill} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bill / Expense Name</label>
                <input
                  type="text"
                  value={billName}
                  onChange={(e) => setBillName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency})</label>
                <input
                  type="number"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={billCategory}
                    onChange={(e) => setBillCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-2 text-xs text-slate-900 focus:outline-none focus:bg-white"
                  >
                    <option value="House Rent">House Rent</option>
                    <option value="EMI">EMI</option>
                    <option value="Electricity">Electricity</option>
                    <option value="Mobile Recharge">Mobile Recharge</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Food">Food</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Policy Plans">Policy Plans</option>
                    <option value="Other Expense">Other Expense</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                >
                  {submitting ? 'Updating...' : 'Update Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
