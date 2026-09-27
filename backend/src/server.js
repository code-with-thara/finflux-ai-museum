import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB, isDbReady, getDbStatus, closeDB } from './db/db.js';

import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import goalRoutes from './routes/goalRoutes.js';
import billRoutes from './routes/billRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: allow Vercel frontend(s). Comma-separated list supported:
// FRONTEND_URL=https://my-app.vercel.app,https://my-app-xyz.vercel.app
// Defaults to open (*) so existing deploys keep working.
const allowedOrigins = (process.env.FRONTEND_URL || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true
  })
);
app.use(express.json());

// Root route for Render health checks / human visits
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SmartBudget AI Backend API is running. Use /api/health for DB status.',
    timestamp: new Date().toISOString()
  });
});

// API Health Check (reports Atlas readiness; never gated, never crashes)
app.get('/api/health', (req, res) => {
  const ready = isDbReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    message: ready
      ? 'SmartBudget AI Backend API is running.'
      : 'API is running but the database is unavailable.',
    storage: 'mongodb-atlas',
    db: getDbStatus(),
    timestamp: new Date().toISOString()
  });
});

// Readiness gate: MongoDB Atlas is the sole source of truth. If the
// connection is down (or was never established), fail API calls with a clear
// 503 instead of crashing or serving stale/incorrect data.
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!isDbReady()) {
    return res.status(503).json({
      error: 'Database unavailable. Please try again in a moment.',
      storage: 'mongodb-atlas',
      db: getDbStatus()
    });
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/ai', aiRoutes);

// Global Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error. Please try again later.' });
});

// Serverless (Vercel) support: reuse one DB connection across warm invocations.
// Each cold start calls ensureDb() once; the /api readiness gate below keeps
// returning 503 (never crashing) if Atlas is momentarily unreachable.
let dbPromise = null;
export function ensureDb() {
  if (isDbReady()) return Promise.resolve();
  if (!dbPromise) {
    dbPromise = initDB().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}
// Deployment hosts (Render/Railway/Fly) require 0.0.0.0 and provide PORT.
// The process stays alive even if Atlas is unreachable at boot so that
// /api/health can report `degraded` and the background reconnect loop heals
// the app once Mongo is back — it never falls back to any local/JSON store.
async function boot() {
  try {
    await initDB();
  } catch (err) {
    console.error('MongoDB Atlas connection failed at boot:', String(err && err.message ? err.message : err).split('\n')[0]);
    console.error('Serving 503 for /api/* until the database is reachable. Verify MONGODB_URI, IP whitelist, and that TLS to *.mongodb.net:27017 is not filtered (run: npm run db:check).');
  }
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 SmartBudget AI Backend running on port ${PORT}`);
    console.log(`💾 Storage: MongoDB Atlas ${isDbReady() ? '(connected)' : '(NOT connected — /api/* returns 503)'}`);
    console.log(`====================================================`);
  });

  // Graceful shutdown: stop accepting, close the single shared Mongo
  // connection, then exit. Never closes connections per-request.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.log(`Received ${sig} — shutting down...`);
      server.close(async () => {
        await closeDB().catch(() => {});
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}

export default app;

// Long-lived servers (Render/Railway/local) boot the listener.
// On Vercel (process.env.VERCEL is set) the platform invokes the
// exported app per-request via api/index.js — never call app.listen there.
if (!process.env.VERCEL) {
  boot();
}
