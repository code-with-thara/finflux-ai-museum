// SmartBudget AI — MongoDB Atlas data layer (sole source of truth).
//
// There is intentionally NO database.json / filesystem / in-memory store here.
// Every read/write below executes directly against MongoDB Atlas via Mongoose
// models, so the API, all controllers and all future instances share one
// persistent source of truth. `database.json` remains on disk only as a
// pre-migration archive (import it once with `npm run migrate`).
//
// The `db.prepare(sql).run/get/all` + `db.transaction(fn)` surface is kept so
// controller logic stays identical — but every method is now ASYNC and hits
// Atlas. Callers MUST await every run/get/all call.
import mongoose from 'mongoose';
import {
  User,
  Budget,
  Transaction,
  SavingsGoal,
  RecurringBill,
  AiConversation,
  Counter
} from '../models/index.js';

let dbReady = false;
let lastError = null;
let lastStateChangeAt = null;
let connectAttempts = 0;
let reconnectTimer = null;
let listenersAttached = false;
let booting = false;

function getMongoUri() {
  return (process.env.MONGODB_URI || '').trim();
}

function markState(ready, err) {
  if (dbReady !== ready) {
    lastStateChangeAt = new Date().toISOString();
  }
  dbReady = ready;
  if (err) lastError = String(err && err.message ? err.message : err).split('\n')[0];
}

export function isDbReady() {
  return dbReady && mongoose.connection.readyState === 1;
}

export function getDbStatus() {
  return {
    ready: isDbReady(),
    connectionState: mongoose.connection.readyState,
    hasUri: Boolean(getMongoUri()),
    dbName: effectiveDbName(),
    attempts: connectAttempts,
    lastError,
    lastStateChangeAt
  };
}

// Database the driver will use (URI path, else the driver's `test` default).
// Reported only — never overridden, so existing data stays addressable.
export function effectiveDbName() {
  const uri = getMongoUri();
  const match = uri.match(/^mongodb(\+srv)?:\/\/[^/]*\/([^?]*)/);
  const name = match && match[2] ? decodeURIComponent(match[2]) : '';
  return name || 'test (driver default)';
}

// Fail fast on malformed URIs; never log secrets.
export function validateMongoUri(uri) {
  const warnings = [];
  if (!uri) return { ok: false, error: 'MONGODB_URI is not set.', warnings };
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    return { ok: false, error: 'MONGODB_URI must start with mongodb:// or mongodb+srv://.', warnings };
  }
  if (/\btls\s*=\s*false/i.test(uri)) {
    return { ok: false, error: 'MONGODB_URI disables TLS (tls=false); Atlas requires TLS.', warnings };
  }
  if (!effectiveDbName() || effectiveDbName().startsWith('test ')) {
    warnings.push('URI has no database path; the driver will use the "test" database. All app instances must use this same URI.');
  }
  return { ok: true, warnings };
}

// Pool/timeout tuning for hostile networks (firewalls/NAT killing idle TLS):
// - maxIdleTimeMS recycles sockets before middleboxes kill them
// - bounded socketTimeoutMS avoids reusing half-dead sessions
// - retryReads/retryWrites let the driver transparently redo idempotent ops
const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 30000,
  heartbeatFrequencyMS: 10000,
  retryReads: true,
  retryWrites: true
};

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('error', (err) => {
    markState(mongoose.connection.readyState === 1, err);
    console.error('MongoDB connection error:', (err && err.message ? err.message : err).split('\n')[0]);
  });
  mongoose.connection.on('disconnected', () => {
    markState(false, 'connection lost');
    console.error('MongoDB Atlas disconnected — API returns 503 until reconnected.');
    // During boot the retry loop owns reconnecting; afterwards the background loop does.
    if (!booting) scheduleReconnect();
  });
  mongoose.connection.on('reconnected', () => {
    markState(true, null);
    console.log('MongoDB Atlas reconnected.');
  });
}

