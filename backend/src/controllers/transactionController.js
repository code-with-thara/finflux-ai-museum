import db from '../db/db.js';

/**
 * Single source of truth calculation for user financial balances.
 * Calculates:
 * - totalIncome: all recorded income transactions
 * - totalExpenses: all recorded expense transactions
 * - totalSavingsTransferredToGoals: goal deposits minus withdrawals
 * - totalManualBankSavingsTransfers: manual deposits minus withdrawals
 * - availableBalance: money currently available for normal spending
 * - bankSavings: separate reserve savings
 */
export async function calculateUserBalances(userId, excludeTxId = null) {
  const userObj = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!userObj) {
    return {
      availableBalance: 0,
      bankSavings: 0,
      totalIncome: 0,
      totalExpenses: 0,
      totalSavingsTransferredToGoals: 0,
      userObj: null
    };
  }

  let query = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [userId];
  if (excludeTxId) {
    query += ' AND id != ?';
    params.push(excludeTxId);
  }

  const allTx = await db.prepare(query).all(...params);

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalSavingsTransferredToGoals = 0;
  let totalManualBankSavingsDeposits = 0;
  let totalManualBankSavingsWithdrawals = 0;
  let totalExpensesCoveredFromBalance = 0;

  for (const tx of allTx) {
    if (tx.type === 'income') {
      totalIncome += Number(tx.amount) || 0;
    } else if (tx.type === 'expense') {
      totalExpenses += Number(tx.amount) || 0;
      let coveredBalance = 0;
      if (tx.covered_from_balance !== undefined && tx.covered_from_balance !== null) {
        coveredBalance = Number(tx.covered_from_balance);
      } else {
        const txAmt = Number(tx.amount) || 0;
        const covSav = Number(tx.covered_from_savings) || 0;
        const uncovDef = Number(tx.uncovered_deficit) || 0;
        coveredBalance = Math.max(0, txAmt - covSav - uncovDef);
      }
      totalExpensesCoveredFromBalance += Math.max(0, coveredBalance);
    } else if (tx.type === 'savings_deposit') {
      totalSavingsTransferredToGoals += Number(tx.amount) || 0;
    } else if (tx.type === 'savings_withdraw') {
      totalSavingsTransferredToGoals -= Number(tx.amount) || 0;
    } else if (tx.type === 'bank_savings_deposit') {
      totalManualBankSavingsDeposits += Number(tx.amount) || 0;
    } else if (tx.type === 'bank_savings_withdraw') {
      totalManualBankSavingsWithdrawals += Number(tx.amount) || 0;
    }
  }

  const effectiveIncome = Math.max(totalIncome, Number(userObj.monthly_income) || 0);
  const rawBankSavings = Number(userObj.bank_savings) || 0;
  const negativeSavingsDeficit = rawBankSavings < 0 ? Math.abs(rawBankSavings) : 0;

  const availableBalance = Math.max(
    0,
    effectiveIncome - totalExpensesCoveredFromBalance - totalSavingsTransferredToGoals - totalManualBankSavingsDeposits + totalManualBankSavingsWithdrawals - negativeSavingsDeficit
  );

  const bankSavings = rawBankSavings;

  return {
    availableBalance,
    bankSavings,
    totalIncome: effectiveIncome,
    totalExpenses,
    totalSavingsTransferredToGoals,
    totalExpensesCoveredFromBalance,
    userObj
  };
}

