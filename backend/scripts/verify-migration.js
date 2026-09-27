/**
 * Full MongoDB-migration verification suite (TMP test tool, not shipped logic).
 * Spins up mongodb-memory-server (same Mongoose/Atlas API), boots the real
 * src/server.js against it, and exercises every persistent data flow over HTTP:
 * auth, isolation, transactions, budgets, goals, bills, bank savings, AI chat,
 * summary, plus restart persistence. Direct collection assertions prove Atlas
 * (not JSON/memory) is the store.
 *
 * Run:  node scripts/verify-migration.js
 * Exit: 0 = all pass, 1 = any failure.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND = path.resolve(__dirname, '..');
const PORT = 5001;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0;
let fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    results.push(`  ✅ ${name}`);
  } else {
    fail++;
    results.push(`  ❌ ${name} ${extra}`);
  }
}

async function api(method, route, token, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
}

function startServer(uri) {
  return spawn('node', ['src/server.js'], {
    cwd: BACKEND,
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGODB_URI: uri,
      JWT_SECRET: 'verify_secret_key',
      LLM_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function waitForHealthy(proc, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.status === 200) {
          clearInterval(timer);
          resolve();
          return;
        }
      } catch {
        /* not up yet */
      }
      if (Date.now() - t0 > timeoutMs) {
        clearInterval(timer);
        reject(new Error('server did not become healthy in time'));
      }
    }, 500);
    proc.on('exit', () => {
      clearInterval(timer);
      reject(new Error('server process exited before healthy'));
    });
  });
}

function kill(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) return resolve();
    proc.on('exit', () => resolve());
    proc.kill();
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      resolve();
    }, 4000);
  });
}

const stamp = Date.now();
const emailA = `verifyA_${stamp}@smartbudget.ai`;
const emailB = `verifyB_${stamp}@smartbudget.ai`;

let mongod;
let server;
let models;

