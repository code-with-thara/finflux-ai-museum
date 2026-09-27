import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('smartbudget_token') || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auto restore session on boot
  useEffect(() => {
    async function restoreSession() {
      if (token) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data.user);
        } catch (err) {
          console.warn('Session expired or invalid token:', err);
          logout();
        }
      }
      setLoading(false);
    }
    restoreSession();
  }, [token]);

  const login = async (email, password) => {
    setError(null);
    try {
      const res = await authAPI.login({ email, password });
      const { token: jwtToken, user: userData } = res.data;
      localStorage.setItem('smartbudget_token', jwtToken);
      localStorage.setItem('smartbudget_user', JSON.stringify(userData));
      setToken(jwtToken);
      setUser(userData);
      return userData;
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to log in. Please check credentials.';
      setError(errMsg);
      throw new Error(errMsg);
    }
  };

  const register = async (nameOrPayload, email, password, confirmPassword) => {
    setError(null);
    try {
      let payload;
      if (typeof nameOrPayload === 'object') {
        payload = nameOrPayload;
      } else {
        payload = { name: nameOrPayload, email, password, confirmPassword };
      }
      const res = await authAPI.register(payload);
      const { token: jwtToken, user: userData } = res.data;
      localStorage.setItem('smartbudget_token', jwtToken);
      localStorage.setItem('smartbudget_user', JSON.stringify(userData));
      setToken(jwtToken);
      setUser(userData);
      return userData;
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Registration failed. Please try again.';
      setError(errMsg);
      throw new Error(errMsg);
    }
  };

  const completeOnboarding = async (onboardingData) => {
    try {
      const res = await authAPI.completeOnboarding(onboardingData);
      const updatedUser = res.data.user;
      setUser(updatedUser);
      localStorage.setItem('smartbudget_user', JSON.stringify(updatedUser));
      return updatedUser;
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      throw err;
    }
  };

  const updateUserSettings = async (settingsData) => {
    try {
      const res = await authAPI.updateSettings(settingsData);
      const updatedUser = res.data.user;
      setUser(updatedUser);
      localStorage.setItem('smartbudget_user', JSON.stringify(updatedUser));
      return updatedUser;
    } catch (err) {
      console.error('Failed to update settings:', err);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('smartbudget_token');
    localStorage.removeItem('smartbudget_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        register,
        completeOnboarding,
        updateUserSettings,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
