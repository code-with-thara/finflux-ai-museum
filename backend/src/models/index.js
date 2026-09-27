import mongoose from 'mongoose';

// Numeric legacy `id` is preserved from database.json so all existing
// controller logic (which joins on numeric user_id / goal_id) works unchanged.

const userSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, sparse: true },
    name: { type: String, default: '' },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password_hash: { type: String, default: '' },
    currency: { type: String, default: '₹' },
    monthly_income: { type: Number, default: 0 },
    salary_day: { type: Number, default: 1 },
    savings_pin: { type: String, default: '1234' },
    bank_savings: { type: Number, default: 0 },
    bank_savings_history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    rollover_enabled: { type: Number, default: 1 },
    budget_enabled: { type: Number, default: 1 },
    onboarding_completed: { type: Number, default: 0 },
    created_at: { type: String, default: () => new Date().toISOString() }
  },
  { collection: 'users' }
);

const budgetSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, sparse: true },
    user_id: { type: Number, index: true, required: true },
    category: { type: String, required: true },
    allocated_amount: { type: Number, default: 0 },
    period_month: { type: Number, required: true },
    period_year: { type: Number, required: true },
    created_at: { type: String, default: () => new Date().toISOString() }
  },
  { collection: 'budgets' }
);
budgetSchema.index(
  { user_id: 1, category: 1, period_month: 1, period_year: 1 },
  { unique: true }
);

const transactionSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, sparse: true },
    user_id: { type: Number, index: true, required: true },
    type: { type: String, default: 'expense' },
    category: { type: String, default: 'Other' },
    amount: { type: Number, default: 0 },
    description: { type: String, default: '' },
    date: { type: String, default: () => new Date().toISOString().split('T')[0], index: true },
    merchant: { type: String, default: null },
    payment_method: { type: String, default: null },
    goal_id: { type: Number, default: null },
    covered_from_balance: { type: Number, default: 0 },
    covered_from_savings: { type: Number, default: 0 },
    uncovered_deficit: { type: Number, default: 0 },
    created_at: { type: String, default: () => new Date().toISOString() }
  },
  { collection: 'transactions' }
);
transactionSchema.index({ user_id: 1, date: -1, id: -1 });

const savingsGoalSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, sparse: true },
    user_id: { type: Number, index: true, required: true },
    name: { type: String, required: true },
    target_amount: { type: Number, default: 0 },
    current_saved: { type: Number, default: 0 },
    target_date: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() }
  },
  { collection: 'savings_goals' }
);

const recurringBillSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, sparse: true },
    user_id: { type: Number, index: true, required: true },
    name: { type: String, required: true },
    amount: { type: Number, default: 0 },
    category: { type: String, default: 'Bills' },
    frequency: { type: String, default: 'monthly' },
    due_day: { type: Number, default: 1 },
    last_paid_date: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() }
  },
  { collection: 'recurring_bills' }
);

const aiConversationSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, sparse: true },
    user_id: { type: Number, index: true, required: true },
    role: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    created_at: { type: String, default: () => new Date().toISOString() }
  },
  { collection: 'ai_conversations' }
);

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
  },
  { collection: 'counters' }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Budget = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);
export const Transaction =
  mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
export const SavingsGoal =
  mongoose.models.SavingsGoal || mongoose.model('SavingsGoal', savingsGoalSchema);
export const RecurringBill =
  mongoose.models.RecurringBill || mongoose.model('RecurringBill', recurringBillSchema);
export const AiConversation =
  mongoose.models.AiConversation || mongoose.model('AiConversation', aiConversationSchema);
export const Counter =
  mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default mongoose;
