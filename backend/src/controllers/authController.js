import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'smartbudget_super_secret_jwt_key_2026';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export async function register(req, res) {
  try {
    const { name, email, password, confirmPassword, monthly_income, salary_day, categories, budget_enabled, bank_savings, savings_pin } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let createdUserId;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    await db.transaction(async () => {
      const result = await db.prepare(`
        INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)
      `).run(name.trim(), email.toLowerCase().trim(), passwordHash);
      createdUserId = result.lastInsertRowid;

      // If bank savings provided, update it
      if (bank_savings !== undefined && bank_savings !== null && Number(bank_savings) >= 0) {
        await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(Number(bank_savings), createdUserId);
      }

      // If savings_pin provided, update it
      if (savings_pin !== undefined && savings_pin !== null) {
        await db.prepare('UPDATE users SET savings_pin = ? WHERE id = ?').run(String(savings_pin), createdUserId);
      }

      // If monthly income or budget provided during registration, save it
      const hasIncome = monthly_income !== undefined && monthly_income !== null && Number(monthly_income) > 0;
      const hasCategories = Array.isArray(categories) && categories.length > 0;
      const sDay = salary_day !== undefined && salary_day !== null && Number(salary_day) >= 1 ? Number(salary_day) : 1;

      if (hasIncome || hasCategories || budget_enabled !== undefined || salary_day !== undefined) {
        const inc = hasIncome ? Number(monthly_income) : 0;
        const bEnabled = budget_enabled !== undefined ? (budget_enabled ? 1 : 0) : 1;
        await db.prepare(`
          UPDATE users 
          SET monthly_income = ?, salary_day = ?, budget_enabled = ?, onboarding_completed = 1 
          WHERE id = ?
        `).run(inc, sDay, bEnabled, createdUserId);

        if (hasIncome) {
          await db.prepare(`
            INSERT INTO transactions (user_id, type, category, amount, description, date)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(createdUserId, 'income', 'Salary', inc, 'Monthly Salary Income', now.toISOString().split('T')[0]);
        }

        if (hasCategories) {
          const bStmt = await db.prepare(`
            INSERT INTO budgets (user_id, category, allocated_amount, period_month, period_year)
            VALUES (?, ?, ?, ?, ?)
          `);
          for (const cat of categories) {
            const amt = Number(cat.allocated_amount !== undefined ? cat.allocated_amount : cat.amount);
            if (cat.category && amt > 0) {
              await bStmt.run(createdUserId, cat.category, amt, month, year);
            }
          }
        }
      }
    })();

    const user = await db.prepare(`
      SELECT id, name, email, currency, monthly_income, salary_day, bank_savings, savings_pin, rollover_enabled, budget_enabled, onboarding_completed, created_at 
      FROM users WHERE id = ?
    `).get(createdUserId);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      currency: user.currency,
      monthly_income: user.monthly_income,
      salary_day: user.salary_day || 1,
      bank_savings: user.bank_savings || 0,
      bank_savings_history: user.bank_savings_history || [],
      savings_pin: user.savings_pin || '1234',
      rollover_enabled: user.rollover_enabled,
      budget_enabled: user.budget_enabled !== undefined ? user.budget_enabled : 1,
      onboarding_completed: user.onboarding_completed,
      created_at: user.created_at
    };

    res.json({
      message: 'Logged in successfully!',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in. Please try again.' });
  }
}

export async function getMe(req, res) {
  try {
    const user = await db.prepare(`
      SELECT id, name, email, currency, monthly_income, salary_day, bank_savings, savings_pin, rollover_enabled, budget_enabled, onboarding_completed, created_at 
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.salary_day === undefined) user.salary_day = 1;
    if (user.savings_pin === undefined) user.savings_pin = '1234';

    // Include history
    const fullUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    user.bank_savings_history = fullUser?.bank_savings_history || [];

    res.json({ user });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ error: 'Failed to fetch user details.' });
  }
}

export async function completeOnboarding(req, res) {
  try {
    const userId = req.user.id;
    const { monthly_income, salary_day, categories, goal, bank_savings, savings_pin } = req.body;

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const sDay = salary_day !== undefined && salary_day !== null && Number(salary_day) >= 1 ? Number(salary_day) : 1;

    await db.transaction(async () => {
      // Update monthly income, salary day and mark onboarding completed
      if (monthly_income !== undefined && monthly_income !== null) {
        await db.prepare('UPDATE users SET monthly_income = ?, salary_day = ?, onboarding_completed = 1 WHERE id = ?').run(Number(monthly_income) || 0, sDay, userId);
      } else {
        await db.prepare('UPDATE users SET salary_day = ?, onboarding_completed = 1 WHERE id = ?').run(sDay, userId);
      }

      if (bank_savings !== undefined && bank_savings !== null && Number(bank_savings) >= 0) {
        await db.prepare('UPDATE users SET bank_savings = ? WHERE id = ?').run(Number(bank_savings), userId);
      }

      if (savings_pin !== undefined && savings_pin !== null) {
        await db.prepare('UPDATE users SET savings_pin = ? WHERE id = ?').run(String(savings_pin), userId);
      }

      // Record initial income transaction if income > 0
      if (Number(monthly_income) > 0) {
        await db.prepare(`
          INSERT INTO transactions (user_id, type, category, amount, description, date)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, 'income', 'Salary', Number(monthly_income), 'Monthly Salary Income', now.toISOString().split('T')[0]);
      }

      // Add category budgets if provided
      if (Array.isArray(categories)) {
        const stmt = await db.prepare(`
          INSERT INTO budgets (user_id, category, allocated_amount, period_month, period_year)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, category, period_month, period_year) 
          DO UPDATE SET allocated_amount = excluded.allocated_amount
        `);

        for (const cat of categories) {
          if (cat.category && Number(cat.amount) > 0) {
            await stmt.run(userId, cat.category, Number(cat.amount), month, year);
          }
        }
      }

      // Add savings goal if provided
      if (goal && goal.name && Number(goal.target_amount) > 0) {
        const initialSaved = Number(goal.initial_deposit) || 0;
        const goalResult = await db.prepare(`
          INSERT INTO savings_goals (user_id, name, target_amount, current_saved, target_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(userId, goal.name, Number(goal.target_amount), initialSaved, goal.target_date || null);

        if (initialSaved > 0) {
          await db.prepare(`
            INSERT INTO transactions (user_id, type, category, amount, description, date, goal_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(userId, 'savings_deposit', 'Savings', initialSaved, `Initial deposit for ${goal.name}`, now.toISOString().split('T')[0], goalResult.lastInsertRowid);
        }
      }
    })();

    const updatedUser = await db.prepare(`
      SELECT id, name, email, currency, monthly_income, salary_day, bank_savings, savings_pin, rollover_enabled, budget_enabled, onboarding_completed, created_at 
      FROM users WHERE id = ?
    `).get(userId);

    res.json({ message: 'Onboarding completed!', user: updatedUser });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Failed to save onboarding configuration.' });
  }
}

export async function updateSettings(req, res) {
  try {
    const userId = req.user.id;
    const { name, currency, monthly_income, salary_day, rollover_enabled, budget_enabled, bank_savings, savings_pin } = req.body;

    await db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          currency = COALESCE(?, currency),
          monthly_income = COALESCE(?, monthly_income),
          salary_day = COALESCE(?, salary_day),
          rollover_enabled = COALESCE(?, rollover_enabled),
          budget_enabled = COALESCE(?, budget_enabled),
          bank_savings = COALESCE(?, bank_savings),
          savings_pin = COALESCE(?, savings_pin)
      WHERE id = ?
    `).run(
      name || null, 
      currency || null, 
      monthly_income !== undefined && monthly_income !== null ? Number(monthly_income) : null, 
      salary_day !== undefined && salary_day !== null ? Number(salary_day) : null,
      rollover_enabled !== undefined && rollover_enabled !== null ? (rollover_enabled ? 1 : 0) : null,
      budget_enabled !== undefined && budget_enabled !== null ? (budget_enabled ? 1 : 0) : null,
      bank_savings !== undefined && bank_savings !== null ? Number(bank_savings) : null,
      savings_pin !== undefined && savings_pin !== null ? String(savings_pin) : null,
      userId
    );

    const user = await db.prepare(`
      SELECT id, name, email, currency, monthly_income, salary_day, bank_savings, savings_pin, rollover_enabled, budget_enabled, onboarding_completed, created_at 
      FROM users WHERE id = ?
    `).get(userId);

    const fullUser = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    user.bank_savings_history = fullUser?.bank_savings_history || [];

    res.json({ message: 'Settings updated successfully!', user });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
}
