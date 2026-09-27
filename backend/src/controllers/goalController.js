import db from '../db/db.js';

export async function getGoals(req, res) {
  try {
    const userId = req.user.id;
    const goals = await db.prepare('SELECT * FROM savings_goals WHERE user_id = ?').all(userId);

    const enrichedGoals = goals.map(g => {
      const remaining = Math.max(0, g.target_amount - g.current_saved);
      const percentCompleted = g.target_amount > 0 ? Math.min(100, Math.round((g.current_saved / g.target_amount) * 100)) : 0;
      
      let estimatedMonthsLeft = null;
      if (remaining > 0) {
        // Estimate based on current saved rate
        estimatedMonthsLeft = Math.ceil(remaining / 5000); // Default benchmark fallback
      }

      return {
        ...g,
        remaining,
        percentCompleted,
        estimatedMonthsLeft
      };
    });

    res.json({ goals: enrichedGoals });
  } catch (err) {
    console.error('getGoals error:', err);
    res.status(500).json({ error: 'Failed to fetch savings goals.' });
  }
}

export async function createGoal(req, res) {
  try {
    const userId = req.user.id;
    const { name, target_amount, initial_deposit = 0, target_date } = req.body;

    if (!name || !name.trim() || !target_amount || isNaN(target_amount) || Number(target_amount) <= 0) {
      return res.status(400).json({ error: 'Goal name and a valid target amount greater than 0 are required.' });
    }

    const initDep = Number(initial_deposit) || 0;
    let newGoalId;

    await db.transaction(async () => {
      const result = await db.prepare(`
        INSERT INTO savings_goals (user_id, name, target_amount, current_saved, target_date)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, name.trim(), Number(target_amount), initDep, target_date || null);

      newGoalId = result.lastInsertRowid;

      if (initDep > 0) {
        await db.prepare(`
          INSERT INTO transactions (user_id, type, category, amount, description, date, goal_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, 'savings_deposit', 'Savings', initDep, `Initial contribution to ${name.trim()}`, new Date().toISOString().split('T')[0], newGoalId);
      }
    })();

    const goal = await db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(newGoalId);
    res.status(201).json({ message: 'Savings goal created!', goal });
  } catch (err) {
    console.error('createGoal error:', err);
    res.status(500).json({ error: 'Failed to create savings goal.' });
  }
}

export async function depositToGoal(req, res) {
  try {
    const userId = req.user.id;
    const goalId = req.params.id;
    const { amount, notes } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid deposit amount greater than 0 is required.' });
    }

    const goal = await db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found.' });
    }

    const depAmount = Number(amount);
    const dateStr = new Date().toISOString().split('T')[0];

    await db.transaction(async () => {
      await db.prepare('UPDATE savings_goals SET current_saved = current_saved + ? WHERE id = ?').run(depAmount, goalId);

      await db.prepare(`
        INSERT INTO transactions (user_id, type, category, amount, description, date, goal_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, 'savings_deposit', 'Savings', depAmount, notes ? notes.trim() : `Saved for ${goal.name}`, dateStr, goalId);
    })();

    const updatedGoal = await db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
    res.json({ message: `Added ₹${depAmount} to ${goal.name}!`, goal: updatedGoal });
  } catch (err) {
    console.error('depositToGoal error:', err);
    res.status(500).json({ error: 'Failed to add money to savings goal.' });
  }
}

export async function withdrawFromGoal(req, res) {
  try {
    const userId = req.user.id;
    const goalId = req.params.id;
    const { amount, notes } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid withdrawal amount greater than 0 is required.' });
    }

    const goal = await db.prepare('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId);
    if (!goal) {
      return res.status(404).json({ error: 'Savings goal not found.' });
    }

    const withAmount = Math.min(goal.current_saved, Number(amount));
    const dateStr = new Date().toISOString().split('T')[0];

    await db.transaction(async () => {
      await db.prepare('UPDATE savings_goals SET current_saved = MAX(0, current_saved - ?) WHERE id = ?').run(withAmount, goalId);

      await db.prepare(`
        INSERT INTO transactions (user_id, type, category, amount, description, date, goal_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, 'savings_withdraw', 'Savings', withAmount, notes ? notes.trim() : `Withdrawn from ${goal.name}`, dateStr, goalId);
    })();

    const updatedGoal = await db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(goalId);
    res.json({ message: `Withdrew ₹${withAmount} from ${goal.name}!`, goal: updatedGoal });
  } catch (err) {
    console.error('withdrawFromGoal error:', err);
    res.status(500).json({ error: 'Failed to withdraw from savings goal.' });
  }
}

export async function deleteGoal(req, res) {
  try {
    const userId = req.user.id;
    const goalId = req.params.id;

    await db.prepare('DELETE FROM savings_goals WHERE id = ? AND user_id = ?').run(goalId, userId);
    res.json({ message: 'Savings goal deleted.' });
  } catch (err) {
    console.error('deleteGoal error:', err);
    res.status(500).json({ error: 'Failed to delete savings goal.' });
  }
}
