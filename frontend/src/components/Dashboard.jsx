import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { transactionAPI, billAPI, goalAPI, bankSavingsAPI, aiAPI } from '../services/api';
import MonthlyExpenseGraph from './MonthlyExpenseGraph';
import VoiceExpenseAssistant from './VoiceExpenseAssistant';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowRight,
  PiggyBank, 
  PieChart, 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  Plus, 
  TrendingUp, 
  ChevronRight,
  Trophy,
  ShieldCheck,
  Sparkles,
  Lock,
  Unlock,
  KeyRound
} from 'lucide-react';

const CATEGORY_CHIPS = [
  { name: 'House Rent', icon: '🏠' },
  { name: 'EMI', icon: '💳' },
  { name: 'Groceries', icon: '🛒' },
  { name: 'Food', icon: '🍱' },
  { name: 'Snacks', icon: '☕' },
  { name: 'Transport', icon: '🚗' },
  { name: 'Electricity', icon: '💡' },
  { name: 'Mobile Recharge', icon: '📱' },
  { name: 'Entertainment', icon: '🎬' },
  { name: 'Shopping', icon: '🛍' },
  { name: 'Education', icon: '📚' },
  { name: 'Health', icon: '🏥' },
  { name: 'Policy Plans', icon: '📄' },
  { name: 'Other Expense', icon: '📦' },
];

