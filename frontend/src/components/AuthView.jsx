import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Zap, 
  Lock, 
  Mail, 
  User, 
  ArrowRight, 
  ArrowLeft,
  Plus, 
  Trash2, 
  PieChart, 
  ShieldCheck, 
  CheckCircle2, 
  HelpCircle,
  Sparkles,
  Wallet,
  Calendar
} from 'lucide-react';

const DEFAULT_BUDGET_CATEGORIES = [
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

export default function AuthView({ onBackToWelcome }) {
  const [isRegister, setIsRegister] = useState(false);
  const [regStep, setRegStep] = useState(1); // 1: Account Credentials, 2: Budget Allocation Page

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    monthly_income: '',
    salary_day: '1',
    bank_savings: '',
    savings_pin: '1234',
  });

  // Planned Budget Allocations during signup
  const [budgetAllocations, setBudgetAllocations] = useState({});
  const [customBudgets, setCustomBudgets] = useState([]);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomAmount, setNewCustomAmount] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);

  // Forgot password modal state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const { login, register } = useAuth();

  const handleCategoryAmountChange = (categoryName, value) => {
    setBudgetAllocations(prev => ({
      ...prev,
      [categoryName]: value
    }));
  };

  const handleAddCustomBudget = () => {
    if (!newCustomName.trim() || !newCustomAmount || Number(newCustomAmount) <= 0) return;
    setCustomBudgets(prev => [
      ...prev,
      { name: newCustomName.trim(), amount: Number(newCustomAmount) }
    ]);
    setNewCustomName('');
    setNewCustomAmount('');
    setShowAddCustom(false);
  };

  const handleRemoveCustomBudget = (index) => {
    setCustomBudgets(prev => prev.filter((_, idx) => idx !== index));
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  };

  // Step 1 Validation -> Move to Step 2 (Budget Allocation Page)
  const handleNextToBudgetAllocation = (e) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }

    if (!validateEmail(formData.email)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    if (formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    // Proceed to Step 2: Budget Allocation Page
    setRegStep(2);
  };

  // Final Registration Submission
  const handleFinalSubmit = async (e) => {
    if (e) e.preventDefault();
    setFormError(null);

    try {
      if (isRegister) {
        if (!formData.monthly_income || Number(formData.monthly_income) <= 0) {
          throw new Error('Monthly Income is compulsory. Please enter your monthly income.');
        }

        setLoading(true);
        const categoriesList = [];
        Object.entries(budgetAllocations).forEach(([catName, amt]) => {
          if (amt !== '' && !isNaN(amt) && Number(amt) > 0) {
            categoriesList.push({ category: catName, amount: Number(amt) });
          }
        });

        customBudgets.forEach(cb => {
          if (cb.name && cb.amount > 0) {
            categoriesList.push({ category: cb.name, amount: Number(cb.amount) });
          }
        });

        const payload = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          monthly_income: formData.monthly_income ? Number(formData.monthly_income) : 0,
          salary_day: formData.salary_day ? Number(formData.salary_day) : 1,
          bank_savings: formData.bank_savings ? Number(formData.bank_savings) : 0,
          savings_pin: formData.savings_pin || '1234',
          categories: categoriesList,
          budget_enabled: 1
        };

        await register(payload);
      } else {
        if (!validateEmail(formData.email)) throw new Error('Please enter a valid email address.');
        if (!formData.password) throw new Error('Please enter your password.');
        await login(formData.email.trim(), formData.password);
      }
    } catch (err) {
      setFormError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !validateEmail(forgotEmail)) return;
    setForgotSubmitted(true);
  };

  // Live total budget calculations
  const totalIncomeNum = Number(formData.monthly_income) || 0;
  const totalAllocatedFromPreset = Object.values(budgetAllocations).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  const totalAllocatedFromCustom = customBudgets.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalAllocated = totalAllocatedFromPreset + totalAllocatedFromCustom;
  const remainingUnallocated = totalIncomeNum - totalAllocated;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 sm:p-6 py-10 relative overflow-hidden selection:bg-emerald-500 selection:text-white">
      {/* Subtle Ambient Glowing Background Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-100/60 rounded-full blur-3xl pointer-events-none animate-glow-float" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 left-10 w-72 h-72 bg-sky-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <div className={`w-full ${isRegister && regStep === 2 ? 'max-w-2xl' : 'max-w-md'} bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl relative z-10 animate-fade-in-up transition-all duration-300`}>
        
        {/* Top Header Navigation */}
        {isRegister && (
          <div className="flex items-center justify-end mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Step {regStep} of 2: {regStep === 1 ? 'Account Credentials' : 'Budget Allocation'}</span>
            </div>
          </div>
        )}

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-600/25 mb-3 p-3 transform transition-transform hover:scale-105">
            <Zap className="w-7 h-7 text-white stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            SmartBudget <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">AI</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {!isRegister
              ? 'Sign in to access your personal financial dashboard'
              : regStep === 1
              ? 'Step 1: Enter your account credentials'
              : 'Step 2: Allocate your monthly income & category budgets'}
          </p>
        </div>

        {/* Tab Switcher (Sign In vs Create Account) */}
        <div className="flex bg-slate-100 p-1 rounded-2xl mb-6 border border-slate-200/80">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setRegStep(1); setFormError(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              !isRegister
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setRegStep(1); setFormError(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
              isRegister
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert Banner */}
        {formError && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2 font-medium">
            <span className="shrink-0">⚠️</span>
            <span>{formError}</span>
          </div>
        )}

        {/* PAGE / SCREEN 1: LOGIN OR STEP 1 REGISTRATION */}
        {(!isRegister || (isRegister && regStep === 1)) && (
          <form onSubmit={isRegister ? handleNextToBudgetAllocation : handleFinalSubmit} className="space-y-4">
            {isRegister && (
              <div className="animate-fade-in-up">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormError(null); }}
                    placeholder="e.g. Alex Johnson"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormError(null); }}
                  placeholder="name@example.com"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div className={`grid ${isRegister ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3`}>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Password</label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(true); setForgotSubmitted(false); setForgotEmail(formData.email); }}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => { setFormData({ ...formData, password: e.target.value }); setFormError(null); }}
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {isRegister && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => { setFormData({ ...formData, confirmPassword: e.target.value }); setFormError(null); }}
                      placeholder="••••••••"
                      className="w-full bg-white border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit / Next Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold py-3.5 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
            >
              {loading ? (
                <span>Processing...</span>
              ) : isRegister ? (
                <>
                  <span>Next: Set Up Budget</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>
        )}

        {/* PAGE / SCREEN 2: DEDICATED BUDGET ALLOCATION PAGE */}
        {isRegister && regStep === 2 && (
          <form onSubmit={handleFinalSubmit} className="space-y-5 animate-fade-in-up">
            
            {/* Header info */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                <PieChart className="w-4 h-4 text-emerald-700" />
                <span>Monthly Income & Planned Budget Allocations</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Set your monthly income, savings reserve, and category budgets. All choices are persisted directly to your account.
              </p>
            </div>

            {/* Income, Salary Credit Date & Savings Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-teal-600" />
                    <span>Monthly Income (₹)</span>
                  </label>
                  <span className="text-[10px] font-extrabold text-rose-600 uppercase">Compulsory *</span>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.monthly_income}
                  onChange={(e) => { setFormData({ ...formData, monthly_income: e.target.value }); setFormError(null); }}
                  placeholder="e.g. 50000"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Salary Credit Day</span>
                  </label>
                  <span className="text-[10px] font-extrabold text-emerald-700 uppercase">Compulsory *</span>
                </div>
                <select
                  value={formData.salary_day}
                  onChange={(e) => setFormData({ ...formData, salary_day: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      Day {day} {day === 1 ? '(1st)' : day === 2 ? '(2nd)' : day === 3 ? '(3rd)' : `(${day}th)`}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block font-medium">
                  📅 Day of month salary credits.
                </span>
              </div>

              <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Bank Savings (₹)</span>
                  </label>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Optional</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={formData.bank_savings}
                  onChange={(e) => setFormData({ ...formData, bank_savings: e.target.value })}
                  placeholder="Enter savings or skip"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-emerald-700 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Savings Security PIN</span>
                  </label>
                  <span className="text-[10px] font-extrabold text-emerald-700 uppercase">4 Digits</span>
                </div>
                <input
                  type="password"
                  maxLength={4}
                  pattern="[0-9]*"
                  value={formData.savings_pin}
                  onChange={(e) => setFormData({ ...formData, savings_pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="1234"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-emerald-800 text-center tracking-widest focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block font-medium">
                  🔒 PIN to unlock savings box
                </span>
              </div>
            </div>

            {/* Budget Calculation Live Tally Bar */}
            {totalIncomeNum > 0 && (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Planned Monthly Income</span>
                  <span className="font-extrabold text-slate-900">₹{totalIncomeNum.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Category Budgets</span>
                  <span className="font-extrabold text-emerald-700">₹{totalAllocated.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Remaining Unallocated</span>
                  <span className={`font-extrabold ${remainingUnallocated >= 0 ? 'text-sky-700' : 'text-rose-600'}`}>
                    ₹{remainingUnallocated.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Category Budget Selection Grid */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 block">
                Allocate monthly budgets for categories:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {DEFAULT_BUDGET_CATEGORIES.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base shrink-0">{cat.icon}</span>
                      <span className="text-xs font-semibold text-slate-800 truncate">{cat.name}</span>
                    </div>
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        value={budgetAllocations[cat.name] || ''}
                        onChange={(e) => handleCategoryAmountChange(cat.name, e.target.value)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-300 rounded-lg py-1 pl-6 pr-2 text-xs font-bold text-emerald-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Category Budgets */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Add custom category budget:</span>
                {!showAddCustom && (
                  <button
                    type="button"
                    onClick={() => setShowAddCustom(true)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Custom Budget</span>
                  </button>
                )}
              </div>

              {showAddCustom && (
                <div className="p-3 bg-slate-50 border border-emerald-300 rounded-2xl space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={newCustomName}
                      onChange={(e) => setNewCustomName(e.target.value)}
                      placeholder="Budget Name (e.g. Gym)"
                      className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        min="1"
                        value={newCustomAmount}
                        onChange={(e) => setNewCustomAmount(e.target.value)}
                        placeholder="Amount (e.g. 1000)"
                        className="w-full bg-white border border-slate-300 rounded-xl py-2 pl-7 pr-3 text-xs font-bold text-emerald-700 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCustom(false)}
                      className="flex-1 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCustomBudget}
                      disabled={!newCustomName.trim() || !newCustomAmount}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50"
                    >
                      Save Budget
                    </button>
                  </div>
                </div>
              )}

              {customBudgets.length > 0 && (
                <div className="space-y-1.5">
                  {customBudgets.map((cb, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs"
                    >
                      <span className="font-bold text-slate-800">🎯 {cb.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-700">₹{cb.amount.toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomBudget(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation Buttons for Step 2 */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRegStep(1)}
                className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← Back</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold py-3.5 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              >
                {loading ? (
                  <span>Creating Account...</span>
                ) : (
                  <>
                    <span>Create Account & Submit Budget</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Security Footer */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Strict data security & database-grounded calculations</span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Password Recovery</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {forgotSubmitted ? (
              <div className="py-3 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-800">
                  If an account exists for <span className="font-bold text-emerald-700">{forgotEmail}</span>, password reset instructions will be sent.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
                <p className="text-xs text-slate-600">
                  Enter your registered email address and we'll send password recovery steps.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
