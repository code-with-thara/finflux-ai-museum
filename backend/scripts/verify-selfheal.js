// Self-heal test: boot server against a DEAD mongo port (expect degraded 503s,
// process stays alive), then start mongo on that port and prove the background
// reconnect loop heals the app WITHOUT restart (login goes 503 -> 401/200).
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PORT = 5003;
const MONGO_PORT = 47017;
const BASE = `http://127.0.0.1:${PORT}/api`;
const URI = `mongodb://127.0.0.1:${MONGO_PORT}/healdb`;
let fail = 0;
const check = (n, c, x = '') => {
  console.log(c ? `  ✅ ${n}` : `  ❌ ${n} ${x}`);
  if (!c) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['src/server.js'], {
  cwd: BACKEND,
  env: { ...process.env, PORT: String(PORT), MONGODB_URI: URI, JWT_SECRET: 'heal_secret', LLM_API_KEY: '' }
});
server.stdout.on('data', (d) => process.stdout.write(`   [srv] ${d}`));
server.stderr.on('data', (d) => process.stdout.write(`   [srv:err] ${d}`));

try {
  // wait for degraded boot (retries + backoff take ~60s for refused host)
  let degraded = false;
  for (let i = 0; i < 40; i++) {
    await sleep(5000);
    try {
      const r = await fetch(`${BASE}/health`);
      const h = await r.json();
      if (r.status === 503 && h.db && h.db.lastError) {
        degraded = true;
        console.log('   health degraded as expected; lastError:', h.db.lastError.slice(0, 80));
        break;
      }
    } catch {
      /* not up yet */
    }
  }
  check('boots degraded (no crash) on dead mongo', degraded);

  const login503 = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.cc', password: 'password123' })
  });
  check('login returns 503 while down (not crash)', login503.status === 503);

  console.log('🔌 starting mongo on the dead port...');
  const mongod = await MongoMemoryServer.create({ instance: { port: MONGO_PORT } });

  let healed = false;
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    try {
      const r = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@x.yy', password: 'password123' })
      });
      if (r.status === 401) {
        healed = true;
        break;
      }
    } catch {
      /* retry */
    }
  }
  check('self-heals without restart (login 503 -> 401)', healed);

  // full write+read after heal
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Heal', email: `heal_${Date.now()}@x.yy`, password: 'password123', monthly_income: 10000 })
  });
  check('register works after heal', reg.status === 201);
  const token = (await reg.json()).token;
  const sum = await fetch(`${BASE}/transactions/summary`, { headers: { Authorization: `Bearer ${token}` } });
  check('summary works after heal', sum.status === 200);

  await mongod.stop();
} finally {
  server.kill('SIGTERM');
  await sleep(2000);
  try {
    server.kill('SIGKILL');
  } catch {
    /* ignore */
  }
}
console.log(fail === 0 ? 'SELF-HEAL PASS' : 'SELF-HEAL FAIL');
process.exit(fail === 0 ? 0 : 1);