export default function Dashboard({ setActiveTab }) {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [summary, setSummary] = useState(null);
  const [upcomingBills, setUpcomingBills] = useState([]);
  const [achievedGoals, setAchievedGoals] = useState([]);
  const [bankSavingsData, setBankSavingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Bank Savings Security PIN state
  const [isSavingsUnlocked, setIsSavingsUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(null);

  const handleVerifySavingsPin = (e) => {
    if (e) e.preventDefault();
    setPinError(null);
    const userPin = String(user?.savings_pin || '1234');
    if (enteredPin.trim() === userPin) {
      setIsSavingsUnlocked(true);
      setShowPinModal(false);
      setEnteredPin('');
    } else {
      setPinError('Incorrect Security PIN. Please try again.');
    }
  };

  // Smart Command Input Bar state
  const [smartInput, setSmartInput] = useState('');
  const [smartSubmitting, setSmartSubmitting] = useState(false);

  const handleSmartCommandSubmit = async (e) => {
    e.preventDefault();
    if (!smartInput.trim() || smartSubmitting) return;

    setSmartSubmitting(true);
    try {
      const res = await aiAPI.execute(smartInput.trim());
      if (res && res.data) {
        setFeedback({
          type: 'success',
          message: `✅ ${res.data.message}`
        });
        setSmartInput('');
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Smart command execution error:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to process command. Please try again.'
      });
    } finally {
      setSmartSubmitting(false);
    }
  };

  // Quick Chip Modal state
  const [selectedChip, setSelectedChip] = useState(null);
  const [chipAmount, setChipAmount] = useState('');
  const [chipSubmitting, setChipSubmitting] = useState(false);

  // Custom Expense Modal state ("+ Add Expense")
  const [isCustomExpenseOpen, setIsCustomExpenseOpen] = useState(false);
  const [customPurpose, setCustomPurpose] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customDate, setCustomDate] = useState(new Date().toISOString().split('T')[0]);
  const [customNote, setCustomNote] = useState('');
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchDashboardData = async () => {
    try {
      const [sumRes, billRes, goalRes, bankRes] = await Promise.all([
        transactionAPI.getSummary(),
        billAPI.getAll(),
        goalAPI.getAll(),
        bankSavingsAPI.get().catch(() => ({ data: {} })),
      ]);
      setSummary(sumRes.data.summary);
      setUpcomingBills(billRes.data.bills || []);
      const allGoals = goalRes.data.goals || [];
      setAchievedGoals(allGoals.filter(g => g.target_amount > 0 && g.current_saved >= g.target_amount));
      setBankSavingsData(bankRes.data);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user?.monthly_income, user?.salary_day]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Submit Quick Category Chip expense
  const handleChipExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!selectedChip || !chipAmount || Number(chipAmount) <= 0 || chipSubmitting) return;

    setChipSubmitting(true);
    try {
      const res = await transactionAPI.create({
        type: 'expense',
        category: selectedChip.name,
        amount: Number(chipAmount),
        description: selectedChip.name,
        date: new Date().toISOString().split('T')[0]
      });

      const baseMsg = `✅ Recorded ${currency}${chipAmount} for ${selectedChip.name}.`;
      const fullMsg = res.data.savingsNotification ? `${baseMsg} ℹ️ ${res.data.savingsNotification}` : baseMsg;

      setFeedback({
        type: res.data.uncovered_deficit > 0 ? 'error' : 'success',
        message: fullMsg
      });

      setSelectedChip(null);
      setChipAmount('');
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to save chip expense:', err);
    } finally {
      setChipSubmitting(false);
    }
  };

  // Submit Custom Expense ("+ Add Expense" Modal)
  const handleCustomExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!customPurpose.trim() || !customAmount || Number(customAmount) <= 0 || customSubmitting) return;

    setCustomSubmitting(true);
    try {
      const res = await transactionAPI.create({
        type: 'expense',
        category: 'Unallocated',
        amount: Number(customAmount),
        description: customPurpose.trim() + (customNote.trim() ? ` (${customNote.trim()})` : ''),
        date: customDate || new Date().toISOString().split('T')[0]
      });

      const baseMsg = `✅ Recorded ${currency}${customAmount} for "${customPurpose.trim()}".`;
      const fullMsg = res.data.savingsNotification ? `${baseMsg} ℹ️ ${res.data.savingsNotification}` : baseMsg;

      setFeedback({
        type: res.data.uncovered_deficit > 0 ? 'error' : 'success',
        message: fullMsg
      });

      setIsCustomExpenseOpen(false);
      setCustomPurpose('');
      setCustomAmount('');
      setCustomDate(new Date().toISOString().split('T')[0]);
      setCustomNote('');
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to save custom expense:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to record expense. Please try again.'
      });
    } finally {
      setCustomSubmitting(false);
    }
  };

  // Quick mark bill as paid
  const handlePayBill = async (billId) => {
    try {
      await billAPI.markAsPaid(billId);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to mark bill as paid:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Loading SmartBudget Dashboard...</p>
        </div>
      </div>
    );
  }

  const s = summary || {};
  const currentMonthExpenses = s.thisMonth?.expenses || 0;
  const hasExpensesRecorded = currentMonthExpenses > 0;
  const categoryBudgets = s.categoryBudgets || [];
  const bankSavings = bankSavingsData?.bank_savings !== undefined ? bankSavingsData.bank_savings : (s.bankSavings || 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-8">
      {/* Top Greeting Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {getGreeting()}, <span className="text-emerald-700">{user?.name}</span> 👋
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Personal budget overview and real-time financial tracking
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsCustomExpenseOpen(true);
              setCustomPurpose('');
              setCustomAmount('');
              setCustomDate(new Date().toISOString().split('T')[0]);
              setCustomNote('');
            }}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Expense</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-2xl text-xs flex items-center justify-between gap-2 border ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline text-[11px]">Dismiss</button>
        </div>
      )}

      {/* Salary Credit Arrival Date Feature Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-white rounded-3xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-emerald-700/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-emerald-400/10 blur-2xl pointer-events-none" />
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-white shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">Salary Arrival Schedule</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-emerald-100 text-[10px] font-extrabold border border-white/30">
                Active Feature
              </span>
            </div>
            <p className="text-sm font-extrabold text-white mt-0.5">
              Monthly Salary of {currency}{(user?.monthly_income || 0).toLocaleString()} credits on Day {user?.salary_day || 1} of every month
            </p>
          </div>
        </div>
        <div className="bg-white/15 px-4 py-2 rounded-2xl border border-white/25 text-xs font-bold text-emerald-100 flex items-center gap-2 shrink-0 self-start sm:self-auto relative z-10">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Next Arrival: Day {user?.salary_day || 1}</span>
        </div>
      </div>

      {/* 1. PRIMARY METRICS FIRST: Available Balance, This Month Income, Budget Remaining */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Available Balance */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Available Balance</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {currency}{(s.availableBalance || 0).toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Net balance after expenses & savings
          </span>
        </div>

        {/* 2. This Month Income */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">This Month Income</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-teal-700">
            {currency}{(Math.max(s.thisMonth?.income || 0, user?.monthly_income || 0)).toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-700 font-bold mt-1 block flex items-center gap-1">
            <span>📅 Salary Credit Day:</span>
            <span className="underline">Day {user?.salary_day || 1} of month</span>
          </span>
        </div>

        {/* 3. This Month Expenses */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">This Month Expenses</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-700">
            {currency}{currentMonthExpenses.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Total recorded expenditures this month
          </span>
        </div>

        {/* 4. Bank Savings Reserve Card (Protected by Security PIN) */}
        <div 
          onClick={() => {
            if (!isSavingsUnlocked) {
              setShowPinModal(true);
              setPinError(null);
              setEnteredPin('');
            }
          }}
          className={`bg-white border rounded-3xl p-5 shadow-sm transition-all cursor-pointer relative overflow-hidden group ${
            isSavingsUnlocked ? 'border-emerald-300' : 'border-slate-200 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>Bank Savings</span>
              {isSavingsUnlocked ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Unlocked</span>
              ) : (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">🔒 Protected</span>
              )}
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              isSavingsUnlocked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-600'
            }`}>
              {isSavingsUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
          </div>

          {isSavingsUnlocked ? (
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 animate-fade-in">
                {currency}{bankSavings.toLocaleString()}
              </div>
              <div className="flex items-center justify-between mt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('savings');
                  }}
                  className="text-[11px] text-emerald-600 hover:underline font-semibold flex items-center gap-1"
                >
                  <span>View Savings Ledger</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSavingsUnlocked(false);
                  }}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg transition-colors"
                >
                  <Lock className="w-3 h-3" />
                  <span>Lock</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-400 tracking-widest selection:bg-none select-none">
                ••••••••
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPinModal(true);
                  setPinError(null);
                  setEnteredPin('');
                }}
                className="text-[11px] text-emerald-700 font-bold hover:underline mt-1 inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Click to Enter PIN & Reveal</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. EXPENSE SUMMARY WITH REAL DATA (No fake demo values) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">This Month Spending Status</h3>
            <p className="text-xs text-slate-500">Live tally of all expenditures recorded this month</p>
          </div>
          <button
            onClick={() => setActiveTab('transactions')}
            className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
          >
            <span>View All Transactions</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Category Chips + Voice Assistant + Smart AI Text Command Bar */}
        <div className="space-y-3">
          {/* Smart AI Quick Command Bar */}
          <form onSubmit={handleSmartCommandSubmit} className="relative flex items-center gap-2 bg-slate-50 border border-slate-200/90 hover:border-emerald-300 p-2 rounded-2xl transition-all shadow-sm">
            <div className="flex items-center gap-1.5 pl-2 text-emerald-700 shrink-0 font-bold text-xs">
              <Sparkles className="w-4 h-4 animate-pulse text-emerald-600" />
              <span className="hidden sm:inline">Smart AI Command:</span>
            </div>
            <input
              type="text"
              value={smartInput}
              onChange={(e) => setSmartInput(e.target.value)}
              placeholder='Type anything e.g. "spent 50 for tea", "save 5000 in bank", "set goal 50000 for laptop"'
              className="flex-1 bg-transparent text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none px-1 py-1"
            />
            <button
              type="submit"
              disabled={!smartInput.trim() || smartSubmitting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all disabled:opacity-40 shrink-0"
            >
              {smartSubmitting ? 'Processing...' : 'Auto-Execute'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="mb-3">
            <VoiceExpenseAssistant onExpenseAdded={fetchDashboardData} currency={currency} />
          </div>
          <span className="text-xs font-bold text-slate-700 block mb-2">
            Record an expense quickly:
          </span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.name}
                type="button"
                onClick={() => { setSelectedChip(chip); setChipAmount(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 transition-all hover:border-emerald-300"
              >
                <span>{chip.icon}</span>
                <span>{chip.name}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setIsCustomExpenseOpen(true);
                setCustomPurpose('');
                setCustomAmount('');
                setCustomDate(new Date().toISOString().split('T')[0]);
                setCustomNote('');
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold text-emerald-800 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-700" />
              <span>+ Add Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. BUDGET STATUS CARDS WITH GREEN / YELLOW / RED COLORS */}
      {categoryBudgets.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Planned Budget Status</h3>
              <p className="text-xs text-slate-500">Color coded based on spending percentage</p>
            </div>
            <button
              onClick={() => setActiveTab('budget')}
              className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1"
            >
              <span>Manage Budgets</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {categoryBudgets.map((cat, idx) => {
              const isOver = cat.spent > cat.totalAvailable && cat.totalAvailable > 0;
              const isReached = cat.percentUsed >= 100 && !isOver;
              const isYellow = cat.percentUsed >= 80 && cat.percentUsed < 100;
              const isGreen = cat.percentUsed < 80;
              const exceededAmount = isOver ? (cat.spent - cat.totalAvailable) : 0;

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border transition-all ${
                    isOver
                      ? 'bg-rose-50/70 border-rose-200'
                      : isReached
                      ? 'bg-red-50/70 border-red-200'
                      : isYellow
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-emerald-50/40 border-emerald-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-900">{cat.category}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isOver
                        ? 'bg-rose-100 text-rose-800'
                        : isReached
                        ? 'bg-red-100 text-red-800'
                        : isYellow
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {isOver ? `🔴 ${currency}${exceededAmount.toFixed(0)} over budget` : isReached ? '🔴 Reached' : isYellow ? '🟡 Getting Low' : '🟢 Safe'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden mb-2">
                    <div
                      style={{ width: `${Math.min(100, cat.percentUsed)}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOver
                          ? 'bg-rose-600'
                          : isReached
                          ? 'bg-red-600'
                          : isYellow
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>Spent: <strong>{currency}{cat.spent.toLocaleString()}</strong></span>
                    <span>Budget: {currency}{cat.totalAvailable.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. MONTHLY EXPENSE GRAPH */}
      <MonthlyExpenseGraph data={s.monthlyExpenseGraph} currency={currency} />

      {/* 5. SAVINGS GOALS ACHIEVED & UPCOMING BILLS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Bills */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900">Upcoming Payment Reminders</h3>
            </div>
            <button
              onClick={() => setActiveTab('bills')}
              className="text-xs text-slate-500 hover:text-emerald-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {upcomingBills.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
              No upcoming bills due right now.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingBills.slice(0, 3).map((bill) => (
                <div
                  key={bill.id}
                  className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">{bill.name}</span>
                    <span className="text-[11px] text-slate-500 block">{bill.dueMessage}</span>
                  </div>

                  {bill.status === 'paid' ? (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                      Paid ✓
                    </span>
                  ) : (
                    <button
                      onClick={() => handlePayBill(bill.id)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Savings Goals Status */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">Savings Goals</h3>
            </div>
            <button
              onClick={() => setActiveTab('goals')}
              className="text-xs text-slate-500 hover:text-teal-700 flex items-center gap-1"
            >
              <span>View Goals</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {achievedGoals.length > 0 ? (
            <div className="space-y-2">
              {achievedGoals.slice(0, 2).map((g) => (
                <div
                  key={g.id}
                  className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Trophy className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">Goal Achieved: {g.name}</span>
                      <span className="text-[11px] text-emerald-800">Reached {currency}{g.target_amount.toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('goals')}
                    className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-bold text-[11px]"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
              Track progress on your target savings goals anytime.
            </div>
          )}
        </div>
      </div>

      {/* QUICK CHIP AMOUNT MODAL */}
      {selectedChip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{selectedChip.icon}</span>
                <h3 className="text-base font-bold text-slate-900">{selectedChip.name}</h3>
              </div>
              <button
                onClick={() => setSelectedChip(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChipExpenseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">How much did you spend?</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">{currency}</span>
                  <input
                    type="number"
                    autoFocus
                    required
                    min="0.01"
                    step="any"
                    value={chipAmount}
                    onChange={(e) => setChipAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded-xl py-3 pl-8 pr-4 text-base font-bold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedChip(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!chipAmount || Number(chipAmount) <= 0 || chipSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {chipSubmitting ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM EXPENSE POPUP MODAL ("+ Add Expense") */}
      {isCustomExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add New Expense</h3>
                  <p className="text-[11px] text-slate-500">Record an expenditure</p>
                </div>
              </div>
              <button
                onClick={() => setIsCustomExpenseOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCustomExpenseSubmit} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Purpose / Description <span className="text-emerald-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={customPurpose}
                  onChange={(e) => setCustomPurpose(e.target.value)}
                  placeholder="e.g. Doctor visit, Movie ticket, Car repair"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Amount <span className="text-emerald-600">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{currency}</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-300 rounded-xl py-2.5 pl-7 pr-3 text-xs font-bold text-emerald-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Date <span className="text-emerald-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Note / Remark <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows="2"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Additional details..."
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomExpenseOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!customPurpose.trim() || !customAmount || Number(customAmount) <= 0 || customSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  {customSubmitting ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SAVINGS SECURITY PIN MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Savings Security PIN</h3>
                  <p className="text-[11px] text-slate-500">Enter PIN to unlock bank savings</p>
                </div>
              </div>
              <button
                onClick={() => { setShowPinModal(false); setPinError(null); setEnteredPin(''); }}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {pinError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-700 text-center">
                ⚠️ {pinError}
              </div>
            )}

            <form onSubmit={handleVerifySavingsPin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2 text-center">
                  Enter 4-Digit Security PIN
                </label>
                <div className="relative max-w-[180px] mx-auto">
                  <input
                    type="password"
                    autoFocus
                    required
                    maxLength={4}
                    pattern="[0-9]*"
                    value={enteredPin}
                    onChange={(e) => {
                      setPinError(null);
                      setEnteredPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                    }}
                    placeholder="••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-3 px-4 text-center font-extrabold text-xl tracking-[0.5em] text-emerald-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowPinModal(false); setPinError(null); setEnteredPin(''); }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enteredPin.length < 4}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-50 transition-all"
                >
                  Unlock Amount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
