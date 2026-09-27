import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { goalAPI } from '../services/api';
import { Target, Plus, TrendingUp, Calendar, ArrowUpRight, ArrowDownLeft, Trash2, Sparkles } from 'lucide-react';

export default function SavingsGoalsView() {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);

  // Form states
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const [depositAmount, setDepositAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchGoals = async () => {
    try {
      const res = await goalAPI.getAll();
      setGoals(res.data.goals || []);
    } catch (err) {
      console.error('Failed to fetch savings goals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!goalName.trim() || !targetAmount || Number(targetAmount) <= 0 || submitting) return;

    setSubmitting(true);
    try {
      await goalAPI.create({
        name: goalName.trim(),
        target_amount: Number(targetAmount),
        initial_deposit: Number(initialDeposit) || 0,
        target_date: targetDate || null
      });

      setIsCreateModalOpen(false);
      setGoalName('');
      setTargetAmount('');
      setInitialDeposit('');
      setTargetDate('');
      fetchGoals();
    } catch (err) {
      console.error('Failed to create goal:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepositToGoal = async (e) => {
    e.preventDefault();
    if (!selectedGoal || !depositAmount || Number(depositAmount) <= 0 || submitting) return;

    setSubmitting(true);
    try {
      await goalAPI.deposit(selectedGoal.id, {
        amount: Number(depositAmount),
        notes: `Transfer to ${selectedGoal.name}`
      });

      setIsDepositModalOpen(false);
      setSelectedGoal(null);
      setDepositAmount('');
      fetchGoals();
    } catch (err) {
      console.error('Failed to add money to goal:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGoal = async (id) => {
    if (!window.confirm('Are you sure you want to delete this savings goal?')) return;
    try {
      await goalAPI.delete(id);
      fetchGoals();
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading Savings Goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center shrink-0 shadow-sm">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Savings Goals</h1>
            <p className="text-xs text-slate-500">
              Track progress for specific items (laptop, emergency fund, travel). Transfers safely deduct from available balance.
            </p>
          </div>
        </div>

        <button
          onClick={() => { setIsCreateModalOpen(true); setGoalName(''); setTargetAmount(''); setInitialDeposit(''); }}
          className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Savings Goal</span>
        </button>
      </div>

      {/* Goals List */}
      {goals.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center text-xs text-slate-500 space-y-3 shadow-sm">
          <Target className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">No Savings Goals Yet</h3>
          <p className="max-w-md mx-auto">
            Saving for a new laptop, vacation, or emergency cushion? Create a goal and add money whenever you can!
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
          >
            Create Goal Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map((g) => {
            const pct = Math.min(100, Math.max(0, g.percentCompleted || 0));
            const remaining = Math.max(0, g.target_amount - g.current_saved);

            return (
              <div
                key={g.id}
                className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4 relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
                      🎯
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{g.name}</h3>
                      <span className="text-xs text-slate-500">Target: {currency}{g.target_amount.toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteGoal(g.id)}
                    className="text-slate-400 hover:text-red-500 p-1 rounded-lg transition-colors"
                    title="Delete Goal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress Visual */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-600 font-bold">{pct}% Completed</span>
                    <span className="text-slate-500">Remaining: {currency}{remaining.toLocaleString()}</span>
                  </div>

                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Goal Achieved Banner or Current Saved */}
                {pct >= 100 ? (
                  <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs flex items-center justify-between text-emerald-800 font-bold">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>🎉 Goal Achieved! Target Reached!</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">
                      100%
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-[11px] text-slate-700 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Current Saved:</span>
                      <span className="text-emerald-700 font-bold">{currency}{g.current_saved.toLocaleString()}</span>
                    </div>
                    {remaining > 0 && (
                      <p className="text-slate-500 italic">
                        💡 Saving {currency}4,000/month could help you reach this goal in approx 5 months.
                      </p>
                    )}
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={() => { setSelectedGoal(g); setDepositAmount(''); setIsDepositModalOpen(true); }}
                  className="w-full py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Amount to Goal</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE GOAL MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Create New Savings Goal</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Goal Name</label>
                <input
                  type="text"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="e.g. Laptop"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Amount ({currency})</label>
                <input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  placeholder="60000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Deposit ({currency})</label>
                <input
                  type="number"
                  value={initialDeposit}
                  onChange={(e) => setInitialDeposit(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                >
                  {submitting ? 'Creating...' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEPOSIT AMOUNT TO GOAL MODAL */}
      {isDepositModalOpen && selectedGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Add to {selectedGoal.name}</h3>
              <button onClick={() => setIsDepositModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>

            <form onSubmit={handleDepositToGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">How much do you want to add?</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-bold">{currency}</span>
                  <input
                    type="number"
                    autoFocus
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="2000"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pl-8 pr-4 text-sm font-bold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  This will transfer {currency}{depositAmount || 0} from your available balance into your {selectedGoal.name} goal.
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!depositAmount || Number(depositAmount) <= 0 || submitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm disabled:opacity-40"
                >
                  {submitting ? 'Adding...' : 'Add to Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
