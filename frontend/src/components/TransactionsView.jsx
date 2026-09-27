import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactionAPI } from '../services/api';
import VoiceExpenseAssistant from './VoiceExpenseAssistant';
import { Receipt, Search, Plus, Filter, Edit2, Trash2, ArrowUpRight, ArrowDownLeft, PiggyBank, Landmark } from 'lucide-react';

const CATEGORIES = [
  'House Rent',
  'EMI',
  'Groceries',
  'Food',
  'Snacks',
  'Transport',
  'Electricity',
  'Mobile Recharge',
  'Entertainment',
  'Shopping',
  'Education',
  'Health',
  'Policy Plans',
  'Other Expense',
  'Unallocated',
  'Salary',
  'Investment'
];

export default function TransactionsView() {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    type: 'expense',
    category: 'Groceries',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    payment_method: 'Cash'
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchTransactions = async () => {
    try {
      const res = await transactionAPI.getAll({
        type: filterType || undefined,
        category: filterCategory || undefined,
        search: search || undefined
      });
      setTransactions(res.data.transactions || []);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [filterType, filterCategory, search]);

  const handleCreateTx = async (e) => {
    e.preventDefault();
    if (!formData.amount || Number(formData.amount) <= 0 || !formData.description.trim() || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await transactionAPI.create({
        ...formData,
        amount: Number(formData.amount)
      });

      if (res.data.savingsNotification) {
        setFeedback({
          type: res.data.uncovered_deficit > 0 ? 'warning' : 'info',
          message: res.data.savingsNotification
        });
      }

      setIsAddModalOpen(false);
      resetForm();
      fetchTransactions();
    } catch (err) {
      console.error('Failed to create transaction:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTx = async (e) => {
    e.preventDefault();
    if (!editingTx || !formData.amount || Number(formData.amount) <= 0 || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await transactionAPI.update(editingTx.id, {
        ...formData,
        amount: Number(formData.amount)
      });

      if (res.data.savingsNotification) {
        setFeedback({
          type: res.data.uncovered_deficit > 0 ? 'warning' : 'info',
          message: res.data.savingsNotification
        });
      }

      setIsEditModalOpen(false);
      setEditingTx(null);
      resetForm();
      fetchTransactions();
    } catch (err) {
      console.error('Failed to update transaction:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTx = async (id) => {
    if (!window.confirm('Delete this transaction? Your balances & budgets will be updated.')) return;
    try {
      await transactionAPI.delete(id);
      fetchTransactions();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    }
  };

  const openEditModal = (tx) => {
    setEditingTx(tx);
    setFormData({
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description,
      date: tx.date,
      merchant: tx.merchant || '',
      payment_method: tx.payment_method || 'Cash'
    });
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      type: 'expense',
      category: 'Groceries',
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      merchant: '',
      payment_method: 'Cash'
    });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading Transaction History...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-6">
      {/* Header & New Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Transaction History</h1>
            <p className="text-xs text-slate-500">All recorded expenses, income, and savings goal contributions.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Assistant Trigger */}
          <VoiceExpenseAssistant onExpenseAdded={fetchTransactions} currency={currency} />

          <button
            onClick={() => { resetForm(); setIsAddModalOpen(true); }}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-4 rounded-2xl text-xs flex items-center justify-between gap-2 border ${
          feedback.type === 'warning' 
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <span>ℹ️ {feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline text-[11px]">Dismiss</button>
        </div>
      )}

      {/* Search Bar & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search "doctor", "groceries", "500"...'
            className="w-full bg-white border border-slate-300 focus:border-emerald-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Type Filter */}
        <div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-2xl py-2.5 px-3 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Types (Expense, Income, Savings)</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="savings_deposit">Savings Goal Deposit</option>
          </select>
        </div>

        {/* Category Filter */}
        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-2xl py-2.5 px-3 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Transaction List Ledger */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm space-y-3">
        {transactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
            <p>No transactions found matching your criteria.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {transactions.map((tx) => {
              const isIncome = tx.type === 'income';
              const isSavings = tx.type === 'savings_deposit' || tx.type === 'savings_withdraw';

              return (
                <div
                  key={tx.id}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isIncome 
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : isSavings
                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {isIncome ? <ArrowDownLeft className="w-5 h-5" /> : isSavings ? <PiggyBank className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{tx.description}</span>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className={`font-semibold px-2 py-0.2 rounded ${
                          isSavings ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {tx.category}
                        </span>
                        <span>•</span>
                        <span>{tx.date}</span>
                        {tx.covered_from_savings > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-300">
                            🏦 {currency}{tx.covered_from_savings.toLocaleString()} from savings
                          </span>
                        )}
                        {tx.uncovered_deficit > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-[10px] border border-red-300">
                            ⚠️ {currency}{tx.uncovered_deficit.toLocaleString()} deficit
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-extrabold ${
                      isIncome 
                        ? 'text-teal-700' 
                        : isSavings 
                        ? 'text-sky-700' 
                        : 'text-rose-700'
                    }`}>
                      {isIncome ? '+' : '-'}{currency}{tx.amount.toLocaleString()}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(tx)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
                        title="Edit Transaction"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTx(tx.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Delete Transaction"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD / EDIT TRANSACTION MODAL */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {isEditModalOpen ? 'Edit Transaction' : 'Record Transaction'}
              </h3>
              <button
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={isEditModalOpen ? handleUpdateTx : handleCreateTx} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency})</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="250"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Lunch with friends"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
