import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, X, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { aiAPI, transactionAPI } from '../services/api';

export default function VoiceAssistantModal({ isOpen, onClose, onTransactionCreated }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('idle'); // idle, listening, processing, speaking, success, error
  const [responseMessage, setResponseMessage] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopSpeaking();
      setTranscript('');
      setResponseMessage('');
      setStatus('idle');
      return;
    }

    // Initialize Web Speech API if supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Default to Indian English context or fallback

      recognition.onstart = () => {
        setIsListening(true);
        setStatus('listening');
        setTranscript('');
        setResponseMessage('');
      };

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          setStatus('error');
          setResponseMessage('Voice input failed. Please try speaking again.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      startListening();
    } else {
      setStatus('error');
      setResponseMessage('Web Speech API is not supported in this browser. Please use Google Chrome, Edge, or Safari.');
    }

    return () => {
      stopListening();
      stopSpeaking();
    };
  }, [isOpen]);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Recognition start exception:', e);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => {
        setStatus('idle');
      };
      setStatus('speaking');
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleProcessSpeech = async () => {
    if (!transcript.trim()) return;
    stopListening();
    setStatus('processing');

    try {
      // 1. Parse spoken statement via backend AI parser
      const parseRes = await aiAPI.parseTransaction(transcript);
      const result = parseRes.data.result;

      if (result.intent === 'create_transaction' && result.amount && !result.requires_clarification) {
        // Automatically save transaction
        const txRes = await transactionAPI.create({
          type: result.type || 'expense',
          category: result.category || 'Other',
          amount: result.amount,
          description: result.description || transcript,
          date: result.date || new Date().toISOString().split('T')[0]
        });

        const reply = `✅ Recorded ₹${result.amount} for ${result.category}.`;
        setResponseMessage(reply);
        setStatus('success');
        setParsedData(result);
        speakText(reply);

        if (onTransactionCreated) {
          onTransactionCreated();
        }
      } else if (result.requires_clarification) {
        setResponseMessage(result.clarification_prompt);
        setStatus('idle');
        speakText(result.clarification_prompt);
      } else {
        // Fallback to conversational Q&A assistant query
        const chatRes = await aiAPI.chat(transcript);
        const reply = chatRes.data.reply;
        setResponseMessage(reply);
        setStatus('speaking');
        speakText(reply);
      }
    } catch (err) {
      console.error('Voice processing error:', err);
      setStatus('error');
      setResponseMessage('Failed to process voice input. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-lg">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-100 p-1.5 rounded-full bg-slate-800/60"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-100">SmartBudget Voice Assistant</h3>
        <p className="text-xs text-slate-400 mt-1">Speak your transaction or ask a question naturally.</p>

        {/* Listening / Microphone Animation Container */}
        <div className="my-8 flex flex-col items-center justify-center">
          <div className="relative">
            {isListening && (
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-pulse-ring scale-125" />
            )}
            <button
              onClick={isListening ? stopListening : startListening}
              className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/40 scale-105'
                  : status === 'speaking'
                  ? 'bg-teal-500 text-slate-950 animate-pulse'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700'
              }`}
            >
              {isListening ? (
                <Mic className="w-10 h-10 animate-bounce" />
              ) : status === 'speaking' ? (
                <Volume2 className="w-10 h-10" />
              ) : (
                <MicOff className="w-10 h-10 text-slate-400" />
              )}
            </button>
          </div>

          <span className="text-xs font-semibold text-emerald-400 mt-4">
            {isListening
              ? '🎙 Listening... Speak now'
              : status === 'processing'
              ? '⚡ Understanding your voice...'
              : status === 'speaking'
              ? '🔊 Responding...'
              : 'Tap microphone to speak'}
          </span>
        </div>

        {/* Transcript Box */}
        {transcript && (
          <div className="mb-4 p-3 bg-slate-850 border border-slate-800 rounded-2xl text-xs text-slate-200 text-left">
            <span className="text-[10px] text-slate-400 block mb-1">You said:</span>
            <p className="font-medium italic">"{transcript}"</p>
          </div>
        )}

        {/* AI Response Display */}
        {responseMessage && (
          <div className={`mb-4 p-3.5 rounded-2xl text-xs text-left flex items-start gap-2.5 ${
            status === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : status === 'error'
              ? 'bg-red-500/10 border border-red-500/30 text-red-300'
              : 'bg-slate-800 border border-slate-700 text-slate-200'
          }`}>
            {status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : status === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            ) : (
              <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            )}
            <div>{responseMessage}</div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex gap-2">
          {transcript && !isListening && status !== 'processing' && (
            <button
              onClick={handleProcessSpeech}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow-md transition-all"
            >
              Send Spoken Command
            </button>
          )}
          <button
            onClick={() => { stopListening(); stopSpeaking(); onClose(); }}
            className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold py-2.5 rounded-xl text-xs border border-slate-700 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
