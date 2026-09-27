import axios from 'axios';

// Vercel (frontend) -> Render (backend):
// Set VITE_API_URL=https://<your-backend>.onrender.com/api in Vercel env.
// Local dev falls back to '/api' (vite proxy -> localhost:5000).
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT token in Authorization header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smartbudget_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle auth failures globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token on authentication failure
      localStorage.removeItem('smartbudget_token');
      localStorage.removeItem('smartbudget_user');
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  completeOnboarding: (data) => api.post('/auth/onboarding', data),
  updateSettings: (data) => api.put('/auth/settings', data),
};

export const transactionAPI = {
  getSummary: () => api.get('/transactions/summary'),
  getAll: (params) => api.get('/transactions', { params }),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
};

export const budgetAPI = {
  getAll: (params) => api.get('/budgets', { params }),
  setBudget: (data) => api.post('/budgets', data),
  toggle: (data) => api.post('/budgets/toggle', data),
  deleteBudget: (id) => api.delete(`/budgets/${id}`),
};

export const goalAPI = {
  getAll: () => api.get('/goals'),
  create: (data) => api.post('/goals', data),
  deposit: (id, data) => api.post(`/goals/${id}/deposit`, data),
  withdraw: (id, data) => api.post(`/goals/${id}/withdraw`, data),
  delete: (id) => api.delete(`/goals/${id}`),
};

export const billAPI = {
  getAll: () => api.get('/bills'),
  create: (data) => api.post('/bills', data),
  update: (id, data) => api.put(`/bills/${id}`, data),
  markAsPaid: (id) => api.post(`/bills/${id}/pay`),
  delete: (id) => api.delete(`/bills/${id}`),
};

export const bankSavingsAPI = {
  get: () => api.get('/transactions/bank-savings'),
  transfer: (data) => api.post('/transactions/bank-savings/transfer', data),
  processMonthEnd: (data) => api.post('/transactions/bank-savings/month-end', data || {}),
  update: (data) => api.put('/transactions/bank-savings', data),
};

export const aiAPI = {
  parseTransaction: (input) => api.post('/ai/parse', { input }),
  execute: (input) => api.post('/ai/execute', { input }),
  chat: (message, history) => api.post('/ai/chat', { message, history }),
  getSuggestions: () => api.get('/ai/suggestions'),
};

export default api;
