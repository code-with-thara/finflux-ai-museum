import db from '../db/db.js';

export async function getBudgets(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();

    let budgets = await db.prepare(`
      SELECT * FROM budgets 
      WHERE user_id = ? AND period_month = ? AND period_year = ?
    `).all(userId, month, year);

    // If no budgets exist for current requested period, auto-carry forward user's last saved budget allocations
    if (budgets.length === 0) {
      const allUserBudgets = await db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(userId);
      if (allUserBudgets.length > 0) {
        // Find most recent year and month
        const latestBudget = allUserBudgets.sort((a, b) => (b.period_year * 100 + b.period_month) - (a.period_year * 100 + a.period_month))[0];
        const latestPeriodBudgets = allUserBudgets.filter(b => b.period_month === latestBudget.period_month && b.period_year === latestBudget.period_year);
        
        for (const pb of latestPeriodBudgets) {
          await db.prepare(`
            INSERT INTO budgets (user_id, category, allocated_amount, period_month, period_year)
            VALUES (?, ?, ?, ?, ?)
          `).run(userId, pb.category, pb.allocated_amount, month, year);
        }

        budgets = await db.prepare(`
          SELECT * FROM budgets 
          WHERE user_id = ? AND period_month = ? AND period_year = ?
        `).all(userId, month, year);
      }
    }

    const user = await db.prepare('SELECT budget_enabled FROM users WHERE id = ?').get(userId);

    res.json({ month, year, budgets, budgetEnabled: user ? user.budget_enabled !== 0 : true });
  } catch (err) {
    console.error('getBudgets error:', err);
    res.status(500).json({ error: 'Failed to fetch budget allocations.' });
  }
}

export async function setBudget(req, res) {
  try {
    const userId = req.user.id;
    const { category, allocated_amount, month, year } = req.body;

    if (!category || allocated_amount === undefined || isNaN(allocated_amount)) {
      return res.status(400).json({ error: 'Category and valid allocated amount are required.' });
    }

    const now = new Date();
    const targetMonth = month ? Number(month) : now.getMonth() + 1;
    const targetYear = year ? Number(year) : now.getFullYear();

    await db.prepare(`
      INSERT INTO budgets (user_id, category, allocated_amount, period_month, period_year)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, category, Number(allocated_amount), targetMonth, targetYear);

    const budgets = await db.prepare(`
      SELECT * FROM budgets 
      WHERE user_id = ? AND period_month = ? AND period_year = ?
    `).all(userId, targetMonth, targetYear);

    res.json({ message: 'Budget updated successfully!', budgets });
  } catch (err) {
    console.error('setBudget error:', err);
    res.status(500).json({ error: 'Failed to update budget.' });
  }
}

export async function toggleBudget(req, res) {
  try {
    const userId = req.user.id;
    const { enabled } = req.body;

    const newStatus = enabled !== undefined ? (enabled ? 1 : 0) : undefined;
    if (newStatus === undefined) {
      const u = await db.prepare('SELECT budget_enabled FROM users WHERE id = ?').get(userId);
      const current = u ? u.budget_enabled !== 0 : true;
      const toggled = current ? 0 : 1;
      await db.prepare('UPDATE users SET budget_enabled = ? WHERE id = ?').run(toggled, userId);
      return res.json({ 
        message: toggled ? 'Budget tracking activated!' : 'Budget tracking disabled.', 
        budgetEnabled: Boolean(toggled),
        budget_enabled: toggled
      });
    }

    await db.prepare('UPDATE users SET budget_enabled = ? WHERE id = ?').run(newStatus, userId);
    res.json({ 
      message: newStatus ? 'Budget tracking activated!' : 'Budget tracking disabled.', 
      budgetEnabled: Boolean(newStatus),
      budget_enabled: newStatus
    });
  } catch (err) {
    console.error('toggleBudget error:', err);
    res.status(500).json({ error: 'Failed to toggle budget status.' });
  }
}

export async function deleteBudget(req, res) {
  try {
    const userId = req.user.id;
    const budgetId = req.params.id;

    await db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(budgetId, userId);
    res.json({ message: 'Budget category removed successfully.' });
  } catch (err) {
    console.error('deleteBudget error:', err);
    res.status(500).json({ error: 'Failed to delete budget.' });
  }
}
