import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { transactionAPI } from './services/api';
import AnimatedWelcomeScreen from './components/AnimatedWelcomeScreen';
import AuthView from './components/AuthView';
import Navbar from './components/Navbar';
import GlobalNotificationBanner from './components/GlobalNotificationBanner';
import OnboardingModal from './components/OnboardingModal';
import Dashboard from './components/Dashboard';
import TransactionsView from './components/TransactionsView';
import BudgetView from './components/BudgetView';
import BankSavingsView from './components/BankSavingsView';
import SavingsGoalsView from './components/SavingsGoalsView';
import BillsView from './components/BillsView';
import SettingsView from './components/SettingsView';
import FloatingChatbot from './components/FloatingChatbot';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [globalAlerts, setGlobalAlerts] = useState([]);
  // Always show the welcome page on every fresh app load/refresh
  const [showWelcome, setShowWelcome] = useState(true);

  const handleGetStarted = () => {
    setShowWelcome(false);
  };

  // Fetch summary alerts for the global top notification banner
  const fetchGlobalAlerts = async () => {
    if (!user) return;
    try {
      const res = await transactionAPI.getSummary();
      setGlobalAlerts(res.data.summary?.lowBudgetAlerts || []);
    } catch (err) {
      console.warn('Failed to load global alerts:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGlobalAlerts();
    }
  }, [user, activeTab]);

  // Welcome page is shown first on every app open, before anything else
  if (showWelcome) {
    return <AnimatedWelcomeScreen onGetStarted={handleGetStarted} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-sm font-bold text-slate-800">
            SmartBudget AI
          </h2>
          <p className="text-xs text-slate-500">Loading your financial workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView onBackToWelcome={() => setShowWelcome(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Global Top Notification System (Appears across ALL views) */}
      <GlobalNotificationBanner alerts={globalAlerts} setActiveTab={setActiveTab} />

      {/* Onboarding Flow for New Users */}
      <OnboardingModal />

      {/* Active Tab View */}
      <main className="flex-1">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'budget' && <BudgetView />}
        {activeTab === 'savings' && <BankSavingsView />}
        {activeTab === 'goals' && <SavingsGoalsView />}
        {activeTab === 'bills' && <BillsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
      {/* Floating Chatbot Widget with Voice Assistant (Bottom Right Corner) */}
      <FloatingChatbot onDataUpdated={fetchGlobalAlerts} />
    </div>
  );
}
