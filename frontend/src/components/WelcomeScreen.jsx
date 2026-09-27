import React from 'react';
import { Zap, Bot, Sparkles, ArrowRight, ShieldCheck, PieChart, TrendingUp, MessageSquare } from 'lucide-react';

export default function WelcomeScreen({ onContinue }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 sm:p-6 relative overflow-hidden selection:bg-emerald-500 selection:text-white">
      {/* Dynamic Background Glowing Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-100/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 left-10 w-72 h-72 bg-sky-100/40 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-lg bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-xl relative z-10 flex flex-col items-center text-center space-y-7 animate-in fade-in zoom-in duration-500">
        
        {/* 1. SmartBudget AI Brand Logo */}
        <div className="flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/25 transition-transform group-hover:scale-105">
            <Zap className="w-7 h-7 text-white stroke-[2.5]" />
          </div>
          <div className="text-left">
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              SmartBudget <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold ml-0.5">AI</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Smart AI Financial Manager</span>
          </div>
        </div>

        {/* 2. Animated AI Bot Avatar & Animated Speech Bubble */}
        <div className="relative my-3 flex flex-col items-center">
          {/* Bot Speech Bubble */}
          <div className="mb-3 px-4 py-2 bg-emerald-600 text-white rounded-2xl shadow-lg text-xs font-extrabold flex items-center gap-2 animate-bounce">
            <MessageSquare className="w-4 h-4 text-emerald-200 fill-emerald-200" />
            <span>"Welcome to SmartBudget AI! Let's build your financial future together."</span>
          </div>

          {/* Halo Glow */}
          <div className="absolute inset-0 -m-3 rounded-full bg-emerald-100 animate-pulse blur-xl" />
          
          {/* Friendly Robot Avatar Container */}
          <div className="relative z-10 w-32 h-32 rounded-3xl bg-emerald-50 border-2 border-emerald-300 shadow-md flex flex-col items-center justify-center p-3 transition-transform hover:scale-105">
            {/* AI Bot Icon & Badge */}
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md mb-2 animate-pulse">
              <Bot className="w-10 h-10" />
            </div>

            {/* AI Assistant Status Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-emerald-200 text-[11px] font-bold text-emerald-700 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>AI Assistant Active</span>
            </div>
          </div>

          {/* Sparkles Floating Accents */}
          <Sparkles className="w-6 h-6 text-amber-400 absolute -top-2 -right-2 animate-bounce" />
          <Sparkles className="w-4 h-4 text-emerald-500 absolute -bottom-1 -left-2" />
        </div>

        {/* 3. Welcome Headings & Subtitle */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome to SmartBudget AI 👋
          </h1>
          <p className="text-sm sm:text-base text-slate-600 font-medium max-w-sm mx-auto">
            Your personal AI-powered financial assistant
          </p>
          <p className="text-xs text-slate-500 max-w-xs mx-auto pt-1">
            Track daily spending, set custom budget limits, and gain real-time AI financial insights.
          </p>
        </div>

        {/* 4. Feature Pills Preview */}
        <div className="grid grid-cols-3 gap-2 w-full pt-1">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
            <PieChart className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
            <span className="text-[10px] font-semibold text-slate-700 block">Smart Budgets</span>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
            <TrendingUp className="w-4 h-4 text-teal-600 mx-auto mb-1" />
            <span className="text-[10px] font-semibold text-slate-700 block">Live Alerts</span>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-center">
            <ShieldCheck className="w-4 h-4 text-sky-600 mx-auto mb-1" />
            <span className="text-[10px] font-semibold text-slate-700 block">Safe & Private</span>
          </div>
        </div>

        {/* 5. Next Button */}
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span>Next</span>
          <ArrowRight className="w-5 h-5 stroke-[2.5]" />
        </button>

      </div>
    </div>
  );
}
