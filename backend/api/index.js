// Vercel serverless entry: every request funnels into the Express app.
// DB connection is established once per (warm) instance via ensureDb();
// the app's /api readiness gate keeps serving 503 instead of crashing
// while Atlas is momentarily unreachable.
import app, { ensureDb } from '../src/server.js';

export default async function handler(req, res) {
  try {
    await ensureDb();
  } catch (err) {
    console.error('DB ensure failed:', err && err.message ? err.message : err);
  }
  return app(req, res);
}