export async function getTransactions(req, res) {
  try {
    const userId = req.user.id;
    const { type, category, date, startDate, endDate, search, limit = 100 } = req.query;

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }

    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    if (search) {
      query += ' AND (description LIKE ? OR category LIKE ? OR merchant LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY date DESC, id DESC LIMIT ?';
    params.push(Number(limit));

    const transactions = await db.prepare(query).all(...params);
    res.json({ transactions });
  } catch (err) {
    console.error('getTransactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
}

export async function createTransaction(req, res) {
  try {
    const userId = req.user.id;
    const { type = 'expense', category = 'Other', amount, description, date, merchant, payment_method, goal_id } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid transaction amount greater than 0 is required.' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Transaction description is required.' });
    }

    const txDate = date || new Date().toISOString().split('T')[0];
    const txAmount = Number(amount);
    const userObj = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const currency = userObj?.currency || '₹';

    let createdId;
    let savingsNotification = null;
    let coveredFromBalance = 0;
    let coveredFromSavings = 0;
    let uncoveredDeficit = 0;

    await db.transaction(async () => {
      if (type === 'expense') {
        const balances = await calculateUserBalances(userId);
        const currentBalance = balances.availableBalance;

        if (txAmount <= currentBalance) {
          // Available balance is sufficient
          coveredFromBalance = txAmount;
          coveredFromSavings = 0;
          uncoveredDeficit = 0;
        } else {
          // Expense exceeds available balance -> cover the shortfall from Bank Savings.
          // Reconciling rule (kept consistent across add / edit / AI-execute flows):
          // - Ordinary overspend (expense within total earnings): savings covers
          //   only up to what's available; the remainder is tracked as
          //   uncovered_deficit and savings never drops below 0.
          // - Emergency overdraft (a single expense bigger than total earnings
          //   ever): the full shortfall is drawn from savings even if it goes
          //   negative, to be auto-tallied by the next income.
          coveredFromBalance = currentBalance;
          const shortfall = txAmount - currentBalance;
          const savingsAvail = Math.max(0, Number(balances.bankSavings) || 0);
          const overdraft = txAmount > (Number(balances.totalIncome) || 0);

          if (overdraft) {
            coveredFromSavings = shortfall;
            uncoveredDeficit = 0;

            // Deduct full shortfall amount from Bank Savings (can become negative)
            await db.prepare('UPDATE users SET bank_savings = bank_savings - ? WHERE id = ?').run(coveredFromSavings, userId);

            // Record in bank savings history ledger
            const userFull = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            if (userFull) {
              if (!Array.isArray(userFull.bank_savings_history)) userFull.bank_savings_history = [];
              userFull.bank_savings_history.unshift({
                id: Date.now(),
                date: txDate,
                type: 'shortfall_cover',
                amount: -coveredFromSavings,
                description: `Shortfall covered for: ${description.trim()}`,
                balanceAfter: userFull.bank_savings
              });
              await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(userFull.bank_savings_history, userId);

              if (userFull.bank_savings < 0) {
                savingsNotification = `⚠️ ${currency}${coveredFromSavings.toLocaleString()} was covered from savings, bringing your bank savings to a negative balance of -${currency}${Math.abs(userFull.bank_savings).toLocaleString()}. This will automatically tally with your next income.`;
              } else {
                savingsNotification = `${currency}${coveredFromSavings.toLocaleString()} was covered from your bank savings because the expense exceeded your available balance.`;
              }
            }
          } else {
            coveredFromSavings = Math.min(savingsAvail, shortfall);
            uncoveredDeficit = shortfall - coveredFromSavings;

            if (coveredFromSavings > 0) {
              await db.prepare('UPDATE users SET bank_savings = bank_savings - ? WHERE id = ?').run(coveredFromSavings, userId);

              const userFull = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
              if (userFull) {
                if (!Array.isArray(userFull.bank_savings_history)) userFull.bank_savings_history = [];
                userFull.bank_savings_history.unshift({
                  id: Date.now(),
                  date: txDate,
                  type: 'shortfall_cover',
                  amount: -coveredFromSavings,
                  description: `Shortfall covered for: ${description.trim()}`,
                  balanceAfter: userFull.bank_savings
                });
                await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(userFull.bank_savings_history, userId);
              }
            }

            if (uncoveredDeficit > 0) {
              savingsNotification = `⚠️ Warning: This expense exceeds your available funds and savings by ${currency}${uncoveredDeficit.toLocaleString()}.`;
            } else if (coveredFromSavings > 0) {
              savingsNotification = `${currency}${coveredFromSavings.toLocaleString()} was covered from your bank savings because the expense exceeded your available balance.`;
            }
          }
        }
      } else if (type === 'income') {
        coveredFromBalance = 0;
        coveredFromSavings = 0;
        uncoveredDeficit = 0;

        // Auto-tally negative bank savings overdraft if present
        const userFull = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (userFull && Number(userFull.bank_savings) < 0) {
          const negativeDeficit = Math.abs(Number(userFull.bank_savings));
          const tallyAmount = Math.min(txAmount, negativeDeficit);

          // Restore negative bank savings towards 0
          await db.prepare('UPDATE users SET bank_savings = bank_savings + ? WHERE id = ?').run(tallyAmount, userId);

          const userAfter = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
          if (!Array.isArray(userFull.bank_savings_history)) userFull.bank_savings_history = [];
          userFull.bank_savings_history.unshift({
            id: Date.now(),
            date: txDate,
            type: 'auto_tally_settlement',
            amount: tallyAmount,
            description: `Auto-tallied negative savings balance from credited income (${description.trim()})`,
            balanceAfter: userAfter ? userAfter.bank_savings : 0
          });
          await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(userFull.bank_savings_history, userId);

          // Record the tally as a bank-savings allocation so the available
          // balance reflects money moved back into savings (consistent with
          // manual transfers, which are also bank_savings_deposit entries).
          await db.prepare(`
            INSERT INTO transactions (user_id, type, category, amount, description, date, covered_from_balance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(userId, 'bank_savings_deposit', 'Savings', tallyAmount, `Auto-tally of negative savings from ${description.trim()}`, txDate, tallyAmount);

          if (userAfter && userAfter.bank_savings === 0) {
            savingsNotification = `✅ Credited ${currency}${txAmount.toLocaleString()} automatically tallied your negative bank savings (-${currency}${negativeDeficit.toLocaleString()}) back to ${currency}0!`;
          } else {
            savingsNotification = `ℹ️ ${currency}${tallyAmount.toLocaleString()} from credited income was automatically applied to tally negative bank savings balance.`;
          }
        }
      } else if (type === 'savings_deposit' && goal_id) {
        coveredFromBalance = txAmount;
        await db.prepare('UPDATE savings_goals SET current_saved = current_saved + ? WHERE id = ? AND user_id = ?').run(txAmount, goal_id, userId);
      } else if (type === 'savings_withdraw' && goal_id) {
        await db.prepare('UPDATE savings_goals SET current_saved = MAX(0, current_saved - ?) WHERE id = ? AND user_id = ?').run(txAmount, goal_id, userId);
      }

      const result = await db.prepare(`
        INSERT INTO transactions (user_id, type, category, amount, description, date, merchant, payment_method, goal_id, covered_from_balance, covered_from_savings, uncovered_deficit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, type, category, txAmount, description.trim(), txDate, merchant || null, payment_method || null, goal_id || null, coveredFromBalance, coveredFromSavings, uncoveredDeficit);

      createdId = result.lastInsertRowid;
    })();

    const newTransaction = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(createdId);
    res.status(201).json({
      message: 'Transaction recorded successfully!',
      transaction: newTransaction,
      savingsNotification,
      covered_from_balance: coveredFromBalance,
      covered_from_savings: coveredFromSavings,
      uncovered_deficit: uncoveredDeficit
    });
  } catch (err) {
    console.error('createTransaction error:', err);
    res.status(500).json({ error: 'Failed to record transaction.' });
  }
}

export async function updateTransaction(req, res) {
  try {
    const userId = req.user.id;
    const txId = req.params.id;
    const { type, category, amount, description, date, merchant, payment_method } = req.body;

    const existingTx = await db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txId, userId);
    if (!existingTx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const userObj = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const currency = userObj?.currency || '₹';
    let savingsNotification = null;

    await db.transaction(async () => {
      // 1. Revert previous transaction effects
      if (existingTx.type === 'expense' && existingTx.covered_from_savings > 0) {
        await db.prepare('UPDATE users SET bank_savings = bank_savings + ? WHERE id = ?').run(existingTx.covered_from_savings, userId);
      } else if (existingTx.type === 'savings_deposit' && existingTx.goal_id) {
        await db.prepare('UPDATE savings_goals SET current_saved = MAX(0, current_saved - ?) WHERE id = ?').run(existingTx.amount, existingTx.goal_id);
      } else if (existingTx.type === 'savings_withdraw' && existingTx.goal_id) {
        await db.prepare('UPDATE savings_goals SET current_saved = current_saved + ? WHERE id = ?').run(existingTx.amount, existingTx.goal_id);
      }

      // Temporarily nullify existing tx's covered amount for fresh balance recalculation
      existingTx.covered_from_balance = 0;
      existingTx.covered_from_savings = 0;

      const newType = type || existingTx.type;
      const newCategory = category || existingTx.category;
      const newAmount = amount !== undefined ? Number(amount) : existingTx.amount;
      const newDesc = description !== undefined ? description.trim() : existingTx.description;
      const newDate = date || existingTx.date;
      const newMerchant = merchant !== undefined ? merchant : existingTx.merchant;
      const newPayMethod = payment_method !== undefined ? payment_method : existingTx.payment_method;

      let newCoveredBalance = 0;
      let newCoveredSavings = 0;
      let newUncoveredDeficit = 0;

      if (newType === 'expense') {
        const balances = await calculateUserBalances(userId, existingTx.id);
        const currentBalance = balances.availableBalance;
        const savingsAvail = Math.max(0, Number(balances.bankSavings) || 0);

        if (newAmount <= currentBalance) {
          newCoveredBalance = newAmount;
          newCoveredSavings = 0;
          newUncoveredDeficit = 0;
        } else {
          // Same reconciling rule as create: capped cover within total
          // earnings, full overdraft only when the expense exceeds them.
          newCoveredBalance = currentBalance;
          const shortfall = newAmount - currentBalance;
          const overdraft = newAmount > (Number(balances.totalIncome) || 0);

          if (overdraft) {
            newCoveredSavings = shortfall;
            newUncoveredDeficit = 0;
          } else {
            newCoveredSavings = Math.min(savingsAvail, shortfall);
            newUncoveredDeficit = shortfall - newCoveredSavings;
          }

          if (newCoveredSavings > 0) {
            await db.prepare('UPDATE users SET bank_savings = bank_savings - ? WHERE id = ?').run(newCoveredSavings, userId);
            if (newUncoveredDeficit === 0) {
              savingsNotification = `${currency}${newCoveredSavings.toLocaleString()} was covered from your savings because the expense exceeded your available balance.`;
            }
          }

          if (newUncoveredDeficit > 0) {
            savingsNotification = `Warning: This expense exceeds your available funds and savings by ${currency}${newUncoveredDeficit.toLocaleString()}.`;
          }
        }
      }

      await db.prepare(`
        UPDATE transactions 
        SET type = ?, category = ?, amount = ?, description = ?, date = ?, merchant = ?, payment_method = ?, covered_from_balance = ?, covered_from_savings = ?, uncovered_deficit = ?
        WHERE id = ? AND user_id = ?
      `).run(newType, newCategory, newAmount, newDesc, newDate, newMerchant, newPayMethod, newCoveredBalance, newCoveredSavings, newUncoveredDeficit, txId, userId);
    })();

    const updatedTx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
    res.json({
      message: 'Transaction updated successfully!',
      transaction: updatedTx,
      savingsNotification
    });
  } catch (err) {
    console.error('updateTransaction error:', err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
}

export async function deleteTransaction(req, res) {
  try {
    const userId = req.user.id;
    const txId = req.params.id;

    const existingTx = await db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txId, userId);
    if (!existingTx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    await db.transaction(async () => {
      // Revert goal savings if savings tx
      if (existingTx.type === 'savings_deposit' && existingTx.goal_id) {
        await db.prepare('UPDATE savings_goals SET current_saved = MAX(0, current_saved - ?) WHERE id = ?').run(existingTx.amount, existingTx.goal_id);
      } else if (existingTx.type === 'savings_withdraw' && existingTx.goal_id) {
        await db.prepare('UPDATE savings_goals SET current_saved = current_saved + ? WHERE id = ?').run(existingTx.amount, existingTx.goal_id);
      }

      // Revert savings shortfall deduction if expense had used savings
      if (existingTx.type === 'expense' && existingTx.covered_from_savings > 0) {
        await db.prepare('UPDATE users SET bank_savings = bank_savings + ? WHERE id = ?').run(existingTx.covered_from_savings, userId);

        const userFull = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (userFull) {
          if (!Array.isArray(userFull.bank_savings_history)) userFull.bank_savings_history = [];
          userFull.bank_savings_history.unshift({
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            type: 'reversal',
            amount: existingTx.covered_from_savings,
            description: `Restored savings from deleted expense: ${existingTx.description}`,
            balanceAfter: userFull.bank_savings
          });
          await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(userFull.bank_savings_history, userId);
        }
      }

      // Revert manual bank savings transfers
      if (existingTx.type === 'bank_savings_deposit') {
        await db.prepare('UPDATE users SET bank_savings = MAX(0, bank_savings - ?) WHERE id = ?').run(existingTx.amount, userId);
      } else if (existingTx.type === 'bank_savings_withdraw') {
        await db.prepare('UPDATE users SET bank_savings = bank_savings + ? WHERE id = ?').run(existingTx.amount, userId);
      }

      await db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(txId, userId);
    })();

    res.json({ message: 'Transaction deleted successfully.' });
  } catch (err) {
    console.error('deleteTransaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction.' });
  }
}

export async function getSummary(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth() + 1;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    const balances = await calculateUserBalances(userId);
    const userObj = balances.userObj;
    const currency = userObj?.currency || '₹';

    // Current Month Breakdown
    const thisMonthIncomeRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'income' AND date LIKE ?
    `).get(userId, `${currentMonthStr}%`);

    const thisMonthExpenseRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND date LIKE ?
    `).get(userId, `${currentMonthStr}%`);

    const thisMonthSavedRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'savings_deposit' AND date LIKE ?
    `).get(userId, `${currentMonthStr}%`);

    // Previous Month Breakdown
    const lastMonthIncomeRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'income' AND date LIKE ?
    `).get(userId, `${prevMonthStr}%`);

    const lastMonthExpenseRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND date LIKE ?
    `).get(userId, `${prevMonthStr}%`);

    const lastMonthSavedRow = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE user_id = ? AND type = 'savings_deposit' AND date LIKE ?
    `).get(userId, `${prevMonthStr}%`);

    // Category Spending Breakdown for Current Month
    const categoryExpenses = await db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as spent 
      FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND date LIKE ?
      GROUP BY category
      ORDER BY spent DESC
    `).all(userId, `${currentMonthStr}%`);

    // Fetch Budgets & Rollover
    let budgets = await db.prepare(`
      SELECT category, allocated_amount 
      FROM budgets 
      WHERE user_id = ? AND period_month = ? AND period_year = ?
    `).all(userId, currentMonth, currentYear);

    // Auto-carry forward latest saved budgets if current month has none
    if (budgets.length === 0) {
      const allUserBudgets = await db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
      if (allUserBudgets.length > 0) {
        const latestBudget = allUserBudgets.sort((a, b) => (b.period_year * 100 + b.period_month) - (a.period_year * 100 + a.period_month))[0];
        const latestPeriodBudgets = allUserBudgets.filter(b => b.period_month === latestBudget.period_month && b.period_year === latestBudget.period_year);
        
        for (const pb of latestPeriodBudgets) {
          await db.prepare(`
            INSERT INTO budgets (user_id, category, allocated_amount, period_month, period_year)
            VALUES (?, ?, ?, ?, ?)
          `).run(userId, pb.category, pb.allocated_amount, currentMonth, currentYear);
        }

        budgets = await db.prepare(`
          SELECT category, allocated_amount 
          FROM budgets 
          WHERE user_id = ? AND period_month = ? AND period_year = ?
        `).all(userId, currentMonth, currentYear);
      }
    }

    const budgetMap = {};
    for (const b of budgets) {
      budgetMap[b.category] = { allocated: b.allocated_amount, spent: 0, rollover: 0 };
    }

    // Previous month rollover calculation if enabled
    if (userObj && userObj.rollover_enabled) {
      const prevBudgets = await db.prepare(`
        SELECT category, allocated_amount 
        FROM budgets 
        WHERE user_id = ? AND period_month = ? AND period_year = ?
      `).all(userId, prevMonth, prevYear);

      const prevCategoryExpenses = await db.prepare(`
        SELECT category, COALESCE(SUM(amount), 0) as spent 
        FROM transactions 
        WHERE user_id = ? AND type = 'expense' AND date LIKE ?
        GROUP BY category
      `).all(userId, `${prevMonthStr}%`);

      const prevSpentMap = {};
      for (const p of prevCategoryExpenses) prevSpentMap[p.category] = p.spent;

      for (const pb of prevBudgets) {
        const spentInPrev = prevSpentMap[pb.category] || 0;
        const unused = pb.allocated_amount - spentInPrev;
        if (unused > 0) {
          if (!budgetMap[pb.category]) {
            budgetMap[pb.category] = { allocated: 0, spent: 0, rollover: unused };
          } else {
            budgetMap[pb.category].rollover = unused;
          }
        }
      }
    }

    for (const catEx of categoryExpenses) {
      if (budgetMap[catEx.category]) {
        budgetMap[catEx.category].spent = catEx.spent;
      } else {
        budgetMap[catEx.category] = { allocated: 0, spent: catEx.spent, rollover: 0 };
      }
    }

    let totalBudgetAllocated = 0;
    let totalBudgetSpent = 0;
    let totalRollover = 0;
    const categoryStatusList = [];
    const lowBudgetAlerts = [];

    for (const [catName, item] of Object.entries(budgetMap)) {
      totalBudgetAllocated += item.allocated;
      totalBudgetSpent += item.spent;
      totalRollover += item.rollover;
      const totalAvailableBudget = item.allocated + item.rollover;
      const remaining = totalAvailableBudget - item.spent;
      const percentUsed = totalAvailableBudget > 0 ? (item.spent / totalAvailableBudget) * 100 : 0;

      let alertStatus = 'normal';
      if (totalAvailableBudget > 0) {
        if (item.spent > totalAvailableBudget) {
          alertStatus = 'exceeded';
          lowBudgetAlerts.push({
            category: catName,
            status: 'exceeded',
            title: '⚠️ Budget Exceeded',
            message: `You have exceeded your ${catName} budget by ${currency}${Math.abs(remaining).toFixed(0)}.`
          });
        } else if (percentUsed >= 100) {
          alertStatus = 'reached';
          lowBudgetAlerts.push({
            category: catName,
            status: 'reached',
            title: '⚠️ Budget Alert',
            message: `Your ${catName} budget has reached its limit.`
          });
        } else if (percentUsed >= 90) {
          alertStatus = 'critical';
          lowBudgetAlerts.push({
            category: catName,
            status: 'critical',
            title: '⚠️ Budget Warning',
            message: `Your ${catName} budget is getting low. ${currency}${remaining.toFixed(0)} remaining.`
          });
        } else if (percentUsed >= 80) {
          alertStatus = 'warning';
          lowBudgetAlerts.push({
            category: catName,
            status: 'warning',
            title: '⚠️ Budget Warning',
            message: `Your ${catName} budget is getting low. ${currency}${remaining.toFixed(0)} remaining.`
          });
        }
      }

      categoryStatusList.push({
        category: catName,
        allocated: item.allocated,
        rollover: item.rollover,
        totalAvailable: totalAvailableBudget,
        spent: item.spent,
        remaining,
        percentUsed,
        alertStatus
      });
    }

    // Overall Monthly Total Budget Target Tracking & Alerts
    const totalEffectiveMonthlyBudget = totalBudgetAllocated + totalRollover;
    const totalMonthSpent = thisMonthExpenseRow.total || 0;
    const totalMonthPercentUsed = totalEffectiveMonthlyBudget > 0 ? (totalMonthSpent / totalEffectiveMonthlyBudget) * 100 : 0;

    if (totalEffectiveMonthlyBudget > 0) {
      if (totalMonthSpent > totalEffectiveMonthlyBudget) {
        lowBudgetAlerts.unshift({
          category: 'Total Budget',
          status: 'exceeded',
          title: '⚠️ Budget Exceeded',
          message: `You have exceeded your monthly budget by ${currency}${(totalMonthSpent - totalEffectiveMonthlyBudget).toFixed(0)}.`
        });
      } else if (totalMonthPercentUsed >= 100) {
        lowBudgetAlerts.unshift({
          category: 'Total Budget',
          status: 'reached',
          title: '⚠️ Budget Alert',
          message: `Your monthly budget has reached its limit.`
        });
      } else if (totalMonthPercentUsed >= 90) {
        lowBudgetAlerts.unshift({
          category: 'Total Budget',
          status: 'critical',
          title: '⚠️ Budget Warning',
          message: `Your monthly budget is getting low. ${currency}${(totalEffectiveMonthlyBudget - totalMonthSpent).toFixed(0)} remaining.`
        });
      } else if (totalMonthPercentUsed >= 80) {
        lowBudgetAlerts.unshift({
          category: 'Total Budget',
          status: 'warning',
          title: '⚠️ Budget Warning',
          message: `Your monthly budget is getting low. ${currency}${(totalEffectiveMonthlyBudget - totalMonthSpent).toFixed(0)} remaining.`
        });
      }
    }

    // Bill Due Date Reminders (1 day before due date)
    const allBills = await db.prepare('SELECT * FROM recurring_bills WHERE user_id = ?').all(userId);
    const currentDay = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const tomorrowDay = (currentDay % daysInMonth) + 1;

    for (const b of allBills) {
      const isPaid = b.last_paid_date && b.last_paid_date.startsWith(currentMonthStr);
      if (!isPaid && b.due_day === tomorrowDay) {
        lowBudgetAlerts.unshift({
          category: 'Bill Reminder',
          status: 'bill',
          title: '🔔 Payment Reminder',
          message: `Your ${b.name} bill of ${currency}${b.amount.toLocaleString()} is due tomorrow.`
        });
      }
    }

    // Monthly Expense Graph Data (past 6 months)
    const monthlyExpenses = [];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mStr = `${y}-${String(m).padStart(2, '0')}`;
      const mName = monthNames[d.getMonth()];

      const mExpenseRow = await db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date LIKE ?
      `).get(userId, `${mStr}%`);

      monthlyExpenses.push({
        year: y,
        month: m,
        monthKey: mStr,
        monthName: mName,
        shortName: mName.slice(0, 3),
        amount: mExpenseRow?.total || 0,
        isCurrent: i === 0
      });
    }

    const nonZeroMonths = monthlyExpenses.filter(m => m.amount > 0);
    const highestMonth = nonZeroMonths.length > 0 
      ? nonZeroMonths.reduce((prev, curr) => curr.amount > prev.amount ? curr : prev, nonZeroMonths[0])
      : (monthlyExpenses[monthlyExpenses.length - 1] || null);

    const lowestMonth = nonZeroMonths.length > 0
      ? nonZeroMonths.reduce((prev, curr) => curr.amount < prev.amount ? curr : prev, nonZeroMonths[0])
      : null;

    // Projected Month-End Unused Budget Savings
    let projectedMonthEndSavings = 0;
    const projectedSavingsBreakdown = [];
    for (const cs of categoryStatusList) {
      if (cs.allocated > 0 && cs.remaining > 0) {
        projectedMonthEndSavings += cs.remaining;
        projectedSavingsBreakdown.push({
          category: cs.category,
          allocated: cs.allocated,
          spent: cs.spent,
          saved: cs.remaining
        });
      }
    }

    // Separate Budget Remaining calculation (Planned budget - actual expenses)
    const budgetRemaining = totalBudgetAllocated > 0 ? (totalBudgetAllocated - (thisMonthExpenseRow.total || 0)) : 0;

    res.json({
      summary: {
        availableBalance: balances.availableBalance,
        bankSavings: balances.bankSavings,
        totalIncome: balances.totalIncome,
        totalExpenses: balances.totalExpenses,
        totalSavingsTransferred: balances.totalSavingsTransferredToGoals,
        budgetEnabled: userObj ? userObj.budget_enabled !== 0 : true,
        salaryDay: userObj?.salary_day || 1,
        thisMonth: {
          income: Math.max(thisMonthIncomeRow.total || 0, Number(userObj?.monthly_income) || 0),
          expenses: thisMonthExpenseRow.total,
          savings: thisMonthSavedRow.total,
          balance: Math.max(thisMonthIncomeRow.total || 0, Number(userObj?.monthly_income) || 0) - thisMonthExpenseRow.total - thisMonthSavedRow.total
        },
        lastMonth: {
          income: lastMonthIncomeRow.total,
          expenses: lastMonthExpenseRow.total,
          savings: lastMonthSavedRow.total
        },
        budget: {
          allocated: totalBudgetAllocated,
          spent: thisMonthExpenseRow.total || 0,
          rollover: totalRollover,
          remaining: budgetRemaining,
          percentUsed: totalMonthPercentUsed
        },
        categoryExpenses,
        categoryBudgets: categoryStatusList,
        lowBudgetAlerts,
        monthlyExpenseGraph: {
          history: monthlyExpenses,
          currentMonthSpent: thisMonthExpenseRow.total || 0,
          highestMonth: highestMonth ? { name: highestMonth.monthName, amount: highestMonth.amount } : null,
          lowestMonth: lowestMonth ? { name: lowestMonth.monthName, amount: lowestMonth.amount } : null
        },
        bankSavingsInfo: {
          currentBalance: balances.bankSavings,
          projectedMonthEndSavings,
          projectedSavingsBreakdown
        }
      }
    });
  } catch (err) {
    console.error('getSummary error detail:', err.stack || err);
    res.status(500).json({ error: 'Failed to generate financial summary.', detail: err.message });
  }
}

