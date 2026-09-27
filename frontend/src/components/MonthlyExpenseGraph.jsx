import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, ArrowUpRight } from 'lucide-react';

export default function MonthlyExpenseGraph({ data, currency = '₹' }) {
  const history = data?.history || [];
  const currentMonthSpent = data?.currentMonthSpent || 0;
  const highestMonth = data?.highestMonth;
  const lowestMonth = data?.lowestMonth;

  // Compute maximum amount for bar height scaling
  const maxAmount = Math.max(...history.map(m => m.amount), 1000);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Monthly Expense Trends</h3>
            <p className="text-xs text-slate-500">Track and compare your expenditure across months</p>
          </div>
        </div>

        {/* Quick Highlights */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            <span>This Month: <strong className="text-slate-900">{currency}{currentMonthSpent.toLocaleString()}</strong></span>
          </div>

          {highestMonth && highestMonth.amount > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
              <span>Highest: <strong className="text-rose-900">{highestMonth.name} ({currency}{highestMonth.amount.toLocaleString()})</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Visual Bar Chart */}
      {history.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">
          No monthly expenditure records found yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="h-56 flex items-end justify-between gap-2 sm:gap-4 pt-6 px-2">
            {history.map((item, idx) => {
              const heightPercent = Math.max(8, Math.round((item.amount / maxAmount) * 100));
              const isCurrent = item.isCurrent;
              const isHighest = highestMonth && item.monthName === highestMonth.name && item.amount > 0;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  {/* Tooltip on Hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[11px] font-bold py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap shadow-md z-10">
                    {item.monthName}: {currency}{item.amount.toLocaleString()}
                  </div>

                  {/* Value on top of bar if > 0 */}
                  <span className={`text-[10px] font-bold mb-1.5 transition-colors ${
                    isCurrent ? 'text-emerald-700' : isHighest ? 'text-rose-700' : 'text-slate-500'
                  }`}>
                    {item.amount > 0 ? `${currency}${item.amount >= 1000 ? (item.amount / 1000).toFixed(1) + 'k' : item.amount}` : `${currency}0`}
                  </span>

                  {/* Bar */}
                  <div className="w-full max-w-[48px] bg-slate-100 rounded-t-xl overflow-hidden flex items-end h-full">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-xl transition-all duration-700 ${
                        isCurrent
                          ? 'bg-gradient-to-t from-emerald-600 to-teal-500 shadow-md shadow-emerald-500/20'
                          : isHighest
                          ? 'bg-gradient-to-t from-rose-500 to-orange-400'
                          : item.amount > 0
                          ? 'bg-gradient-to-t from-slate-400 to-slate-300 group-hover:from-emerald-500 group-hover:to-teal-400'
                          : 'bg-slate-200'
                      }`}
                    />
                  </div>

                  {/* Month Label */}
                  <div className="text-center mt-2.5">
                    <span className={`block text-xs font-bold ${
                      isCurrent ? 'text-emerald-700' : 'text-slate-700'
                    }`}>
                      {item.shortName}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-medium">
                      {item.year}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month-to-Month Spending Insight Footer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
              <span className="text-slate-500">Current Month</span>
              <span className="font-bold text-emerald-700">{currency}{currentMonthSpent.toLocaleString()}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
              <span className="text-slate-500">Peak Spending</span>
              <span className="font-bold text-rose-700">
                {highestMonth ? `${highestMonth.name} (${currency}${highestMonth.amount.toLocaleString()})` : 'None'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
              <span className="text-slate-500">Lowest Spending</span>
              <span className="font-bold text-teal-700">
                {lowestMonth ? `${lowestMonth.name} (${currency}${lowestMonth.amount.toLocaleString()})` : 'None'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
