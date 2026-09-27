// Vercel serverless entry: every request funnels into the Express app.
// DB connection is established once per (warm) instance via ensureDb();
// the app's /api readiness gate keeps serving 503 instead of crashing
// while Atlas is momentarily unreachable.
import app, { ensureDb } from '../src/server.js';

// Vercel's Node runtime pre-buffers the request stream and exposes a `body`
// getter that throws on access — which crashes Express's own
// express.json() ("Invalid JSON" 500s). So this entry parses the raw stream
// itself, shadows the throwing getter, and marks the body as parsed so
// Express skips its own parsing entirely.
async function attachParsedBody(req) {
  try {
    Object.defineProperty(req, 'body', {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch {
    /* ignore — fall through to stream parsing */
  }
  let raw = '';
  try {
    for await (const chunk of req) {
      raw += chunk;
    }
  } catch {
    raw = '';
  }
  if (!raw) {
    req.body = {};
  } else {
    try {
      req.body = JSON.parse(raw);
    } catch {
      req.body = {};
    }
  }
  req._body = true;
}

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
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    try {
      Object.defineProperty(req, 'body', {
        value: {},
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch {
      /* ignore */
    }
    req._body = true;
  } else {
    await attachParsedBody(req);
  }
  return app(req, res);
}
