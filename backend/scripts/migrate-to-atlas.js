/**
 * One-time migration: database.json -> MongoDB Atlas.
 *
 * Usage:
 *   1. Set MONGODB_URI in backend/.env (Atlas connection string)
 *   2. cd backend && npm run migrate
 *      (or: node scripts/migrate-to-atlas.js [--drop] [--file ./database.json])
 *
 * Flags:
 *   --drop   Delete existing Atlas collections before importing (default: upsert/merge)
 *   --file   Path to the JSON dump (default: ./database.json next to backend root)
 *
 * The migration preserves legacy numeric `id` fields so the app's existing
 * query logic keeps working unchanged against Atlas.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import {
  User,
  Budget,
  Transaction,
  SavingsGoal,
  RecurringBill,
  AiConversation,
  Counter
} from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const shouldDrop = args.includes('--drop');
const fileFlagIdx = args.indexOf('--file');
const jsonPath =
  fileFlagIdx !== -1 && args[fileFlagIdx + 1]
    ? path.resolve(process.cwd(), args[fileFlagIdx + 1])
    : path.resolve(__dirname, '../database.json');

const uri = process.env.MONGODB_URI || '';
if (!uri) {
  console.error('❌ MONGODB_URI is not set. Add your Atlas connection string to backend/.env first.');
  process.exit(1);
}
if (!fs.existsSync(jsonPath)) {
  console.error(`❌ JSON dump not found at: ${jsonPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const collections = {
  users: raw.users || [],
  budgets: raw.budgets || [],
  transactions: raw.transactions || [],
  savings_goals: raw.savings_goals || [],
  recurring_bills: raw.recurring_bills || [],
  ai_conversations: raw.ai_conversations || []
};
const counters = raw.counters || {};

const strip = (doc) => {
  const { _id, __v, ...rest } = doc;
  return rest;
};

async function upsertAll(Model, docs, label) {
  if (!docs.length) {
    console.log(`   • ${label}: 0 documents (skipped)`);
    return;
  }
  const res = await Model.bulkWrite(
    docs.map((d) => ({
      updateOne: { filter: { id: d.id }, update: { $set: strip(d) }, upsert: true }
    })),
    { ordered: false }
  );
  console.log(
    `   • ${label}: ${docs.length} processed (upserted: ${res.upsertedCount}, modified: ${res.modifiedCount})`
  );
}

try {
  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected.');

  if (shouldDrop) {
    console.log('🗑️  --drop: clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Budget.deleteMany({}),
      Transaction.deleteMany({}),
      SavingsGoal.deleteMany({}),
      RecurringBill.deleteMany({}),
      AiConversation.deleteMany({}),
      Counter.deleteMany({})
    ]);
  }

  console.log(`📦 Migrating from ${jsonPath}`);
  await upsertAll(User, collections.users, 'users');
  await upsertAll(Budget, collections.budgets, 'budgets');
  await upsertAll(Transaction, collections.transactions, 'transactions');
  await upsertAll(SavingsGoal, collections.savings_goals, 'savings_goals');
  await upsertAll(RecurringBill, collections.recurring_bills, 'recurring_bills');
  await upsertAll(AiConversation, collections.ai_conversations, 'ai_conversations');

  const maxId = (arr) => arr.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  const reconciled = {
    users: Math.max(Number(counters.users) || 0, maxId(collections.users)),
    budgets: Math.max(Number(counters.budgets) || 0, maxId(collections.budgets)),
    transactions: Math.max(Number(counters.transactions) || 0, maxId(collections.transactions)),
    savings_goals: Math.max(Number(counters.savings_goals) || 0, maxId(collections.savings_goals)),
    recurring_bills: Math.max(
      Number(counters.recurring_bills) || 0,
      maxId(collections.recurring_bills)
    ),
    notifications: Number(counters.notifications) || 0,
    ai_conversations: Math.max(
      Number(counters.ai_conversations) || 0,
      maxId(collections.ai_conversations)
    )
  };
  await Counter.bulkWrite(
    Object.entries(reconciled).map(([name, seq]) => ({
      updateOne: { filter: { _id: name }, update: { $set: { seq } }, upsert: true }
    })),
    { ordered: false }
  );
  console.log('   • counters:', JSON.stringify(reconciled));

  // Verification
  const counts = await Promise.all([
    User.countDocuments(),
    Budget.countDocuments(),
    Transaction.countDocuments(),
    SavingsGoal.countDocuments(),
    RecurringBill.countDocuments(),
    AiConversation.countDocuments()
  ]);
  console.log('🔍 Atlas counts now:', {
    users: counts[0],
    budgets: counts[1],
    transactions: counts[2],
    savings_goals: counts[3],
    recurring_bills: counts[4],
    ai_conversations: counts[5]
  });
  console.log('🎉 Migration complete. database.json is now safe to archive (do not delete until deploy is verified).');
  await mongoose.disconnect();
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