async function connectOnce() {
  connectAttempts += 1;
  await mongoose.connect(getMongoUri(), CONNECT_OPTIONS);
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    if (isDbReady()) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }
    try {
      // A previous failed connect may leave the topology closed; reset first.
      if (mongoose.connection.readyState === 0) {
        await connectOnce();
      } else {
        await mongoose.connection.asPromise();
      }
      markState(mongoose.connection.readyState === 1, null);
      if (isDbReady()) {
        console.log('MongoDB Atlas background reconnect succeeded.');
        await reconcileCounters().catch((e) => console.error('Post-reconnect reconcile failed:', e.message));
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
    } catch (err) {
      markState(false, err);
    }
  }, 10000);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

async function reconcileCounters() {
  const pairs = [
    ['users', User],
    ['budgets', Budget],
    ['transactions', Transaction],
    ['savings_goals', SavingsGoal],
    ['recurring_bills', RecurringBill],
    ['ai_conversations', AiConversation]
  ];
  for (const [name, Model] of pairs) {
    const top = await Model.findOne({}).sort({ id: -1 }).select('id').lean();
    const max = top ? Number(top.id) || 0 : 0;
    const cur = await Counter.findOne({ _id: name }).lean();
    const seq = Math.max((cur && Number(cur.seq)) || 0, max);
    await Counter.findOneAndUpdate({ _id: name }, { $set: { seq } }, { upsert: true });
  }
}

