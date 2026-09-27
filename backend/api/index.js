// Vercel serverless entry: every request funnels into the Express app.
// DB connection is established once per (warm) instance via ensureDb();
// the app's /api readiness gate keeps serving 503 instead of crashing
// while Atlas is momentarily unreachable.
import app, { ensureDb } from '../src/server.js';

// IMPORTANT: Vercel's Node runtime pre-parses request bodies by default,
// which breaks Express's own express.json() ("Invalid JSON" 500s).
// Disabling it lets the raw stream reach Express untouched.
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  try {
    await ensureDb();
  } catch (err) {
    console.error('DB ensure failed:', err && err.message ? err.message : err);
  }
  return app(req, res);
}