export async function getBankSavings(req, res) {
  try {
    const userId = req.user.id;
    const balances = await calculateUserBalances(userId);
    const userObj = balances.userObj;
    if (!userObj) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    const budgets = await db.prepare(`
      SELECT category, allocated_amount 
      FROM budgets 
      WHERE user_id = ? AND period_month = ? AND period_year = ?
    `).all(userId, currentMonth, currentYear);

    const categoryExpenses = await db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as spent 
      FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND date LIKE ?
      GROUP BY category
    `).all(userId, `${currentMonthStr}%`);

    const spentMap = {};
    for (const c of categoryExpenses) spentMap[c.category] = c.spent;

    let projectedSavings = 0;
    const savingsBreakdown = [];

    for (const b of budgets) {
      const spent = spentMap[b.category] || 0;
      const unused = b.allocated_amount - spent;
      if (unused > 0) {
        projectedSavings += unused;
        savingsBreakdown.push({
          category: b.category,
          allocated: b.allocated_amount,
          spent,
          saved: unused
        });
      }
    }

    const history = userObj.bank_savings_history || [];

    res.json({
      bank_savings: balances.bankSavings,
      available_balance: balances.availableBalance,
      currency: userObj.currency || '₹',
      projectedSavings,
      savingsBreakdown,
      history
    });
  } catch (err) {
    console.error('getBankSavings error:', err);
    res.status(500).json({ error: 'Failed to fetch bank savings details' });
  }
}

/**
 * Explicit manual transfer between Available Balance and Bank Savings
 * Direction: 'deposit' (Available Balance -> Bank Savings) | 'withdraw' (Bank Savings -> Available Balance)
 */
export async function transferBankSavings(req, res) {
  try {
    const userId = req.user.id;
    const { amount, direction = 'deposit', notes } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid transfer amount greater than 0 is required.' });
    }

    const transferAmount = Number(amount);
    const balances = await calculateUserBalances(userId);
    const userObj = balances.userObj;
    if (!userObj) return res.status(404).json({ error: 'User not found.' });

    const txDate = new Date().toISOString().split('T')[0];

    await db.transaction(async () => {
      if (direction === 'deposit') {
        // Transfer from Available Balance to Bank Savings
        if (transferAmount > balances.availableBalance) {
          throw new Error(`Insufficient available balance (Current: ₹${balances.availableBalance.toLocaleString()}) for transfer.`);
        }

        await db.prepare('UPDATE users SET bank_savings = bank_savings + ? WHERE id = ?').run(transferAmount, userId);

        const updatedUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (updatedUser) {
          if (!Array.isArray(updatedUser.bank_savings_history)) updatedUser.bank_savings_history = [];
          updatedUser.bank_savings_history.unshift({
            id: Date.now(),
            date: txDate,
            type: 'manual_deposit',
            amount: transferAmount,
            description: notes ? notes.trim() : 'Transferred from Available Balance to Bank Savings',
            balanceAfter: updatedUser.bank_savings
          });
          await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(updatedUser.bank_savings_history, userId);
        }

        await db.prepare(`
          INSERT INTO transactions (user_id, type, category, amount, description, date, covered_from_balance)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, 'bank_savings_deposit', 'Savings', transferAmount, notes ? notes.trim() : 'Transfer to Bank Savings', txDate, transferAmount);

      } else {
        // Withdraw from Bank Savings to Available Balance
        if (transferAmount > balances.bankSavings) {
          throw new Error(`Insufficient bank savings (Current: ₹${balances.bankSavings.toLocaleString()}) for withdrawal.`);
        }

        await db.prepare('UPDATE users SET bank_savings = bank_savings - ? WHERE id = ?').run(transferAmount, userId);

        const updatedUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (updatedUser) {
          if (!Array.isArray(updatedUser.bank_savings_history)) updatedUser.bank_savings_history = [];
          updatedUser.bank_savings_history.unshift({
            id: Date.now(),
            date: txDate,
            type: 'manual_withdraw',
            amount: -transferAmount,
            description: notes ? notes.trim() : 'Withdrawn from Bank Savings to Available Balance',
            balanceAfter: updatedUser.bank_savings
          });
          await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(updatedUser.bank_savings_history, userId);
        }

        await db.prepare(`
          INSERT INTO transactions (user_id, type, category, amount, description, date, covered_from_balance)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, 'bank_savings_withdraw', 'Savings', transferAmount, notes ? notes.trim() : 'Withdrawal from Bank Savings', txDate, 0);
      }
    })();

    const updatedBalances = await calculateUserBalances(userId);

    res.json({
      message: direction === 'deposit' ? 'Transferred to Bank Savings successfully!' : 'Withdrawn from Bank Savings successfully!',
      available_balance: updatedBalances.availableBalance,
      bank_savings: updatedBalances.bankSavings
    });
  } catch (err) {
    console.error('transferBankSavings error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to transfer savings.' });
  }
}

export async function processMonthEndSavings(req, res) {
  try {
    const userId = req.user.id;
    const balances = await calculateUserBalances(userId);
    const userObj = balances.userObj;
    if (!userObj) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const month = req.body.month || (now.getMonth() + 1);
    const year = req.body.year || now.getFullYear();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1];

    const budgets = await db.prepare(`
      SELECT category, allocated_amount 
      FROM budgets 
      WHERE user_id = ? AND period_month = ? AND period_year = ?
    `).all(userId, month, year);

    const categoryExpenses = await db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as spent 
      FROM transactions 
      WHERE user_id = ? AND type = 'expense' AND date LIKE ?
      GROUP BY category
    `).all(userId, `${monthStr}%`);

    const spentMap = {};
    for (const c of categoryExpenses) spentMap[c.category] = c.spent;

    let netMonthSavings = 0;
    const details = [];

    for (const b of budgets) {
      const spent = spentMap[b.category] || 0;
      const diff = b.allocated_amount - spent;
      netMonthSavings += diff;
      details.push({
        category: b.category,
        allocated: b.allocated_amount,
        spent,
        net: diff
      });
    }

    if (netMonthSavings > 0) {
      await db.prepare('UPDATE users SET bank_savings = bank_savings + ? WHERE id = ?').run(netMonthSavings, userId);

      const userFull = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (userFull) {
        if (!Array.isArray(userFull.bank_savings_history)) userFull.bank_savings_history = [];
        userFull.bank_savings_history.unshift({
          id: Date.now(),
          date: new Date().toISOString().split('T')[0],
          type: 'month_end_surplus',
          month: monthName,
          year,
          amount: netMonthSavings,
          description: `Month-End Unused Budget Surplus (${monthName} ${year})`,
          balanceAfter: userFull.bank_savings,
          details
        });
        await db.prepare('UPDATE users SET bank_savings_history = ? WHERE id = ?').run(userFull.bank_savings_history, userId);
      }
    }

    const updatedBalances = await calculateUserBalances(userId);

    res.json({
      message: `Month-end savings processed for ${monthName} ${year}!`,
      addedAmount: netMonthSavings,
      bank_savings: updatedBalances.bankSavings,
      details
    });
  } catch (err) {
    console.error('processMonthEndSavings error:', err);
    res.status(500).json({ error: 'Failed to process month-end savings.' });
  }
}

export async function updateBankSavings(req, res) {
  try {
    const userId = req.user.id;
    const { bank_savings } = req.body;

    if (bank_savings === undefined || isNaN(bank_savings) || Number(bank_savings) < 0) {
      return res.status(400).json({ error: 'Valid bank savings amount is required.' });
    }

    const newSavings = Number(bank_savings);
    await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(newSavings, userId);

    res.json({ message: 'Bank savings updated successfully!', bank_savings: newSavings });
  } catch (err) {
    console.error('updateBankSavings error:', err);
    res.status(500).json({ error: 'Failed to update bank savings.' });
  }
}
