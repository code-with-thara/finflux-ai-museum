import React, { useState, useEffect } from 'react';
import { Bot, Volume2, VolumeX, Sparkles, ArrowRight, Zap, RefreshCw } from 'lucide-react';

export default function AnimatedWelcomeScreen({ onGetStarted }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);

  const welcomeMessage = "Welcome to SmartBudget AI! I am your personal AI financial manager.";

  const speakWelcome = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Reset any active speech
      const utterance = new SpeechSynthesisUtterance(welcomeMessage);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        setHasSpoken(true);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setHasSpoken(true);
      };

      // Select a natural sounding voice if available
      const voices = window.speechSynthesis.getVoices();
      const prefVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David')));
      if (prefVoice) utterance.voice = prefVoice;

      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      speakWelcome();
    }, 400);

    return () => {
      clearTimeout(timer);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleProceed = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    onGetStarted();
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-slate-50 selection:bg-emerald-500 selection:text-white">
      {/* Faint background grid */}
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Ambient Glowing Accents */}
      <div className="absolute top-[8%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-emerald-100/60 blur-3xl animate-glow-float pointer-events-none" />
      <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[460px] h-[460px] rounded-full bg-teal-100/50 blur-3xl animate-glow-float pointer-events-none" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center max-w-md mx-auto">
        
        {/* Brand Header Badge */}
        <div className="flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-white border border-slate-200/90 shadow-sm">
          <div className="w-5 h-5 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
            <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            SmartBudget <span className="text-emerald-700">AI</span>
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Robot Mascot & Animated Voice Bubble */}
        <div className="relative mb-6 flex flex-col items-center">
          
          {/* Animated Mascot Speech Bubble */}
          <div className="mb-4 px-4 py-2.5 bg-slate-900 text-white rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 border border-slate-700 animate-fade-in-up">
            <Bot className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
            <span className="text-slate-100 font-semibold">"{welcomeMessage}"</span>
            {isSpeaking && (
              <div className="flex items-center gap-0.5 ml-1">
                <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-teal-300 rounded-full animate-pulse delay-75" />
                <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-150" />
              </div>
            )}
          </div>

          {/* Halo Glow */}
          <div className="absolute inset-0 -m-6 rounded-full bg-emerald-200/50 blur-2xl animate-pulse" />

          {/* Robot Avatar Box */}
          <div className="relative z-10 w-36 h-36 rounded-[2.2rem] bg-white border-2 border-emerald-300 shadow-xl flex flex-col items-center justify-center p-4 transition-transform hover:scale-105">
            {/* Antenna */}
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md" />
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-1 h-3 bg-emerald-400 rounded-full" />

            {/* Robot Face Box */}
            <div className="w-22 h-14 rounded-2xl bg-gradient-to-tr from-slate-900 to-emerald-950 flex flex-col items-center justify-center p-2 shadow-inner border border-emerald-800/40">
              <div className="flex items-center gap-4 mb-1">
                <span className={`w-3.5 h-3.5 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-emerald-300'} shadow-sm`} />
                <span className={`w-3.5 h-3.5 rounded-full ${isSpeaking ? 'bg-emerald-400 animate-ping' : 'bg-emerald-300'} shadow-sm`} />
              </div>
              <span className="w-8 h-1 bg-emerald-400/80 rounded-full" />
            </div>


          </div>

          <Sparkles className="w-6 h-6 text-amber-400 absolute -top-2 -right-3 animate-bounce" />
        </div>

        {/* Headings */}
        <div className="space-y-1.5 mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome to <span className="text-emerald-700">SmartBudget AI</span> 👋
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xs mx-auto">
            Your personal AI-driven financial assistant & budget tracker
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={handleProceed}
            className="w-full py-3.5 px-8 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>Get Started to Sign In / Create Account</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

      </div>
    </div>
  );
}
