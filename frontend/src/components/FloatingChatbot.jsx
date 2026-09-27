import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { aiAPI } from '../services/api';
import { 
  Bot, 
  Send, 
  User, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  MessageSquare,
  HelpCircle,
  Minimize2,
  Maximize2,
  Zap,
  ArrowRight
} from 'lucide-react';

const PRESET_CHIPS = [
  "300 for savings",
  "900 for gold",
  "50 for tea",
  "1500 for electricity bill",
  "1000 for food budget",
  "How much of my budget is left?",
  "What is my available balance?",
  "Where can I reduce spending?"
];

export default function FloatingChatbot({ onDataUpdated }) {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      text: `Hello ${user?.name || 'there'}! 👋 Welcome to SmartBudget AI Full Screen Assistant. I am connected live to your account records.\n\n• Speak or type any command like "300 for savings", "900 for gold", "50 for tea", "1500 for bill", "1000 for food budget" to auto-store it in your database!\n• Or ask any question about your balance, expenses, and budget!`
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Voice Assistant states
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Text-To-Speech output
  const speakText = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanSpeech = text.replace(/[*_#`•]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanSpeech);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInputText('');
      recognitionRef.current?.start();
    }
  };

  const handleSend = async (overrideText) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || loading) return;

    const userMsg = { id: Date.now(), role: 'user', text: textToSend.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      let replyText = '';
      try {
        const execRes = await aiAPI.execute(textToSend.trim());
        if (execRes && execRes.data && execRes.data.message) {
          replyText = `✅ ${execRes.data.message}`;
          if (execRes.data.savingsNotification) {
            replyText += `\nℹ️ ${execRes.data.savingsNotification}`;
          }
          if (onDataUpdated) onDataUpdated();
        }
      } catch {
        const chatRes = await aiAPI.chat(textToSend.trim(), messages);
        replyText = chatRes.data.reply;
      }

      if (!replyText) {
        replyText = 'Command processed successfully.';
      }

      const assistantMsg = { id: Date.now() + 1, role: 'assistant', text: replyText };
      setMessages(prev => [...prev, assistantMsg]);
      speakText(replyText);
    } catch (err) {
      console.error('Chatbot error:', err);
      const errorMsg = { id: Date.now() + 1, role: 'assistant', text: 'I encountered an issue processing that. Please try again.' };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FLOATING ACTION BUTTON (Right Corner Symbol) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-15 h-15 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white flex items-center justify-center shadow-2xl shadow-emerald-600/40 transform hover:scale-105 active:scale-95 transition-all group border-2 border-white/30"
          title="Open Full Screen SmartBudget AI Chatbot"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="w-8 h-8 text-white stroke-[2.2] transform group-hover:rotate-6 transition-transform" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-300 rounded-full border-2 border-white animate-pulse" />
          </div>
        </button>
      )}

      {/* FULL SCREEN CHATBOT OVERLAY */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col font-sans animate-fade-in selection:bg-emerald-500 selection:text-white">
          
          {/* Full Screen Top Header Bar */}
          <div className="px-4 sm:px-8 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/25">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                    SmartBudget <span className="text-emerald-400 font-extrabold">AI Chatbot</span>
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-500/40 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Full Screen Mode
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  Real-time database integration & voice assistant responses
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                  voiceEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
                title={voiceEnabled ? 'Voice Responses Enabled' : 'Voice Responses Muted'}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden sm:inline">{voiceEnabled ? 'Voice On' : 'Muted'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                title="Close Full Screen Chatbot"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Preset Action & Question Chips Bar */}
          <div className="px-4 sm:px-8 py-2.5 bg-slate-900/60 border-b border-slate-800/80 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Presets:</span>
            </span>
            {PRESET_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(chip)}
                className="px-3 py-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-emerald-500/40 text-xs font-bold text-emerald-300 transition-all shrink-0 shadow-sm"
              >
                ⚡ {chip}
              </button>
            ))}
          </div>

          {/* Full Screen Chat Messages Area */}
          <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 overflow-y-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[90%] sm:max-w-[75%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-slate-200 border border-slate-700'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 whitespace-pre-line'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 mr-auto items-center">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-slate-900 border border-slate-800 text-slate-400 text-xs px-4 py-3 rounded-2xl flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Processing input & updating financial records...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Full Screen Bottom Input Dock */}
          <div className="p-4 sm:p-6 bg-slate-900 border-t border-slate-800 shadow-2xl">
            <div className="max-w-5xl mx-auto">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      isListening 
                        ? '🎙️ Listening... speak now (e.g. "300 for savings", "900 for gold")' 
                        : 'Type e.g. "300 for savings", "900 for gold", "50 for tea", or ask any question...'
                    }
                    className={`w-full bg-slate-950 border rounded-2xl py-3.5 pl-4 pr-12 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors ${
                      isListening ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-slate-800 focus:border-emerald-500'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                      isListening ? 'bg-rose-500 text-white animate-pulse' : 'text-slate-400 hover:text-emerald-400'
                    }`}
                    title="Voice Assistant: Speak your command"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!inputText.trim() || loading}
                  className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-40 transition-all shrink-0"
                >
                  <span>Send</span>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

        </div>
      )}
    </>
  );
}
