import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Settings, User, DollarSign, ToggleLeft, ToggleRight, Save, LogOut, CheckCircle2, Landmark } from 'lucide-react';

export default function SettingsView() {
  const { user, updateUserSettings, logout } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [currency, setCurrency] = useState(user?.currency || '₹');
  const [monthlyIncome, setMonthlyIncome] = useState(user?.monthly_income || 0);
  const [salaryDay, setSalaryDay] = useState(user?.salary_day || 1);
  const [bankSavings, setBankSavings] = useState(user?.bank_savings || 0);
  const [savingsPin, setSavingsPin] = useState(user?.savings_pin || '1234');
  const [rolloverEnabled, setRolloverEnabled] = useState(user?.rollover_enabled !== 0);
  const [budgetEnabled, setBudgetEnabled] = useState(user?.budget_enabled !== 0);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await updateUserSettings({
        name,
        currency,
        monthly_income: Number(monthlyIncome) || 0,
        salary_day: Number(salaryDay) || 1,
        bank_savings: Number(bankSavings) || 0,
        savings_pin: savingsPin || '1234',
        rollover_enabled: rolloverEnabled ? 1 : 0,
        budget_enabled: budgetEnabled ? 1 : 0
      });
      setFeedback('✅ Settings updated successfully!');
    } catch (err) {
      console.error('Failed to update settings:', err);
      setFeedback('❌ Failed to update settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Account Settings</h1>
          <p className="text-xs text-slate-500">Manage your profile, currency preferences, monthly income, salary arrival date, bank savings, and budget rules.</p>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
          <input
            type="email"
            disabled
            value={user?.email || ''}
            className="w-full bg-slate-100 border border-slate-200 rounded-xl py-2.5 px-4 text-xs text-slate-500 cursor-not-allowed"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Symbol</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs text-slate-900 focus:outline-none focus:bg-white"
            >
              <option value="₹">₹ (INR - Indian Rupee)</option>
              <option value="$">$ (USD - US Dollar)</option>
              <option value="€">€ (EUR - Euro)</option>
              <option value="£">£ (GBP - British Pound)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Income ({currency})</label>
            <input
              type="number"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Salary Credit Day (1 - 31)</label>
            <select
              value={salaryDay}
              onChange={(e) => setSalaryDay(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  Day {day} {day === 1 ? '(1st)' : day === 2 ? '(2nd)' : day === 3 ? '(3rd)' : `(${day}th)`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Savings ({currency})</label>
            <input
              type="number"
              value={bankSavings}
              onChange={(e) => setBankSavings(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-4 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Savings Security PIN</label>
            <input
              type="password"
              maxLength={4}
              value={savingsPin}
              onChange={(e) => setSavingsPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-4 text-xs font-bold text-center text-emerald-800 tracking-widest focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Budget Tracking Active Toggle */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Budget Tracking Active</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                budgetEnabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-700 border border-slate-300'
              }`}>
                {budgetEnabled ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Enable or disable monthly budget allocation limits and progress monitoring.
            </span>
          </div>

          <button
            type="button"
            onClick={() => setBudgetEnabled(!budgetEnabled)}
            className="text-emerald-600 focus:outline-none"
          >
            {budgetEnabled ? (
              <ToggleRight className="w-8 h-8 text-emerald-600" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-slate-400" />
            )}
          </button>
        </div>

        {/* Budget Rollover Toggle */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-slate-900 block">Enable Budget Rollover</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Unused budget from previous month rolls forward to increase next month's available budget.
            </span>
          </div>

          <button
            type="button"
            onClick={() => setRolloverEnabled(!rolloverEnabled)}
            className="text-emerald-600 focus:outline-none"
          >
            {rolloverEnabled ? (
              <ToggleRight className="w-8 h-8 text-emerald-600" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-slate-400" />
            )}
          </button>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="px-5 py-3 rounded-2xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold text-xs flex items-center gap-2 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </form>
    </div>
  );
}