try {
  console.log('🔌 Starting in-memory MongoDB (Atlas-compatible API)...');
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('smartbudget_verify');
  console.log(`   URI host: ${new URL(uri).host}`);

  console.log('🚀 Booting real server against Mongo...');
  server = startServer(uri);
  server.stdout.on('data', (d) => process.stdout.write(`   [srv] ${d}`));
  server.stderr.on('data', (d) => process.stdout.write(`   [srv:err] ${d}`));
  await waitForHealthy(server);

  const health = await (await fetch(`${BASE}/health`)).json();
  check('health reports mongodb-atlas store', health.storage === 'mongodb-atlas', JSON.stringify(health));

  // Direct model access for collection-level assertions (default connection!)
  const dbUri = uri;
  await mongoose.connect(dbUri);
  models = await import('../src/models/index.js');

  // ---------- 1. Register / Login / me ----------
  const regA = await api('POST', '/auth/register', null, {
    name: 'Verify A',
    email: emailA,
    password: 'password123',
    confirmPassword: 'password123',
    monthly_income: 50000,
    bank_savings: 10000
  });
  check('register A → 201', regA.status === 201, `got ${regA.status}`);
  const idA = regA.data?.user?.id;
  check('register A returns user id', typeof idA === 'number');
  check('register A bank_savings applied', regA.data?.user?.bank_savings === 10000);

  const dup = await api('POST', '/auth/register', null, {
    name: 'Dup',
    email: emailA,
    password: 'password123'
  });
  check('duplicate email rejected', dup.status === 400);

  const loginA = await api('POST', '/auth/login', null, { email: emailA, password: 'password123' });
  check('login A → 200', loginA.status === 200);
  let tokenA = loginA.data?.token;
  check('login A returns token', typeof tokenA === 'string');

  const badLogin = await api('POST', '/auth/login', null, { email: emailA, password: 'wrongpw' });
  check('wrong password → 401', badLogin.status === 401);

  const me = await api('GET', '/auth/me', tokenA);
  check('GET /me works', me.status === 200 && me.data?.user?.email === emailA.toLowerCase());

  const noAuth = await api('GET', '/auth/me', null);
  check('no token → 401 (logout enforced server-side)', noAuth.status === 401);
  const junk = await api('GET', '/auth/me', 'junk.token.here');
  check('forged token → 403', junk.status === 403);

  const loginA2 = await api('POST', '/auth/login', null, { email: emailA, password: 'password123' });
  check('login again → 200', loginA2.status === 200);
  tokenA = loginA2.data.token;

  const regB = await api('POST', '/auth/register', null, {
    name: 'Verify B',
    email: emailB,
    password: 'password123',
    confirmPassword: 'password123',
    monthly_income: 30000
  });
  check('register B → 201', regB.status === 201);
  const tokenB = regB.data.token;
  const idB = regB.data.user.id;

  // ---------- 2. User isolation ----------
  const txA = await api('POST', '/transactions', tokenA, {
    type: 'expense',
    category: 'Food',
    amount: 1200,
    description: 'A private lunch'
  });
  check('A creates expense → 201', txA.status === 201);
  const txAId = txA.data?.transaction?.id;

  const listB = await api('GET', '/transactions', tokenB);
  check(
    'B cannot see A transactions',
    listB.status === 200 && !listB.data.transactions.some((t) => t.user_id === idA)
  );
  const getAlien = await api('GET', '/transactions', tokenB);
  check('B list excludes A tx id', !getAlien.data.transactions.some((t) => t.id === txAId));
  const updAlien = await api('PUT', `/transactions/${txAId}`, tokenB, { amount: 5 });
  check("B cannot update A's tx → 404", updAlien.status === 404);
  const delAlien = await api('DELETE', `/transactions/${txAId}`, tokenB);
  check("B cannot delete A's tx → 404", delAlien.status === 404);

  // ---------- 3. Transaction CRUD (Mongo round-trip) ----------
  const upd = await api('PUT', `/transactions/${txAId}`, tokenA, { amount: 1500 });
  check('update tx → 200 + new amount', upd.status === 200 && upd.data?.transaction?.amount === 1500);
  const search = await api('GET', '/transactions?search=lunch', tokenA);
  check('search finds tx', search.data?.transactions?.some((t) => t.id === txAId));
  const del = await api('DELETE', `/transactions/${txAId}`, tokenA);
  check('delete tx → 200', del.status === 200);
  const afterDel = await api('GET', '/transactions', tokenA);
  check('deleted tx gone', !afterDel.data.transactions.some((t) => t.id === txAId));

  // expense exceeding balance → shortfall from bank savings (Mongo-persisted)
  const big = await api('POST', '/transactions', tokenA, {
    type: 'expense',
    category: 'Shopping',
    amount: 60000,
    description: 'Big gadget'
  });
  check('overspend recorded with savings cover', big.status === 201 && big.data?.covered_from_savings > 0);
  const meAfter = await api('GET', '/auth/me', tokenA);
  check('bank_savings reduced in Mongo', Number(meAfter.data?.user?.bank_savings) < 10000);

  // ---------- 4. Budgets ----------
  const setB = await api('POST', '/budgets', tokenA, { category: 'Food', allocated_amount: 8000 });
  check('set budget → 200', setB.status === 200);
  const getB = await api('GET', '/budgets', tokenA);
  check('budget persisted', getB.data?.budgets?.some((b) => b.category === 'Food'));
  const budgetId = getB.data.budgets.find((b) => b.category === 'Food').id;
  const delB = await api('DELETE', `/budgets/${budgetId}`, tokenA);
  check('delete budget → 200', delB.status === 200);

  // ---------- 5. Goals ----------
  const goal = await api('POST', '/goals', tokenA, {
    name: 'Verify Bike',
    target_amount: 50000,
    initial_deposit: 5000
  });
  check('create goal → 201', goal.status === 201);
  const goalId = goal.data?.goal?.id;
  const dep = await api('POST', `/goals/${goalId}/deposit`, tokenA, { amount: 2000 });
  check('deposit → current_saved 7000', dep.data?.goal?.current_saved === 7000);
  const wd = await api('POST', `/goals/${goalId}/withdraw`, tokenA, { amount: 1000 });
  check('withdraw → current_saved 6000', wd.data?.goal?.current_saved === 6000);
  const goalsB = await api('GET', '/goals', tokenB);
  check('B sees no goals (isolation)', goalsB.data?.goals?.length === 0);
  const delG = await api('DELETE', `/goals/${goalId}`, tokenA);
  check('delete goal → 200', delG.status === 200);

  // ---------- 6. Bills ----------
  const bill = await api('POST', '/bills', tokenA, { name: 'Verify Power', amount: 900, due_day: 15 });
  check('create bill → 201', bill.status === 201);
  const billId = bill.data?.bill?.id;
  const pay = await api('POST', `/bills/${billId}/pay`, tokenA);
  check('pay bill → 200 + expense tx', pay.status === 200 && pay.data?.transaction?.id > 0);
  const editPaid = await api('PUT', `/bills/${billId}`, tokenA, {
    name: 'Verify Power',
    amount: 950,
    due_day: 15
  });
  check('paid bill edit blocked → 400', editPaid.status === 400);
  const delBill = await api('DELETE', `/bills/${billId}`, tokenA);
  check('delete bill → 200', delBill.status === 200);

  // ---------- 7. Bank savings transfer (user B has untouched available balance) ----------
  const transfer = await api('POST', '/transactions/bank-savings/transfer', tokenB, {
    amount: 1000,
    direction: 'deposit'
  });
  check('bank savings deposit → 200', transfer.status === 200);
  const meB = await api('GET', '/auth/me', tokenB);
  check('bank_savings = 1000 in Mongo', Number(meB.data?.user?.bank_savings) === 1000);

  // ---------- 8. Summary / balances ----------
  const summary = await api('GET', '/transactions/summary', tokenA);
  check('summary → 200 with balances', summary.status === 200 && typeof summary.data?.summary?.availableBalance === 'number');

  // ---------- 9. AI chat persistence ----------
  const chat = await api('POST', '/ai/chat', tokenA, { message: 'How much did I spend on food?' });
  check('AI chat → 200 + reply', chat.status === 200 && typeof chat.data?.reply === 'string');
  const convCount = await models.AiConversation.countDocuments({ user_id: idA });
  check('AI history persisted in Mongo (2 msgs)', convCount === 2, `got ${convCount}`);
  const sugg = await api('GET', '/ai/suggestions', tokenA);
  check('AI suggestions → 200', sugg.status === 200 && Array.isArray(sugg.data?.suggestions));

  // ---------- 10. Direct collection assertions ----------
  const [uCount, txCount, bCount, gCount, billCount] = await Promise.all([
    models.User.countDocuments({}),
    models.Transaction.countDocuments({ user_id: idA }),
    models.Budget.countDocuments({ user_id: idA }),
    models.SavingsGoal.countDocuments({ user_id: idA }),
    models.RecurringBill.countDocuments({ user_id: idA })
  ]);
  check('users collection has A+B', uCount === 2, `got ${uCount}`);
  check('transactions persisted for A', txCount >= 4, `got ${txCount}`);
  console.log(`   [collections] users=${uCount} tx(A)=${txCount} budgets(A)=${bCount} goals(A)=${gCount} bills(A)=${billCount}`);

  // ---------- 11. Restart persistence ----------
  console.log('🔁 Restarting server (same Mongo) to prove persistence...');
  await kill(server);
  server = startServer(uri);
  await waitForHealthy(server);
  const loginAfter = await api('POST', '/auth/login', null, { email: emailA, password: 'password123' });
  check('login works after restart', loginAfter.status === 200);
  const tokenA3 = loginAfter.data.token;
  const listAfter = await api('GET', '/transactions', tokenA3);
  check('transactions survive restart', listAfter.data?.transactions?.length >= 4);
  const summaryAfter = await api('GET', '/transactions/summary', tokenA3);
  check('summary works after restart', summaryAfter.status === 200);
} catch (err) {
  fail++;
  results.push(`  ❌ SUITE ERROR: ${err.message}`);
} finally {
  await kill(server);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  if (mongod) await mongod.stop();
}

console.log('\n===== RESULTS =====');
for (const r of results) console.log(r);
console.log(`\nPASS: ${pass}  FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