export async function initDB({ retries = 6 } = {}) {
  const uri = getMongoUri();
  const validation = validateMongoUri(uri);
  if (!validation.ok) {
    markState(false, validation.error);
    throw new Error(validation.error);
  }
  for (const w of validation.warnings) console.warn(`MongoDB config: ${w}`);

  attachListeners();
  booting = true;
  let lastErr = null;
  try {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await connectOnce();
      markState(true, null);
      await reconcileCounters();
      const [users, transactions] = await Promise.all([
        User.countDocuments(),
        Transaction.countDocuments()
      ]);
      console.log(
        `Database initialized successfully from MongoDB Atlas (${users} users, ${transactions} transactions)`
      );
      return;
    } catch (err) {
      lastErr = err;
      markState(false, err);
      try {
        await mongoose.disconnect();
      } catch {
        /* ignore reset errors */
      }
      if (attempt < retries) {
        const waitMs = Math.min(30000, 2000 * 2 ** (attempt - 1));
        console.error(
          `MongoDB Atlas connection attempt ${attempt}/${retries} failed: ${String(err && err.message ? err.message : err).split('\n')[0]}. Retrying in ${waitMs / 1000}s...`
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    }
  } finally {
    booting = false;
  }
  // Stay alive in degraded mode; background loop keeps trying (self-heal).
  scheduleReconnect();
  throw lastErr;
}

export async function closeDB() {
  markState(false, 'shutting down');
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

// Numeric auto-increment ids (preserved from the legacy store so existing
// user_id / goal_id references keep working). Atomic via $inc.
async function nextId(name) {
  const c = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return c.seq;
}

function strip(doc) {
  if (!doc) return undefined;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete o._id;
  delete o.__v;
  return o;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseHistory(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Query helper providing the prepared-statement surface over Atlas.
class PreparedStatement {
  constructor(sql) {
    this.sql = sql.trim();
  }

  normalizeArgs(args) {
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  async run(...args) {
    const params = this.normalizeArgs(args);
    const sqlLower = this.sql.toLowerCase();

    // ---- INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) ----
    if (sqlLower.startsWith('insert into users')) {
      const id = await nextId('users');
      const [name, email, password_hash] = params;
      await User.create({
        id,
        name,
        email,
        password_hash,
        currency: '₹',
        monthly_income: 0,
        salary_day: 1,
        savings_pin: '1234',
        bank_savings: 0,
        bank_savings_history: [],
        rollover_enabled: 1,
        budget_enabled: 1,
        onboarding_completed: 0,
        created_at: new Date().toISOString()
      });
      return { lastInsertRowid: id, changes: 1 };
    }

    // ---- UPDATE users SET ... ----
    if (sqlLower.startsWith('update users')) {
      const changed = async (filter, update) => {
        const r = await User.updateOne(filter, update);
        return { changes: r.matchedCount > 0 ? 1 : 0 };
      };

      if (sqlLower.includes('set bank_savings = bank_savings - ? where id = ?')) {
        const [amt, id] = params;
        return changed({ id: Number(id) }, { $inc: { bank_savings: -Number(amt) } });
      }
      if (sqlLower.includes('set bank_savings = max(0, bank_savings - ?) where id = ?')) {
        const [amt, id] = params;
        const u = await User.findOne({ id: Number(id) }).lean();
        if (!u) return { changes: 0 };
        const next = Math.max(0, (Number(u.bank_savings) || 0) - Number(amt));
        return changed({ id: Number(id) }, { $set: { bank_savings: next } });
      }
      if (sqlLower.includes('set bank_savings = bank_savings + ? where id = ?')) {
        const [amt, id] = params;
        return changed({ id: Number(id) }, { $inc: { bank_savings: Number(amt) } });
      }
      if (sqlLower.includes('set bank_savings = ?, bank_savings_history = ? where id = ?')) {
        const [bankSavings, historyVal, id] = params;
        return changed(
          { id: Number(id) },
          { $set: { bank_savings: Number(bankSavings), bank_savings_history: parseHistory(historyVal) } }
        );
      }
      if (sqlLower.includes('set bank_savings_history = ? where id = ?')) {
        const [historyVal, id] = params;
        return changed(
          { id: Number(id) },
          { $set: { bank_savings_history: parseHistory(historyVal) } }
        );
      }
      // Fixed legacy gap: the old file-store silently ignored
      // `UPDATE users SET bank_savings = 0 WHERE id = ?` (returned changes: 0).
      if (sqlLower.includes('set bank_savings = 0 where id = ?')) {
        const [id] = params;
        return changed({ id: Number(id) }, { $set: { bank_savings: 0 } });
      }
      if (sqlLower.includes('set bank_savings = ? where id = ?')) {
        const [bankSavings, id] = params;
        return changed({ id: Number(id) }, { $set: { bank_savings: Number(bankSavings) } });
      }
      if (
        sqlLower.includes(
          'set monthly_income = ?, salary_day = ?, budget_enabled = ?, onboarding_completed = 1'
        )
      ) {
        const [income, sDay, bEnabled, id] = params;
        return changed(
          { id: Number(id) },
          {
            $set: {
              monthly_income: Number(income) || 0,
              salary_day: Number(sDay) || 1,
              budget_enabled: Number(bEnabled) ? 1 : 0,
              onboarding_completed: 1
            }
          }
        );
      }
      if (
        sqlLower.includes('set monthly_income = ?, budget_enabled = ?, onboarding_completed = 1')
      ) {
        const [income, bEnabled, id] = params;
        return changed(
          { id: Number(id) },
          {
            $set: {
              monthly_income: Number(income) || 0,
              budget_enabled: Number(bEnabled) ? 1 : 0,
              onboarding_completed: 1
            }
          }
        );
      }
      if (
        sqlLower.includes('set monthly_income = ?, salary_day = ?, onboarding_completed = 1')
      ) {
        const [income, sDay, id] = params;
        return changed(
          { id: Number(id) },
          {
            $set: {
              monthly_income: Number(income) || 0,
              salary_day: Number(sDay) || 1,
              onboarding_completed: 1
            }
          }
        );
      }
      if (
        sqlLower.includes(
          'set monthly_income = ?, budget_enabled = coalesce(?, budget_enabled), onboarding_completed = 1'
        )
      ) {
        const [income, maybeBEnabled, id] = params;
        const set = { monthly_income: Number(income) || 0, onboarding_completed: 1 };
        if (maybeBEnabled !== null && maybeBEnabled !== undefined) {
          set.budget_enabled = Number(maybeBEnabled) ? 1 : 0;
        }
        return changed({ id: Number(id) }, { $set: set });
      }
      if (sqlLower.includes('set monthly_income = ?, onboarding_completed = 1')) {
        const [income, id] = params;
        return changed(
          { id: Number(id) },
          { $set: { monthly_income: Number(income), onboarding_completed: 1 } }
        );
      }
      if (sqlLower.includes('set salary_day = ?, onboarding_completed = 1')) {
        const [sDay, id] = params;
        return changed(
          { id: Number(id) },
          { $set: { salary_day: Number(sDay) || 1, onboarding_completed: 1 } }
        );
      }
      if (sqlLower.includes('set budget_enabled = ? where id = ?')) {
        const [enabled, id] = params;
        return changed(
          { id: Number(id) },
          { $set: { budget_enabled: Number(enabled) ? 1 : 0 } }
        );
      }
      if (sqlLower.includes('set onboarding_completed = 1 where id = ?')) {
        const [id] = params;
        return changed({ id: Number(id) }, { $set: { onboarding_completed: 1 } });
      }
      if (sqlLower.includes('set savings_pin = ? where id = ?')) {
        const [pin, id] = params;
        return changed({ id: Number(id) }, { $set: { savings_pin: String(pin) } });
      }
      if (sqlLower.includes('set name = coalesce')) {
        const id = Number(params[params.length - 1]);
        const [
          name,
          currency,
          monthly_income,
          salary_day,
          rollover_enabled,
          maybeBudgetEnabled,
          maybeBankSavings,
          maybeSavingsPin
        ] = params;
        const set = {};
        if (name !== null && name !== undefined) set.name = name;
        if (currency !== null && currency !== undefined) set.currency = currency;
        if (monthly_income !== null && monthly_income !== undefined) {
          set.monthly_income = Number(monthly_income);
        }
        if (salary_day !== null && salary_day !== undefined) {
          set.salary_day = Number(salary_day) || 1;
        }
        if (rollover_enabled !== null && rollover_enabled !== undefined) {
          set.rollover_enabled = Number(rollover_enabled);
        }
        if (maybeBudgetEnabled !== null && maybeBudgetEnabled !== undefined) {
          set.budget_enabled = Number(maybeBudgetEnabled);
        }
        if (maybeBankSavings !== null && maybeBankSavings !== undefined) {
          set.bank_savings = Number(maybeBankSavings);
        }
        if (maybeSavingsPin !== null && maybeSavingsPin !== undefined) {
          set.savings_pin = String(maybeSavingsPin);
        }
        return changed({ id }, { $set: set });
      }
      return { changes: 0 };
    }

    // ---- INSERT INTO budgets (upsert on user/category/period) ----
    if (sqlLower.startsWith('insert into budgets')) {
      const [user_id, category, allocated_amount, period_month, period_year] = params;
      const existing = await Budget.findOne({
        user_id: Number(user_id),
        category,
        period_month: Number(period_month),
        period_year: Number(period_year)
      }).lean();
      if (existing) {
        await Budget.updateOne(
          { _id: existing._id },
          { $set: { allocated_amount: Number(allocated_amount) } }
        );
      } else {
        const id = await nextId('budgets');
        await Budget.create({
          id,
          user_id: Number(user_id),
          category,
          allocated_amount: Number(allocated_amount),
          period_month: Number(period_month),
          period_year: Number(period_year),
          created_at: new Date().toISOString()
        });
      }
      return { changes: 1 };
    }

    // ---- DELETE FROM budgets WHERE id = ? AND user_id = ? ----
    if (sqlLower.startsWith('delete from budgets')) {
      const [id, user_id] = params;
      const r = await Budget.deleteOne({ id: Number(id), user_id: Number(user_id) });
      return { changes: r.deletedCount };
    }

    // ---- INSERT INTO transactions ----
    if (sqlLower.startsWith('insert into transactions')) {
      const id = await nextId('transactions');
      const colMatch = this.sql.match(/insert\s+into\s+transactions\s*\(([^)]+)\)/i);
      let cols = [];
      if (colMatch) {
        cols = colMatch[1].split(',').map((c) => c.trim().toLowerCase());
      }
      const tx = {
        id,
        user_id: 0,
        type: 'expense',
        category: 'Other',
        amount: 0,
        description: '',
        date: new Date().toISOString().split('T')[0],
        merchant: null,
        payment_method: null,
        goal_id: null,
        covered_from_balance: 0,
        covered_from_savings: 0,
        uncovered_deficit: 0,
        created_at: new Date().toISOString()
      };
      if (cols.length > 0 && cols.length === params.length) {
        cols.forEach((col, idx) => {
          if (col === 'user_id') tx.user_id = Number(params[idx]);
          else if (col === 'type') tx.type = params[idx];
          else if (col === 'category') tx.category = params[idx];
          else if (col === 'amount') tx.amount = Number(params[idx]);
          else if (col === 'description') tx.description = params[idx];
          else if (col === 'date') tx.date = params[idx];
          else if (col === 'merchant') tx.merchant = params[idx] || null;
          else if (col === 'payment_method') tx.payment_method = params[idx] || null;
          else if (col === 'goal_id') tx.goal_id = params[idx] ? Number(params[idx]) : null;
          else if (col === 'covered_from_balance') tx.covered_from_balance = Number(params[idx]) || 0;
          else if (col === 'covered_from_savings') tx.covered_from_savings = Number(params[idx]) || 0;
          else if (col === 'uncovered_deficit') tx.uncovered_deficit = Number(params[idx]) || 0;
        });
      } else {
        const [
          user_id,
          type,
          category,
          amount,
          description,
          date,
          merchant,
          payment_method,
          goal_id,
          covered_from_balance,
          covered_from_savings,
          uncovered_deficit
        ] = params;
        tx.user_id = Number(user_id);
        tx.type = type || 'expense';
        tx.category = category || 'Other';
        tx.amount = Number(amount) || 0;
        tx.description = description || '';
        tx.date = date || new Date().toISOString().split('T')[0];
        tx.merchant = merchant || null;
        tx.payment_method = payment_method || null;
        tx.goal_id = goal_id ? Number(goal_id) : null;
        tx.covered_from_balance = covered_from_balance !== undefined ? Number(covered_from_balance) : 0;
        tx.covered_from_savings = covered_from_savings !== undefined ? Number(covered_from_savings) : 0;
        tx.uncovered_deficit = uncovered_deficit !== undefined ? Number(uncovered_deficit) : 0;
      }
      await Transaction.create(tx);
      return { lastInsertRowid: id, changes: 1 };
    }

    // ---- UPDATE transactions SET ... WHERE id = ? AND user_id = ? ----
    if (sqlLower.startsWith('update transactions')) {
      const colMatch = this.sql.match(/update\s+transactions\s+set\s+([\s\S]+?)\s+where/i);
      if (colMatch) {
        const setCols = colMatch[1].split(',').map((c) => c.split('=')[0].trim().toLowerCase());
        const txId = params[params.length - 2];
        const userId = params[params.length - 1];
        const set = {};
        setCols.forEach((col, idx) => {
          if (col === 'type') set.type = params[idx];
          else if (col === 'category') set.category = params[idx];
          else if (col === 'amount') set.amount = Number(params[idx]);
          else if (col === 'description') set.description = params[idx];
          else if (col === 'date') set.date = params[idx];
          else if (col === 'merchant') set.merchant = params[idx] || null;
          else if (col === 'payment_method') set.payment_method = params[idx] || null;
          else if (col === 'goal_id') set.goal_id = params[idx] ? Number(params[idx]) : null;
          else if (col === 'covered_from_balance') {
            set.covered_from_balance = params[idx] !== undefined ? Number(params[idx]) : 0;
          } else if (col === 'covered_from_savings') {
            set.covered_from_savings = params[idx] !== undefined ? Number(params[idx]) : 0;
          } else if (col === 'uncovered_deficit') {
            set.uncovered_deficit = params[idx] !== undefined ? Number(params[idx]) : 0;
          }
        });
        const r = await Transaction.updateOne(
          { id: Number(txId), user_id: Number(userId) },
          { $set: set }
        );
        return { changes: r.matchedCount > 0 ? 1 : 0 };
      }
      return { changes: 0 };
    }

    // ---- DELETE FROM transactions ----
    if (sqlLower.startsWith('delete from transactions')) {
      const [txId, userId] = params;
      const r = await Transaction.deleteOne({ id: Number(txId), user_id: Number(userId) });
      return { changes: r.deletedCount };
    }

    // ---- INSERT INTO savings_goals ----
    if (sqlLower.startsWith('insert into savings_goals')) {
      const id = await nextId('savings_goals');
      const [user_id, name, target_amount, current_saved, target_date] = params;
      await SavingsGoal.create({
        id,
        user_id: Number(user_id),
        name,
        target_amount: Number(target_amount),
        current_saved: Number(current_saved) || 0,
        target_date: target_date || null,
        created_at: new Date().toISOString()
      });
      return { lastInsertRowid: id, changes: 1 };
    }

    // ---- UPDATE savings_goals ----
    if (sqlLower.startsWith('update savings_goals')) {
      if (sqlLower.includes('current_saved + ?')) {
        const [amt, goalId] = params;
        const r = await SavingsGoal.updateOne(
          { id: Number(goalId) },
          { $inc: { current_saved: Number(amt) } }
        );
        return { changes: r.matchedCount > 0 ? 1 : 0 };
      }
      if (sqlLower.includes('max(0, current_saved - ?)')) {
        const [amt, goalId] = params;
        const g = await SavingsGoal.findOne({ id: Number(goalId) }).lean();
        if (!g) return { changes: 0 };
        const next = Math.max(0, (Number(g.current_saved) || 0) - Number(amt));
        await SavingsGoal.updateOne({ id: Number(goalId) }, { $set: { current_saved: next } });
        return { changes: 1 };
      }
      return { changes: 0 };
    }

    // ---- DELETE FROM savings_goals ----
    if (sqlLower.startsWith('delete from savings_goals')) {
      const [goalId, userId] = params;
      const r = await SavingsGoal.deleteOne({ id: Number(goalId), user_id: Number(userId) });
      return { changes: r.deletedCount };
    }

    // ---- INSERT INTO recurring_bills ----
    if (sqlLower.startsWith('insert into recurring_bills')) {
      const id = await nextId('recurring_bills');
      const [user_id, name, amount, category, frequency, due_day] = params;
      await RecurringBill.create({
        id,
        user_id: Number(user_id),
        name,
        amount: Number(amount),
        category,
        frequency: frequency || 'monthly',
        due_day: Number(due_day),
        last_paid_date: null,
        created_at: new Date().toISOString()
      });
      return { lastInsertRowid: id, changes: 1 };
    }

    // ---- UPDATE recurring_bills ----
    if (sqlLower.startsWith('update recurring_bills')) {
      if (sqlLower.includes('last_paid_date = ?')) {
        const [last_paid_date, billId, userId] = params;
        const filter = { id: Number(billId) };
        if (userId !== undefined) filter.user_id = Number(userId);
        const r = await RecurringBill.updateOne(filter, { $set: { last_paid_date } });
        return { changes: r.matchedCount > 0 ? 1 : 0 };
      }
      const [name, amount, category, frequency, due_day, billId, userId] = params;
      const set = {};
      if (name !== undefined) set.name = String(name).trim();
      if (amount !== undefined) set.amount = Number(amount);
      if (category !== undefined) set.category = category;
      if (frequency !== undefined) set.frequency = frequency;
      if (due_day !== undefined) set.due_day = Number(due_day);
      const r = await RecurringBill.updateOne(
        { id: Number(billId), user_id: Number(userId) },
        { $set: set }
      );
      return { changes: r.matchedCount > 0 ? 1 : 0 };
    }

    // ---- DELETE FROM recurring_bills ----
    if (sqlLower.startsWith('delete from recurring_bills')) {
      const [billId, userId] = params;
      const r = await RecurringBill.deleteOne({ id: Number(billId), user_id: Number(userId) });
      return { changes: r.deletedCount };
    }

    // ---- INSERT INTO ai_conversations ----
    if (sqlLower.startsWith('insert into ai_conversations')) {
      const id = await nextId('ai_conversations');
      const [user_id, role, message, metadata] = params;
      await AiConversation.create({
        id,
        user_id: Number(user_id),
        role,
        message,
        metadata: metadata || null,
        created_at: new Date().toISOString()
      });
      return { lastInsertRowid: id, changes: 1 };
    }

    return { changes: 0 };
  }

  async get(...args) {
    const params = this.normalizeArgs(args);
    const sqlLower = this.sql.toLowerCase();

    // 1. Aggregation / SUM queries
    if (sqlLower.includes('sum(amount)')) {
      const userId = Number(params[0]);
      const match = { user_id: userId };
      if (sqlLower.includes("type = 'income'")) match.type = 'income';
      else if (sqlLower.includes("type = 'expense'")) match.type = 'expense';
      else if (sqlLower.includes("type = 'savings_deposit'")) match.type = 'savings_deposit';
      else if (sqlLower.includes("type = 'savings_withdraw'")) match.type = 'savings_withdraw';

      if (params.length > 1 && sqlLower.includes('date like ?')) {
        const prefix = String(params[1]).replace('%', '');
        match.date = { $regex: `^${escapeRegExp(prefix)}` };
      }
      const rows = await Transaction.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      return { total: (rows[0] && rows[0].total) || 0 };
    }

    // 2. Single item lookups
    if (sqlLower.includes('from users') && sqlLower.includes('email = ?')) {
      return strip(await User.findOne({ email: params[0] }).lean());
    }
    if (sqlLower.includes('from users') && /\bid\s*=\s*\?/.test(sqlLower)) {
      return strip(await User.findOne({ id: Number(params[0]) }).lean());
    }
    if (
      sqlLower.includes('from transactions') &&
      /\bid\s*=\s*\?/.test(sqlLower) &&
      !/\buser_id\s*=\s*\?/.test(sqlLower)
    ) {
      return strip(await Transaction.findOne({ id: Number(params[0]) }).lean());
    }
    if (
      sqlLower.includes('from transactions') &&
      /\bid\s*=\s*\?/.test(sqlLower) &&
      /\buser_id\s*=\s*\?/.test(sqlLower)
    ) {
      return strip(
        await Transaction.findOne({ id: Number(params[0]), user_id: Number(params[1]) }).lean()
      );
    }
    if (sqlLower.includes('from savings_goals') && /\bid\s*=\s*\?/.test(sqlLower)) {
      if (params.length > 1 && sqlLower.includes('user_id = ?')) {
        return strip(
          await SavingsGoal.findOne({ id: Number(params[0]), user_id: Number(params[1]) }).lean()
        );
      }
      return strip(await SavingsGoal.findOne({ id: Number(params[0]) }).lean());
    }
    if (sqlLower.includes('from recurring_bills') && /\bid\s*=\s*\?/.test(sqlLower)) {
      if (params.length > 1 && sqlLower.includes('user_id = ?')) {
        return strip(
          await RecurringBill.findOne({ id: Number(params[0]), user_id: Number(params[1]) }).lean()
        );
      }
      return strip(await RecurringBill.findOne({ id: Number(params[0]) }).lean());
    }

    return undefined;
  }

  async all(...args) {
    const params = this.normalizeArgs(args);
    const sqlLower = this.sql.toLowerCase();

    // SELECT category summary query
    if (
      sqlLower.includes('from transactions') &&
      sqlLower.includes('category') &&
      sqlLower.includes('sum(amount)') &&
      sqlLower.includes('group by category')
    ) {
      const userId = Number(params[0]);
      const monthPrefix = String(params[1] || '').replace('%', '');
      const match = { user_id: userId, type: 'expense' };
      if (monthPrefix) match.date = { $regex: `^${escapeRegExp(monthPrefix)}` };
      const rows = await Transaction.aggregate([
        { $match: match },
        { $group: { _id: '$category', spent: { $sum: '$amount' } } },
        { $project: { _id: 0, category: '$_id', spent: 1 } },
        ...(sqlLower.includes('order by') ? [{ $sort: { spent: -1 } }] : [])
      ]);
      return rows;
    }

    // SELECT * FROM transactions WHERE user_id = ? (+ filters)
    if (sqlLower.includes('from transactions') && sqlLower.includes('user_id = ?')) {
      const userId = Number(params[0]);
      const match = { user_id: userId };
      let consumed = 1;
      if (sqlLower.includes('id != ?')) {
        match.id = { $ne: Number(params[consumed++]) };
      }
      if (sqlLower.includes('type = ?')) {
        match.type = params[consumed++];
      }
      if (sqlLower.includes('category = ?')) {
        match.category = params[consumed++];
      }
      if (sqlLower.includes('date = ?')) {
        match.date = params[consumed++];
      }
      if (sqlLower.includes('date between ? and ?')) {
        const startVal = params[consumed++];
        const endVal = params[consumed++];
        match.date = { $gte: startVal, $lte: endVal };
      }
      if (sqlLower.includes('like ?')) {
        const searchTerm = String(params[consumed++] || '').replace(/%/g, '');
        if (searchTerm) {
          const rx = new RegExp(escapeRegExp(searchTerm), 'i');
          match.$or = [{ description: rx }, { category: rx }, { merchant: rx }];
        }
      }

      // LIMIT is honoured only when the SQL actually has one. The legacy
      // file-store applied the LAST param as a limit unconditionally, which
      // truncated balance calculations whenever excludeTxId was passed.
      let limit = 0;
      if (/limit\s+\?/i.test(this.sql) && params.length > consumed) {
        limit = Number(params[params.length - 1]) || 0;
      } else {
        const literal = this.sql.match(/limit\s+(\d+)/i);
        if (literal) limit = Number(literal[1]);
      }

      let q = Transaction.find(match).sort({ date: -1, id: -1 }).lean();
      if (limit > 0) q = q.limit(limit);
      return (await q).map(strip);
    }

    // SELECT ... FROM budgets
    if (sqlLower.includes('from budgets') && sqlLower.includes('user_id = ?')) {
      const userId = Number(params[0]);
      if (
        params.length >= 3 &&
        sqlLower.includes('period_month = ?') &&
        sqlLower.includes('period_year = ?')
      ) {
        const month = Number(params[1]);
        const year = Number(params[2]);
        return (await Budget.find({ user_id: userId, period_month: month, period_year: year }).lean()).map(
          strip
        );
      }
      return (await Budget.find({ user_id: userId }).lean()).map(strip);
    }

    // SELECT * FROM savings_goals WHERE user_id = ?
    if (sqlLower.includes('from savings_goals') && sqlLower.includes('user_id = ?')) {
      return (await SavingsGoal.find({ user_id: Number(params[0]) }).lean()).map(strip);
    }

    // SELECT * FROM recurring_bills WHERE user_id = ?
    if (sqlLower.includes('from recurring_bills') && sqlLower.includes('user_id = ?')) {
      return (await RecurringBill.find({ user_id: Number(params[0]) }).lean()).map(strip);
    }

    // SELECT * FROM ai_conversations WHERE user_id = ?
    if (sqlLower.includes('from ai_conversations') && sqlLower.includes('user_id = ?')) {
      return (await AiConversation.find({ user_id: Number(params[0]) }).sort({ id: 1 }).lean()).map(
        strip
      );
    }

    return [];
  }
}

const db = {
  prepare: (sql) => new PreparedStatement(sql),
  transaction: (fn) => async (...txArgs) => fn(...txArgs)
};

export default db;
