import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { aiAPI } from '../services/api';
import { Bot, Send, User, Sparkles, HelpCircle, RefreshCw } from 'lucide-react';

const PRESET_QUESTIONS = [
  "How much did I spend on food this month?",
  "How much of my budget is left?",
  "How much have I saved so far?",
  "What am I spending the most money on?",
  "Can I spend ₹1,000 this weekend?",
  "Where can I reduce my spending?",
];

export default function AIAssistantView() {
  const { user } = useAuth();
  const currency = user?.currency || '₹';

  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      text: `Hello ${user?.name || 'there'}! 👋 I am your SmartBudget AI assistant. I have full access to your stored financial records. Ask me anything about your spending, budget status, or savings goals!`
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (queryText) => {
    const text = queryText || inputMessage;
    if (!text.trim() || loading) return;

    const userMsg = { id: Date.now(), role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const res = await aiAPI.chat(text.trim(), messages);
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', text: res.data.reply };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('AI Assistant error:', err);
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', text: 'I am sorry, I couldn\'t process that question right now. Please try again.' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-20 md:pb-8 space-y-4">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20 shrink-0">
          <Bot className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-100">SmartBudget AI Financial Assistant</h1>
          <p className="text-xs text-slate-400">
            Ask questions about your transactions, remaining budget, or savings progress.
          </p>
        </div>
      </div>

      {/* Preset Question Chips */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
          Tap a sample question to ask:
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(q)}
              className="px-3 py-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 hover:border-emerald-500/40 text-xs text-slate-300 transition-all text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl min-h-[450px] max-h-[550px] overflow-y-auto flex flex-col space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-[85%] ${
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

            <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-md'
                : 'bg-slate-850 border border-slate-750 text-slate-200'
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
            <div className="bg-slate-850 border border-slate-750 text-slate-400 text-xs px-4 py-3 rounded-2xl flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Checking your financial database...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask a question about your money..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-2xl py-3 pl-4 pr-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={!inputMessage.trim() || loading}
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-40 transition-all"
        >
          <span>Ask</span>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
