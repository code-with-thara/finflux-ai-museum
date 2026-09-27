import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { bankSavingsAPI } from '../services/api';
import { 
  PiggyBank, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar, 
  CheckCircle2, 
  Plus, 
  RefreshCw, 
  Wallet,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  ArrowRightLeft
} from 'lucide-react';

export default function BankSavingsView() {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [bankSavings, setBankSavings] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [projectedSavings, setProjectedSavings] = useState(0);
  const [savingsBreakdown, setSavingsBreakdown] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Transfer Modal State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferDirection, setTransferDirection] = useState('deposit'); // 'deposit' or 'withdraw'
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Edit Reserve Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newReserveAmount, setNewReserveAmount] = useState('');
  const [updatingReserve, setUpdatingReserve] = useState(false);

  const fetchBankSavingsData = async () => {
    try {
      const res = await bankSavingsAPI.get();
      setBankSavings(res.data.bank_savings || 0);
      setAvailableBalance(res.data.available_balance || 0);
      setProjectedSavings(res.data.projectedSavings || 0);
      setSavingsBreakdown(res.data.savingsBreakdown || []);
      setHistory(res.data.history || []);
    } catch (err) {
      console.error('Failed to load bank savings details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBankSavingsData();
  }, []);

  const handleProcessMonthEnd = async () => {
    if (!window.confirm('Process and transfer current month unused budget savings into Bank Savings?')) return;
    setProcessing(true);
    setFeedback(null);

    try {
      const res = await bankSavingsAPI.processMonthEnd();
      setBankSavings(res.data.bank_savings);
      setHistory(res.data.history || []);
      setFeedback({
        type: 'success',
        message: res.data.message || '✅ Month-end budget savings moved to Bank Savings successfully!'
      });
      fetchBankSavingsData();
    } catch (err) {
      console.error('Failed to process month-end savings:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to process month-end transfer. Please try again.'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferAmount || isNaN(transferAmount) || Number(transferAmount) <= 0 || transferring) return;

    setTransferring(true);
    setFeedback(null);
    try {
      const res = await bankSavingsAPI.transfer({
        amount: Number(transferAmount),
        direction: transferDirection,
        notes: transferNotes.trim()
      });

      setBankSavings(res.data.bank_savings);
      setAvailableBalance(res.data.available_balance);
      setIsTransferOpen(false);
      setTransferAmount('');
      setTransferNotes('');
      setFeedback({
        type: 'success',
        message: `✅ ${res.data.message}`
      });
      fetchBankSavingsData();
    } catch (err) {
      console.error('Transfer failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to complete transfer.'
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleUpdateReserve = async (e) => {
    e.preventDefault();
    if (newReserveAmount === '' || isNaN(newReserveAmount) || Number(newReserveAmount) < 0 || updatingReserve) return;

    setUpdatingReserve(true);
    try {
      await bankSavingsAPI.update({ bank_savings: Number(newReserveAmount) });
      setIsEditOpen(false);
      setNewReserveAmount('');
      setFeedback({
        type: 'success',
        message: `✅ Bank Savings reserve set to ${currency}${Number(newReserveAmount).toLocaleString()}!`
      });
      fetchBankSavingsData();
    } catch (err) {
      console.error('Failed to update bank savings reserve:', err);
    } finally {
      setUpdatingReserve(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading Bank Savings Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <PiggyBank className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Bank Savings & Reserve</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                ● RESERVE VAULT
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Independent savings balance. Automatically covers shortfalls when an expense exceeds available balance.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => { setIsTransferOpen(true); setTransferAmount(''); setTransferNotes(''); }}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transfer Funds</span>
          </button>

          <button
            onClick={() => { setIsEditOpen(true); setNewReserveAmount(bankSavings); }}
            className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors"
          >
            Adjust Balance
          </button>

          <button
            onClick={handleProcessMonthEnd}
            disabled={processing}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${processing ? 'animate-spin' : ''}`} />
            <span>{processing ? 'Processing...' : 'Settle Month-End Savings'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-2xl text-xs flex items-center justify-between gap-2 border ${
          feedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline text-[11px]">Dismiss</button>
        </div>
      )}

      {/* Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Bank Savings */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Bank Savings (Reserve)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {currency}{bankSavings.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Independent reserve money
          </span>
        </div>

        {/* Available Balance Comparison */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Available Balance</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-teal-700">
            {currency}{availableBalance.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Spendable balance for normal expenses
          </span>
        </div>

        {/* Projected Current Month Budget Savings */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Projected Unused Budget</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-indigo-700">
            +{currency}{projectedSavings.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Estimated surplus to transfer at month end
          </span>
        </div>
      </div>

      {/* Current Month Unused Budget Breakdown */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Current Month Unused Budget Breakdown</h3>
          <span className="text-xs font-semibold text-emerald-700">
            Total Saved: {currency}{projectedSavings.toLocaleString()}
          </span>
        </div>

        {savingsBreakdown.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
            No unused budget remaining in categories this month.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savingsBreakdown.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">{item.category}</span>
                  <span className="text-xs font-bold text-emerald-700">+{currency}{item.saved.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Allocated: {currency}{item.allocated.toLocaleString()}</span>
                  <span>Spent: {currency}{item.spent.toLocaleString()}</span>
                </div>
                <span className="text-[10px] text-slate-400 block pt-0.5">
                  "{item.category} budget saved: {currency}{item.saved.toLocaleString()}"
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bank Savings History Table */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Bank Savings History & Net Movements</h3>
          <span className="text-xs text-slate-500">Permanent record of deposits, withdrawals, shortfall covers, and surpluses</span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-2xl">
            No history entries yet. Transfers, shortfall covers, and month-end settlements will be logged here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="pb-3 pl-2">Date / Event</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Description</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3 pr-2 text-right">Bank Savings Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((entry, i) => (
                  <tr key={entry.id || i} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 pl-2 font-bold text-slate-900">
                      {entry.date || entry.monthName || `${entry.month}/${entry.year}`}
                    </td>
                    <td className="py-3.5 font-semibold">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        entry.type === 'manual_deposit' || entry.type === 'month_end_surplus' || entry.type === 'reversal'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {entry.type === 'manual_deposit' ? 'Deposit' : entry.type === 'manual_withdraw' ? 'Withdrawal' : entry.type === 'shortfall_cover' ? 'Shortfall Cover' : entry.type === 'reversal' ? 'Reversal' : 'Month-End Surplus'}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-700">
                      {entry.description}
                    </td>
                    <td className={`py-3.5 font-bold ${
                      entry.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {entry.amount >= 0 ? '+' : ''}{currency}{Math.abs(entry.amount || 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 pr-2 text-right font-extrabold text-slate-900 text-sm">
                      {currency}{(entry.balanceAfter || entry.balance_after || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transfer Funds Modal */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Transfer Funds</h3>
              <button onClick={() => setIsTransferOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold text-xs">✕</button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransferDirection('deposit')}
                  className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                    transferDirection === 'deposit'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Deposit to Savings
                </button>
                <button
                  type="button"
                  onClick={() => setTransferDirection('withdraw')}
                  className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                    transferDirection === 'withdraw'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  Withdraw to Balance
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Available Balance:</span>
                  <span className="font-bold text-slate-900">{currency}{availableBalance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Bank Savings:</span>
                  <span className="font-bold text-emerald-800">{currency}{bankSavings.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount to Transfer ({currency})
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="e.g. 2000"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Note / Reason (Optional)
                </label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Monthly emergency cushion"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferring || !transferAmount || Number(transferAmount) <= 0}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {transferring ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Adjust Bank Savings Reserve</h3>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-700 font-bold text-xs">✕</button>
            </div>

            <form onSubmit={handleUpdateReserve} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Current Accumulated Balance ({currency})
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={newReserveAmount}
                  onChange={(e) => setNewReserveAmount(e.target.value)}
                  placeholder="e.g. 40000"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-4 text-sm font-bold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Set your initial or updated bank savings reserve balance.
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingReserve}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {updatingReserve ? 'Updating...' : 'Save Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
