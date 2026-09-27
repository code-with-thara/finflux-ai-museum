import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Check, ArrowRight, X } from 'lucide-react';

const CATEGORY_PRESETS = [
  { category: 'House Rent', icon: '🏠', placeholderAmount: '0' },
  { category: 'EMI', icon: '💳', placeholderAmount: '0' },
  { category: 'Groceries', icon: '🛒', placeholderAmount: '0' },
  { category: 'Food', icon: '🍱', placeholderAmount: '0' },
  { category: 'Snacks', icon: '☕', placeholderAmount: '0' },
  { category: 'Transport', icon: '🚗', placeholderAmount: '0' },
  { category: 'Electricity', icon: '💡', placeholderAmount: '0' },
  { category: 'Mobile Recharge', icon: '📱', placeholderAmount: '0' },
  { category: 'Entertainment', icon: '🎬', placeholderAmount: '0' },
  { category: 'Shopping', icon: '🛍', placeholderAmount: '0' },
  { category: 'Education', icon: '📚', placeholderAmount: '0' },
  { category: 'Health', icon: '🏥', placeholderAmount: '0' },
  { category: 'Policy Plans', icon: '📑', placeholderAmount: '0' },
  { category: 'Other Expense', icon: '📦', placeholderAmount: '0' },
];

export default function OnboardingModal() {
  const { user, completeOnboarding } = useAuth();
  const [step, setStep] = useState(1); // 1: Ask option, 2: Budget Setup
  const [monthlyIncome, setMonthlyIncome] = useState(user?.monthly_income || '');
  const [salaryDay, setSalaryDay] = useState(user?.salary_day || 1);
  const [savingsPin, setSavingsPin] = useState(user?.savings_pin || '1234');
  const [categoryBudgets, setCategoryBudgets] = useState({});

  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeposit, setGoalDeposit] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const handleCategoryToggle = (catName) => {
    setCategoryBudgets(prev => {
      const next = { ...prev };
      if (next[catName] !== undefined) {
        delete next[catName];
      } else {
        next[catName] = '';
      }
      return next;
    });
  };

  const handleAmountChange = (catName, val) => {
    setCategoryBudgets(prev => ({ ...prev, [catName]: val }));
  };

  const incomeNum = Number(monthlyIncome) || 0;
  const totalAllocated = Object.values(categoryBudgets).reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  const remainingBudget = incomeNum - totalAllocated;

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      await completeOnboarding({ monthly_income: 0, salary_day: 1 });
    } catch (err) {
      console.error('Failed to skip onboarding:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinishSetup = async () => {
    setSubmitting(true);
    try {
      const categoriesArray = Object.entries(categoryBudgets).map(([cat, amt]) => ({
        category: cat,
        amount: Number(amt) || 0
      }));

      await completeOnboarding({
        monthly_income: Number(monthlyIncome) || 0,
        salary_day: Number(salaryDay) || 1,
        savings_pin: savingsPin || '1234',
        categories: categoriesArray,
        goal: goalName && Number(goalTarget) > 0 ? {
          name: goalName,
          target_amount: Number(goalTarget),
          initial_deposit: Number(goalDeposit) || 0
        } : null
      });
    } catch (err) {
      console.error('Failed to save onboarding:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || user.onboarding_completed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden relative">
        {/* Step 1: Decision Prompt */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <Sparkles className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-900">Welcome, {user.name}! 👋</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Do you want to set up an initial monthly budget plan & salary date?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-4 rounded-2xl text-xs flex flex-col items-center justify-center gap-1 shadow-sm transition-all group"
              >
                <span className="text-sm">Yes, Create My Budget</span>
                <span className="text-[11px] text-emerald-100 font-normal">Set monthly income, salary date & budget targets</span>
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={submitting}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold p-4 rounded-2xl text-xs flex flex-col items-center justify-center gap-1 border border-slate-300 transition-all"
              >
                <span className="text-sm">Skip for Now</span>
                <span className="text-[11px] text-slate-500 font-normal">Go straight to your Dashboard</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Income & Category Budget Setup */}
        {step === 2 && (
          <div className="space-y-6 max-h-[85vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Setup Your Monthly Budget & Salary Date</h2>
                <p className="text-xs text-slate-500">Allocate your income and set your salary credit arrival date.</p>
              </div>
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
              >
                Skip
              </button>
            </div>

            {/* Income, Salary Credit Date & Security PIN Inputs */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Income (₹)</label>
                  <input
                    type="number"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(e.target.value)}
                    placeholder="Enter your monthly income"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Salary Credit Day of Month</label>
                  <select
                    value={salaryDay}
                    onChange={(e) => setSalaryDay(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        Day {day} of month {day === 1 ? '(1st)' : day === 2 ? '(2nd)' : day === 3 ? '(3rd)' : `(${day}th)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Savings Security PIN (4 Digits)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={savingsPin}
                    onChange={(e) => setSavingsPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-sm font-bold text-center text-emerald-800 tracking-widest focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-slate-200/80">
                <span className="text-slate-500">Allocated: ₹{totalAllocated.toLocaleString()}</span>
                <span className={remainingBudget >= 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                  Unallocated: ₹{remainingBudget.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Budget Categories Grid */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Select & Edit Category Budgets</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {CATEGORY_PRESETS.map((item) => {
                  const isSelected = categoryBudgets[item.category] !== undefined;
                  return (
                    <div
                      key={item.category}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-300 text-slate-900'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleCategoryToggle(item.category)}
                        className="flex items-center gap-2 text-left flex-1"
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-xs font-medium">{item.category}</span>
                      </button>

                      {isSelected && (
                        <div className="relative w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                          <input
                            type="number"
                            value={categoryBudgets[item.category]}
                            onChange={(e) => handleAmountChange(item.category, e.target.value)}
                            placeholder="0"
                            className="w-full bg-white border border-emerald-300 rounded-xl py-1 pl-6 pr-2 text-xs text-right font-semibold text-slate-900 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optional Initial Goal Setup */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">🎯 Are you saving for something?</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500">Goal Name</span>
                  <input
                    type="text"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="e.g. Laptop"
                    className="w-full bg-white border border-slate-300 rounded-xl py-1.5 px-3 text-xs text-slate-800 mt-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500">Target Amount (₹)</span>
                  <input
                    type="number"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="Enter target"
                    className="w-full bg-white border border-slate-300 rounded-xl py-1.5 px-3 text-xs text-slate-800 mt-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500">Initial Deposit (₹)</span>
                  <input
                    type="number"
                    value={goalDeposit}
                    onChange={(e) => setGoalDeposit(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white border border-slate-300 rounded-xl py-1.5 px-3 text-xs text-slate-800 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Finish Action Button */}
            <button
              type="button"
              onClick={handleFinishSetup}
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {submitting ? 'Saving Budget Plan...' : 'Complete Setup & Open Dashboard'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
