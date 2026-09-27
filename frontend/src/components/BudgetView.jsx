import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactionAPI, budgetAPI } from '../services/api';
import { PieChart, Plus, AlertTriangle, CheckCircle2, TrendingUp, RefreshCw, Trash2, ShieldCheck } from 'lucide-react';

const COMMON_CATEGORIES = [
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
  'Custom Category'
];

export default function BudgetView() {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Groceries');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [budgetEnabled, setBudgetEnabled] = useState(true);
  const [togglingBudget, setTogglingBudget] = useState(false);

  const fetchBudgetData = async () => {
    try {
      const res = await transactionAPI.getSummary();
      setSummary(res.data.summary);
      if (res.data.summary && res.data.summary.budgetEnabled !== undefined) {
        setBudgetEnabled(res.data.summary.budgetEnabled);
      }
    } catch (err) {
      console.error('Failed to fetch budget summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgetData();
  }, []);

  const handleToggleBudget = async () => {
    setTogglingBudget(true);
    try {
      const res = await budgetAPI.toggle({ enabled: !budgetEnabled });
      setBudgetEnabled(res.data.budgetEnabled);
      fetchBudgetData();
    } catch (err) {
      console.error('Failed to toggle budget:', err);
    } finally {
      setTogglingBudget(false);
    }
  };

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    const finalCategory = selectedCategory === 'Custom Category' ? customCategoryName.trim() : selectedCategory;
    if (!finalCategory || budgetAmount === '' || isNaN(budgetAmount) || submitting) return;

    setSubmitting(true);
    try {
      await budgetAPI.setBudget({
        category: finalCategory,
        allocated_amount: Number(budgetAmount)
      });
      setIsModalOpen(false);
      setBudgetAmount('');
      setCustomCategoryName('');
      fetchBudgetData();
    } catch (err) {
      console.error('Failed to update budget:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBudget = async (id) => {
    if (!window.confirm('Remove this category budget?')) return;
    try {
      await budgetAPI.deleteBudget(id);
      fetchBudgetData();
    } catch (err) {
      console.error('Failed to delete budget:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading Budget Allocations...</p>
        </div>
      </div>
    );
  }

  const b = summary?.budget || { allocated: 0, spent: 0, rollover: 0, remaining: 0 };
  const categories = summary?.categoryBudgets || [];
  const alerts = summary?.lowBudgetAlerts || [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-6">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Monthly Category Budgets</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                budgetEnabled 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {budgetEnabled ? '● ACTIVE' : '○ INACTIVE'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Set limits per category. Expenses automatically deduct from your remaining budget.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggleBudget}
            disabled={togglingBudget}
            className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-1.5 border transition-all ${
              budgetEnabled
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>{togglingBudget ? 'Updating...' : budgetEnabled ? 'Disable Budget' : 'Enable / Activate Budget'}</span>
          </button>

          <button
            onClick={() => { setIsModalOpen(true); setBudgetAmount(''); setCustomCategoryName(''); }}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Set Category Budget</span>
          </button>
        </div>
      </div>

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Allocated Budget</span>
          <span className="text-2xl font-extrabold text-slate-900">{currency}{b.allocated.toLocaleString()}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Previous Month Rollover</span>
          <span className="text-2xl font-extrabold text-teal-700">+{currency}{b.rollover.toLocaleString()}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Carried forward</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Total Spent</span>
          <span className="text-2xl font-extrabold text-rose-700">{currency}{b.spent.toLocaleString()}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Remaining Budget</span>
          <span className={`text-2xl font-extrabold ${b.remaining >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {currency}{b.remaining.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Category Progress Cards */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Category Allocations & Status</h3>

        {categories.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-xs text-slate-400 space-y-3">
            <PieChart className="w-10 h-10 text-slate-300 mx-auto" />
            <p>No category budgets allocated yet. Click "Set Category Budget" to allocate money!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat, idx) => {
              const pct = Math.min(100, Math.max(0, cat.percentUsed));
              const isOver = cat.spent > cat.totalAvailable && cat.totalAvailable > 0;
              const isReached = cat.percentUsed >= 100 && !isOver;
              const isYellow = cat.percentUsed >= 80 && cat.percentUsed < 100;
              const isGreen = cat.percentUsed < 80;
              const exceededAmount = isOver ? (cat.spent - cat.totalAvailable) : 0;

              return (
                <div
                  key={idx}
                  className={`border rounded-3xl p-5 shadow-sm space-y-3 transition-all ${
                    isOver
                      ? 'bg-rose-50/50 border-rose-200'
                      : isReached
                      ? 'bg-red-50/50 border-red-200'
                      : isYellow
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{cat.category}</h4>
                      {cat.rollover > 0 && (
                        <span className="text-[10px] text-teal-700 font-semibold">
                          Includes {currency}{cat.rollover} rollover
                        </span>
                      )}
                    </div>

                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      isOver
                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                        : isReached
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : isYellow
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {isOver ? `🔴 ${currency}${exceededAmount.toFixed(0)} over budget` : isReached ? '🔴 Reached' : isYellow ? `🟡 ${cat.percentUsed.toFixed(0)}% Used` : `🟢 ${cat.percentUsed.toFixed(0)}% Used`}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOver
                          ? 'bg-rose-600'
                          : isReached
                          ? 'bg-red-600'
                          : isYellow
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                    <span>Spent: <strong>{currency}{cat.spent.toLocaleString()}</strong></span>
                    <span>Budget: {currency}{cat.totalAvailable.toLocaleString()}</span>
                    <span className={cat.remaining >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                      Left: {currency}{cat.remaining.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SET / EDIT BUDGET MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Set Category Budget</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {COMMON_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {selectedCategory === 'Custom Category' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Category Name</label>
                  <input
                    type="text"
                    required
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    placeholder="e.g. Gym, Yoga, Pet Care"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Allocated Amount ({currency})</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="e.g. 2000"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-4 text-sm font-bold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
