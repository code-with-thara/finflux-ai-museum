import db from '../db/db.js';
import { parseTransactionInput, processFinancialChat } from '../services/aiService.js';

export async function parseTransaction(req, res) {
  try {
    const userId = req.user.id;
    const { input } = req.body;

    if (!input || !input.trim()) {
      return res.status(400).json({ error: 'Input text is required.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const result = await parseTransactionInput(input, user);

    res.json({ result });
  } catch (err) {
    console.error('parseTransaction error:', err);
    res.status(500).json({ error: 'Failed to parse natural language transaction input.' });
  }
}

export async function parseAndExecute(req, res) {
  try {
    const userId = req.user.id;
    const { input } = req.body;

    if (!input || !input.trim()) {
      return res.status(400).json({ error: 'Input text is required.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const parsed = await parseTransactionInput(input.trim(), user);

    const currency = user?.currency || '₹';
    const nowStr = new Date().toISOString().split('T')[0];

    // 1. Create Transaction (Expense or Income)
    if (parsed.intent === 'create_transaction') {
      if (!parsed.amount || parsed.amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required.' });
      }

      let covered_from_balance = 0;
      let covered_from_savings = 0;
      let uncovered_deficit = 0;
      let savingsNotification = null;

      if (parsed.type === 'expense') {
        const incomeRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income'").get(userId) || {};
        const expenseRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense'").get(userId) || {};
        const savedRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'savings_deposit'").get(userId) || {};

        const totalIncome = Number(incomeRow.total || 0);
        const totalExpense = Number(expenseRow.total || 0);
        const totalSaved = Number(savedRow.total || 0);
        const availableBalance = totalIncome - totalExpense - totalSaved;

        const expenseAmount = Number(parsed.amount);

        if (availableBalance >= expenseAmount) {
          covered_from_balance = expenseAmount;
        } else {
          // Same reconciling rule as the transactions flow: capped cover
          // within total earnings, full overdraft only when the expense
          // exceeds them.
          covered_from_balance = Math.max(0, availableBalance);
          const remainingNeeded = expenseAmount - covered_from_balance;
          const currentBankSavings = Math.max(0, Number(user.bank_savings || 0));
          const effectiveIncome = Math.max(totalIncome, Number(user?.monthly_income) || 0);

          if (expenseAmount > effectiveIncome) {
            covered_from_savings = remainingNeeded;
            uncovered_deficit = 0;
            const newSavings = Number(user.bank_savings || 0) - remainingNeeded;
            await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(newSavings, userId);
            savingsNotification = `⚠️ ${currency}${remainingNeeded.toLocaleString()} was covered from savings, bringing your bank savings to a negative balance of -${currency}${Math.abs(newSavings).toLocaleString()}. This will automatically tally with your next income.`;
          } else if (currentBankSavings >= remainingNeeded) {
            covered_from_savings = remainingNeeded;
            const newSavings = currentBankSavings - remainingNeeded;
            await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(newSavings, userId);
            savingsNotification = `Deducted ${currency}${remainingNeeded.toLocaleString()} from Bank Savings reserve to cover expense. Remaining Bank Savings: ${currency}${newSavings.toLocaleString()}.`;
          } else {
            covered_from_savings = currentBankSavings;
            uncovered_deficit = remainingNeeded - currentBankSavings;
            if (currentBankSavings > 0) {
              await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(0, userId);
              savingsNotification = `Deducted all remaining ${currency}${currentBankSavings.toLocaleString()} from Bank Savings reserve. Uncovered deficit remaining: ${currency}${uncovered_deficit.toLocaleString()}.`;
            } else {
              savingsNotification = `⚠️ Warning: This expense exceeds your available funds and savings by ${currency}${uncovered_deficit.toLocaleString()}.`;
            }
          }
        }
      }

      const txResult = await db.prepare(`
        INSERT INTO transactions (
          user_id, type, category, amount, description, date,
          covered_from_balance, covered_from_savings, uncovered_deficit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        parsed.type || 'expense',
        parsed.category || 'Other Expense',
        Number(parsed.amount),
        parsed.description || parsed.category || 'Expense',
        nowStr,
        covered_from_balance,
        covered_from_savings,
        uncovered_deficit
      );

      return res.json({
        success: true,
        message: `Recorded ${currency}${parsed.amount} for ${parsed.description || parsed.category} under ${parsed.category}.`,
        savingsNotification,
        parsed,
        transactionId: txResult.lastInsertRowid
      });
    }

    // 2. Bank Savings Deposit
    if (parsed.intent === 'bank_savings_deposit') {
      const amt = Number(parsed.amount) || 0;
      if (amt <= 0) return res.status(400).json({ error: 'Savings deposit amount must be greater than zero.' });

      const currentSavings = Number(user.bank_savings || 0);
      const newSavings = currentSavings + amt;
      await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(newSavings, userId);

      await db.prepare(`
        INSERT INTO transactions (user_id, type, category, amount, description, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, 'savings_deposit', 'Savings', amt, 'Deposit to Bank Savings', nowStr);

      return res.json({
        success: true,
        message: `Saved ${currency}${amt.toLocaleString()} in Bank Savings reserve! New Bank Savings: ${currency}${newSavings.toLocaleString()}.`,
        parsed
      });
    }

    // 3. Create Savings Goal
    if (parsed.intent === 'create_goal') {
      const gResult = await db.prepare(`
        INSERT INTO savings_goals (user_id, name, target_amount, current_saved)
        VALUES (?, ?, ?, 0)
      `).run(userId, parsed.goalName, Number(parsed.targetAmount) || 10000);

      return res.json({
        success: true,
        message: `Created new Savings Goal '${parsed.goalName}' with target ${currency}${(parsed.targetAmount || 10000).toLocaleString()}!`,
        parsed,
        goalId: gResult.lastInsertRowid
      });
    }

    // 4. Create Recurring Bill
    if (parsed.intent === 'create_bill') {
      const bResult = await db.prepare(`
        INSERT INTO recurring_bills (user_id, name, amount, category, frequency, due_day)
        VALUES (?, ?, ?, ?, 'monthly', ?)
      `).run(userId, parsed.billName, Number(parsed.amount) || 500, parsed.category || 'Other Expense', Number(parsed.dueDay) || 5);

      return res.json({
        success: true,
        message: `Added recurring bill '${parsed.billName}' of ${currency}${(parsed.amount || 500).toLocaleString()} due on day ${parsed.dueDay}!`,
        parsed,
        billId: bResult.lastInsertRowid
      });
    }

    // 5. Create Category Budget
    if (parsed.intent === 'create_budget') {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      await db.prepare(`
        INSERT INTO budgets (user_id, category, allocated_amount, period_month, period_year)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, category, period_month, period_year) 
        DO UPDATE SET allocated_amount = excluded.allocated_amount
      `).run(userId, parsed.category || 'Other Expense', Number(parsed.amount) || 1000, month, year);

      return res.json({
        success: true,
        message: `Set monthly budget limit of ${currency}${(parsed.amount || 1000).toLocaleString()} for ${parsed.category || 'Other Expense'}!`,
        parsed
      });
    }

    return res.status(400).json({ error: 'Could not recognize command intent. Please try rephrasing.' });
  } catch (err) {
    console.error('parseAndExecute error:', err);
    res.status(500).json({ error: 'Failed to process natural language request.' });
  }
}

export async function chatWithAI(req, res) {
  try {
    const userId = req.user.id;
    const { message, history } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    // Save user message to database
    await db.prepare(`
      INSERT INTO ai_conversations (user_id, role, message)
      VALUES (?, ?, ?)
    `).run(userId, 'user', message.trim());

    // Generate response
    const replyText = await processFinancialChat(message.trim(), userId, history);

    // Save assistant reply to database
    await db.prepare(`
      INSERT INTO ai_conversations (user_id, role, message)
      VALUES (?, ?, ?)
    `).run(userId, 'assistant', replyText);

    res.json({ reply: replyText });
  } catch (err) {
    console.error('chatWithAI error detail:', err.stack || err);
    res.status(500).json({ error: 'Failed to process AI assistant chat.', detail: err.message });
  }
}

export async function getSuggestions(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const currency = user?.currency || '₹';

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const suggestions = [];

    // 1. Check all user budget allocations for alerts
    let budgets = await db.prepare(`
      SELECT * FROM budgets WHERE user_id = ? AND period_month = ? AND period_year = ?
    `).all(userId, currentMonth, currentYear);

    if (budgets.length === 0) {
      const allBudgets = await db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
      if (allBudgets.length > 0) {
        const latest = allBudgets.sort((a, b) => (b.period_year * 100 + b.period_month) - (a.period_year * 100 + a.period_month))[0];
        budgets = allBudgets.filter(b => b.period_month === latest.period_month && b.period_year === latest.period_year);
      }
    }

    const categoryExpenses = await db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as spent FROM transactions
      WHERE user_id = ? AND type = 'expense' AND date LIKE ?
      GROUP BY category
    `).all(userId, `${currentMonthStr}%`);

    const spentMap = {};
    for (const c of categoryExpenses) spentMap[c.category] = Number(c.spent);

    let totalAllocated = 0;
    let totalSpent = 0;

    for (const b of budgets) {
      totalAllocated += Number(b.allocated_amount);
      const spent = spentMap[b.category] || 0;
      totalSpent += spent;
      const pct = b.allocated_amount > 0 ? (spent / b.allocated_amount) * 100 : 0;

      if (spent > b.allocated_amount) {
        suggestions.push({
          id: `budget_exceeded_${b.category}`,
          type: 'warning',
          icon: '⚠️',
          title: `${b.category} Budget Exceeded`,
          message: `You've exceeded your ${b.category} budget by ${currency}${(spent - b.allocated_amount).toFixed(0)}.`
        });
      } else if (pct >= 100) {
        suggestions.push({
          id: `budget_target_${b.category}`,
          type: 'danger',
          icon: '🔴',
          title: `Budget Target Reached`,
          message: `🔴 Budget Target Reached – You have reached your allocated budget for ${b.category} this month.`
        });
      } else if (pct >= 90) {
        suggestions.push({
          id: `budget_crit_${b.category}`,
          type: 'warning',
          icon: '⚠️',
          title: `${b.category} Near Limit (90%)`,
          message: `⚠️ Critical Warning – You have reached ${pct.toFixed(0)}% of your allocated budget for ${b.category}.`
        });
      } else if (pct >= 80) {
        suggestions.push({
          id: `budget_warn_${b.category}`,
          type: 'info',
          icon: '💡',
          title: `${b.category} Alert (80%)`,
          message: `💡 Budget Alert – You have reached 80% of your allocated budget for ${b.category}.`
        });
      }
    }

    // 2. Check total monthly budget alert
    if (totalAllocated > 0) {
      const totalPct = (totalSpent / totalAllocated) * 100;
      if (totalSpent > totalAllocated) {
        suggestions.unshift({
          id: 'total_budget_exceeded',
          type: 'warning',
          icon: '⚠️',
          title: 'Total Monthly Budget Exceeded',
          message: `⚠️ Budget Exceeded – You have exceeded your monthly allocated budget by ${currency}${(totalSpent - totalAllocated).toFixed(0)}.`
        });
      } else if (totalPct >= 100) {
        suggestions.unshift({
          id: 'total_budget_target',
          type: 'danger',
          icon: '🔴',
          title: 'Budget Target Reached',
          message: '🔴 Budget Target Reached – You have reached your allocated budget for this month.'
        });
      }
    }

    // 3. Check savings goals progress
    const goals = await db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);
    for (const g of goals) {
      const pct = g.target_amount > 0 ? Math.round((g.current_saved / g.target_amount) * 100) : 0;
      if (pct >= 100) {
        suggestions.push({
          id: `goal_completed_${g.id}`,
          type: 'success',
          icon: '🎉',
          title: 'Goal Target Reached!',
          message: `🎉 Congratulations! You reached your target of ${currency}${g.target_amount.toLocaleString()} for ${g.name}!`
        });
      } else if (pct >= 50) {
        suggestions.push({
          id: `goal_track_${g.id}`,
          type: 'success',
          icon: '🎯',
          title: 'Goal Progress On Track',
          message: `🎯 You are ${pct}% of the way toward your ${g.name} goal (${currency}${g.current_saved.toLocaleString()} / ${currency}${g.target_amount.toLocaleString()})!`
        });
      }
    }

    // Default friendly welcome suggestion if new
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'welcome_tip',
        type: 'info',
        icon: '💡',
        title: 'SmartBudget AI Tip',
        message: `💡 Just tell SmartBudget what you spent using text or voice. We'll automatically organize your budget and track your goals!`
      });
    }

    res.json({ suggestions });
  } catch (err) {
    console.error('getSuggestions error:', err);
    res.status(500).json({ error: 'Failed to generate financial suggestions.' });
  }
}
