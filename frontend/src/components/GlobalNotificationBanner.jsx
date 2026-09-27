import React, { useState } from 'react';
import { AlertTriangle, Bell, PiggyBank, X, CheckCircle2, ChevronRight } from 'lucide-react';

export default function GlobalNotificationBanner({ alerts = [], setActiveTab }) {
  const [dismissedIds, setDismissedIds] = useState([]);

  if (!alerts || alerts.length === 0) return null;

  const activeAlerts = alerts.filter((_, idx) => !dismissedIds.includes(idx));

  if (activeAlerts.length === 0) return null;

  const handleDismiss = (idx, e) => {
    e.stopPropagation();
    setDismissedIds(prev => [...prev, idx]);
  };

  return (
    <div className="w-full bg-amber-50/70 border-b border-amber-200/80 px-4 py-2.5 space-y-2 shadow-sm">
      <div className="max-w-7xl mx-auto space-y-2">
        {alerts.map((alert, idx) => {
          if (dismissedIds.includes(idx)) return null;

          const isExceeded = alert.status === 'exceeded';
          const isReached = alert.status === 'reached';
          const isWarning = alert.status === 'warning' || alert.status === 'critical';
          const isBill = alert.status === 'bill' || alert.type === 'bill_due_tomorrow' || alert.title?.includes('🔔');
          const isBankSavings = alert.status === 'savings' || alert.title?.includes('🏦');

          return (
            <div
              key={idx}
              className={`p-3 rounded-xl text-xs flex items-center justify-between gap-3 border transition-all ${
                isExceeded
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : isReached
                  ? 'bg-red-50 border-red-200 text-red-800 font-semibold'
                  : isWarning
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : isBill
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : isBankSavings
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-white border-slate-200 text-slate-800 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="shrink-0">
                  {isBill ? (
                    <Bell className="w-4 h-4 text-blue-600 animate-bounce" />
                  ) : isBankSavings ? (
                    <PiggyBank className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className={`w-4 h-4 ${isExceeded ? 'text-rose-600' : isReached ? 'text-red-600' : 'text-amber-600'}`} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {alert.title && (
                    <span className="font-bold block tracking-tight text-[11px] uppercase mb-0.5">
                      {alert.title}
                    </span>
                  )}
                  <span className="truncate block font-medium">{alert.message}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isBill && setActiveTab && (
                  <button
                    onClick={() => setActiveTab('bills')}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-sm"
                  >
                    <span>View Bill</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}

                {(isExceeded || isReached || isWarning) && setActiveTab && (
                  <button
                    onClick={() => setActiveTab('budget')}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-sm"
                  >
                    <span>Adjust Budget</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}

                <button
                  onClick={(e) => handleDismiss(idx, e)}
                  title="Dismiss notification"
                  className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
