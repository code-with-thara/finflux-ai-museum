import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Check, X, AlertCircle, ArrowRight } from 'lucide-react';
import { transactionAPI, aiAPI } from '../services/api';

const CATEGORY_MAP = [
  { category: 'House Rent', keywords: ['rent', 'house rent', 'room rent', 'flat rent', 'hostel', 'pg'] },
  { category: 'EMI', keywords: ['emi', 'loan', 'installment', 'credit card bill', 'card bill', 'car emi', 'home emi'] },
  { category: 'Groceries', keywords: ['grocery', 'groceries', 'vegetables', 'fruits', 'milk', 'supermarket', 'mart', 'provision', 'rice', 'dal', 'oil', 'kirana'] },
  { category: 'Food', keywords: ['food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'hotel', 'swiggy', 'zomato', 'pizza', 'burger', 'biryani', 'meal'] },
  { category: 'Snacks', keywords: ['snack', 'snacks', 'tea', 'coffee', 'chai', 'biscuit', 'juice', 'bakery', 'samosa', 'ice cream', 'vada', 'dosa', 'maggi', 'chips'] },
  { category: 'Transport', keywords: ['transport', 'travel', 'fuel', 'petrol', 'diesel', 'cab', 'uber', 'ola', 'auto', 'taxi', 'bus', 'train', 'metro', 'toll', 'parking'] },
  { category: 'Electricity', keywords: ['electricity', 'current bill', 'power bill', 'eb bill', 'electric'] },
  { category: 'Mobile Recharge', keywords: ['mobile', 'recharge', 'wifi', 'internet', 'broadband', 'phone bill', 'sim', 'airtel', 'jio', 'vi'] },
  { category: 'Entertainment', keywords: ['entertainment', 'movie', 'cinema', 'theatre', 'netflix', 'prime', 'hotstar', 'spotify', 'game', 'party', 'outing'] },
  { category: 'Shopping', keywords: ['shopping', 'clothes', 'dress', 'shirt', 'pants', 'shoes', 'amazon', 'flipkart', 'myntra', 'gadget', 'mall'] },
  { category: 'Education', keywords: ['education', 'school', 'college', 'tuition', 'books', 'stationery', 'course', 'fees', 'exam', 'udemy'] },
  { category: 'Health', keywords: ['health', 'doctor', 'hospital', 'medicine', 'pharmacy', 'medical', 'clinic', 'dentist', 'tablet', 'consultation'] },
  { category: 'Policy Plans', keywords: ['policy', 'insurance', 'lic', 'term plan', 'health insurance', 'life insurance', 'premium'] },
  { category: 'Other Expense', keywords: ['other', 'misc', 'miscellaneous', 'repair', 'maintenance', 'donation', 'gift'] },
];

export function parseVoiceInput(text) {
  if (!text || typeof text !== 'string') return null;

  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();

  // 1. Extract Amount
  let extractedAmount = null;
  const amountMatch = lowerText.match(/(?:(?:rs\.?|inr|₹|rupees?)\s*)?(\d+(?:,\d+)*(?:\.\d{1,2})?)(?:\s*(?:rupees?|rs\.?|inr|bucks))?/i) || lowerText.match(/(\d+)/);
  if (amountMatch && amountMatch[1]) {
    extractedAmount = Number(amountMatch[1].replace(/,/g, ''));
  }

  // 2. Check Bank Savings Deposit Intent (e.g. "savings 500", "300 for savings", "save 500 in bank")
  if (/\b(savings|saving|save|deposit|reserve)\b/i.test(lowerText) && !lowerText.includes('goal') && !lowerText.includes('bill') && !lowerText.includes('spent') && !lowerText.includes('paid') && !lowerText.includes('bought') && !lowerText.includes('budget')) {
    return {
      intent: 'bank_savings_deposit',
      amount: extractedAmount || 0,
      category: 'Bank Savings',
      description: 'Bank Savings Deposit',
      rawText: cleanText
    };
  }

  // 3. Check Savings Goal Intent (e.g. "900 for gold", "save 5000 for laptop", "goal 20000 for car")
  if (lowerText.includes('goal') || lowerText.includes('saving for') || lowerText.includes('save for') || /\b(gold|laptop|car|bike|trip|house|home|jewel|jewellery|phone|iphone|wedding|vacation)\b/i.test(lowerText)) {
    let goalName = 'Savings Goal';
    const specificMatch = lowerText.match(/(?:for|on|target|goal)\s+([a-zA-Z\s]{2,20})/i);
    if (specificMatch && specificMatch[1]) {
      goalName = specificMatch[1].replace(/(?:goal|target|budget|saving|savings|the|a)\s*/gi, '').trim();
    }
    if (!goalName || goalName.length < 2) {
      if (lowerText.includes('gold')) goalName = 'Gold';
      else if (lowerText.includes('laptop')) goalName = 'Laptop';
      else if (lowerText.includes('car')) goalName = 'Car';
      else if (lowerText.includes('bike')) goalName = 'Bike';
      else goalName = 'Savings Goal';
    }
    goalName = goalName.charAt(0).toUpperCase() + goalName.slice(1);

    return {
      intent: 'create_goal',
      amount: extractedAmount || 5000,
      category: 'Savings Goal',
      description: `Target Goal: ${goalName}`,
      rawText: cleanText
    };
  }

  // 4. Check Category Budget Intent (e.g. "1000 for food budget", "500 budget for snacks")
  if (lowerText.includes('budget')) {
    let matchedCategory = 'Other Expense';
    if (/\b(snack|snacks|tea|coffee|chai)\b/i.test(lowerText)) matchedCategory = 'Snacks';
    else if (/\b(food|lunch|dinner)\b/i.test(lowerText)) matchedCategory = 'Food';
    else if (/\b(grocery|groceries)\b/i.test(lowerText)) matchedCategory = 'Groceries';
    else if (/\b(rent)\b/i.test(lowerText)) matchedCategory = 'House Rent';
    else if (/\b(transport|petrol)\b/i.test(lowerText)) matchedCategory = 'Transport';
    else if (/\b(electricity)\b/i.test(lowerText)) matchedCategory = 'Electricity';
    else if (/\b(mobile|recharge)\b/i.test(lowerText)) matchedCategory = 'Mobile Recharge';
    else if (/\b(shopping|clothes)\b/i.test(lowerText)) matchedCategory = 'Shopping';

    return {
      intent: 'create_budget',
      amount: extractedAmount || 1000,
      category: `Budget: ${matchedCategory}`,
      description: `Monthly Budget Limit for ${matchedCategory}`,
      rawText: cleanText
    };
  }

  // 5. Check Recurring Bill Intent (e.g. "1500 for electricity bill", "500 for wifi bill")
  if (lowerText.includes('bill')) {
    let billName = cleanText
      .replace(/(?:add|set|create|new|bill|due|on|day|\d{1,2}th|\d{1,2}st|\d{1,2}nd|\d{1,2}rd)\s*/gi, '')
      .replace(/(?:rs\.?|inr|₹|rupees?)\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi, '')
      .replace(/\d+(?:,\d+)*(?:\.\d{1,2})?\s*(?:rupees?|rs\.?|inr|bucks)?/gi, '')
      .trim();

    if (!billName || billName.length < 2) billName = 'Utility Bill';
    else billName = billName.charAt(0).toUpperCase() + billName.slice(1);

    return {
      intent: 'create_bill',
      amount: extractedAmount || 500,
      category: 'Recurring Bill',
      description: `Bill: ${billName}`,
      rawText: cleanText
    };
  }

  // 6. Extract Category (Default to 'Other Expense' if beyond category fields)
  let matchedCategory = 'Other Expense';
  for (const cat of CATEGORY_MAP) {
    const found = cat.keywords.some(kw => lowerText.includes(kw));
    if (found) {
      matchedCategory = cat.category;
      break;
    }
  }

  // 7. Extract Description
  let desc = cleanText
    .replace(/(?:spent|paid|add|record|bought|buy)\s*/gi, '')
    .replace(/(?:rs\.?|inr|₹|rupees?)\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi, '')
    .replace(/\d+(?:,\d+)*(?:\.\d{1,2})?\s*(?:rupees?|rs\.?|inr|bucks)/gi, '')
    .replace(/\b(?:for|on|in|to)\b/gi, '')
    .trim();

  if (!desc || desc.length < 2) {
    desc = matchedCategory;
  } else {
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);
  }

  return {
    intent: 'create_transaction',
    amount: extractedAmount,
    category: matchedCategory,
    description: desc,
    rawText: cleanText
  };
}

export default function VoiceExpenseAssistant({ onExpenseAdded, currency = '₹' }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // English (India) with INR vocabulary support

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
        setFeedback(null);
      };

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);

        // Live parse
        const parsed = parseVoiceInput(currentTranscript);
        if (parsed) {
          setParsedData(parsed);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied. Please allow microphone access in your browser.');
        } else if (event.error === 'no-speech') {
          setError('No speech detected. Please speak clearly into your microphone.');
        } else {
          setError(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleStartListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setTranscript('');
    setParsedData(null);
    setError(null);
    setFeedback(null);
    setIsModalOpen(true);

    try {
      recognitionRef.current?.start();
    } catch (err) {
      console.warn('Recognition start issue:', err);
    }
  };

  const handleStopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch (err) {
      console.warn('Recognition stop issue:', err);
    }
    setIsListening(false);
  };

  const handleConfirmSave = async () => {
    const rawInput = transcript.trim() || parsedData?.rawText || (parsedData?.amount ? `${parsedData.amount} for ${parsedData.category}` : '');
    if (!rawInput || saving) return;

    setSaving(true);
    setError(null);

    try {
      const res = await aiAPI.execute(rawInput);
      const msg = res.data.message;
      setFeedback(`✅ ${msg}`);
      speakText(msg);

      if (onExpenseAdded) {
        onExpenseAdded(res.data);
      }

      setTimeout(() => {
        setIsModalOpen(false);
        setTranscript('');
        setParsedData(null);
        setFeedback(null);
      }, 1800);
    } catch (err) {
      console.error('Failed to process voice/text command:', err);
      setError(err.response?.data?.error || 'Failed to process command. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleStartListening}
        className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0 shrink-0"
        title="Voice Assistance: Add expense using voice"
      >
        <Mic className="w-4 h-4 animate-pulse text-emerald-200" />
        <span>🎙️ Voice Add Expense</span>
      </button>

      {/* Voice Assistant Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-5 relative">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Voice Expense Assistant</h3>
                  <span className="text-[11px] text-slate-500">Speak naturally to record your expense</span>
                </div>
              </div>
              <button
                onClick={() => { handleStopListening(); setIsModalOpen(false); }}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Listening Visual / Pulse */}
            <div className="flex flex-col items-center justify-center py-4 space-y-3">
              <div className="relative">
                {isListening && (
                  <div className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
                )}
                <button
                  type="button"
                  onClick={isListening ? handleStopListening : handleStartListening}
                  className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all transform hover:scale-105 ${
                    isListening
                      ? 'bg-red-500 text-white shadow-red-500/30'
                      : 'bg-emerald-600 text-white shadow-emerald-600/30'
                  }`}
                >
                  {isListening ? (
                    <Mic className="w-9 h-9 animate-bounce" />
                  ) : (
                    <Mic className="w-9 h-9" />
                  )}
                </button>
              </div>

              <div className="text-center">
                <span className={`text-xs font-bold ${isListening ? 'text-emerald-700 animate-pulse' : 'text-slate-600'}`}>
                  {isListening ? '🎙️ Listening... (Say e.g. "Spent 500 on Groceries")' : 'Tap microphone to speak'}
                </span>
              </div>
            </div>

            {/* Live Transcript / Text Command Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Recognized Speech or Type Command:
              </label>
              <input
                type="text"
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  const parsed = parseVoiceInput(e.target.value);
                  if (parsed) setParsedData(parsed);
                }}
                placeholder='e.g. "spent 50 for tea", "save 5000 in bank", "set goal 20000 for laptop"'
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
              />
            </div>

            {/* Parsed Result Box */}
            {parsedData && parsedData.amount > 0 && (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    Parsed Command Details
                  </span>
                  <span className="text-base font-extrabold text-emerald-800">
                    {currency}{parsedData.amount.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-400 block font-medium">Category</span>
                    <span className="font-bold text-slate-800">{parsedData.category}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-400 block font-medium">Description</span>
                    <span className="font-bold text-slate-800 truncate block">{parsedData.description}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Errors / Feedback */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {feedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{feedback}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { handleStopListening(); setIsModalOpen(false); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={(!transcript.trim() && (!parsedData || !parsedData.amount)) || saving}
                onClick={handleConfirmSave}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
              >
                {saving ? 'Processing...' : 'Auto-Execute & Save'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
