import db from '../db/db.js';

export async function getBills(req, res) {
  try {
    const userId = req.user.id;
    const bills = await db.prepare('SELECT * FROM recurring_bills WHERE user_id = ?').all(userId);

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const enrichedBills = bills.map(b => {
      const isPaidThisMonth = b.last_paid_date && b.last_paid_date.startsWith(currentMonthStr);
      let status = 'upcoming';

      if (isPaidThisMonth) {
        status = 'paid';
      } else if (currentDay === b.due_day) {
        status = 'due_today';
      } else if (currentDay > b.due_day) {
        status = 'overdue';
      }

      return {
        ...b,
        isPaidThisMonth,
        status,
        dueMessage: status === 'paid' ? 'Paid for this month ✓' :
                    status === 'due_today' ? `🔔 ${b.name} is due today — ₹${b.amount}` :
                    status === 'overdue' ? `⚠️ ${b.name} was due on the ${b.due_day}th — ₹${b.amount}` :
                    `⏰ ${b.name} is due on the ${b.due_day}th — ₹${b.amount}`
      };
    });

    res.json({ bills: enrichedBills });
  } catch (err) {
    console.error('getBills error:', err);
    res.status(500).json({ error: 'Failed to fetch recurring bills.' });
  }
}

export async function createBill(req, res) {
  try {
    const userId = req.user.id;
    const { name, amount, category = 'Bills', frequency = 'monthly', due_day } = req.body;

    if (!name || !name.trim() || !amount || isNaN(amount) || Number(amount) <= 0 || !due_day || isNaN(due_day)) {
      return res.status(400).json({ error: 'Bill name, valid amount, and due day of month (1-31) are required.' });
    }

    const dueDayNum = Math.min(31, Math.max(1, Number(due_day)));

    const result = await db.prepare(`
      INSERT INTO recurring_bills (user_id, name, amount, category, frequency, due_day)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name.trim(), Number(amount), category, frequency, dueDayNum);

    const bill = await db.prepare('SELECT * FROM recurring_bills WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Recurring bill created!', bill });
  } catch (err) {
    console.error('createBill error:', err);
    res.status(500).json({ error: 'Failed to create recurring bill.' });
  }
}

export async function markAsPaid(req, res) {
  try {
    const userId = req.user.id;
    const billId = req.params.id;

    const bill = await db.prepare('SELECT * FROM recurring_bills WHERE id = ? AND user_id = ?').get(billId, userId);
    if (!bill) {
      return res.status(404).json({ error: 'Recurring bill not found.' });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (bill.last_paid_date && bill.last_paid_date.startsWith(currentMonthStr)) {
      return res.status(400).json({ error: `${bill.name} has already been marked as paid for this month.` });
    }

    let txId;
    await db.transaction(async () => {
      // 1. Mark bill as paid
      await db.prepare('UPDATE recurring_bills SET last_paid_date = ? WHERE id = ?').run(todayStr, billId);

      // 2. Insert expense transaction automatically
      const result = await db.prepare(`
        INSERT INTO transactions (user_id, type, category, amount, description, date, merchant)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, 'expense', bill.category || 'Bills', bill.amount, `${bill.name} Payment`, todayStr, bill.name);

      txId = result.lastInsertRowid;
    })();

    const updatedBill = await db.prepare('SELECT * FROM recurring_bills WHERE id = ?').get(billId);
    const createdTx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);

    res.json({
      message: `✅ ${bill.name} (₹${bill.amount}) marked as paid!`,
      bill: updatedBill,
      transaction: createdTx
    });
  } catch (err) {
    console.error('markAsPaid error:', err);
    res.status(500).json({ error: 'Failed to mark recurring bill as paid.' });
  }
}

export async function updateBill(req, res) {
  try {
    const userId = req.user.id;
    const billId = req.params.id;
    const { name, amount, category, frequency, due_day } = req.body;

    const bill = await db.prepare('SELECT * FROM recurring_bills WHERE id = ? AND user_id = ?').get(billId, userId);
    if (!bill) {
      return res.status(404).json({ error: 'Recurring bill not found.' });
    }

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Paid Bill Editing Restriction:
    // If the bill was paid during the current month, editing is strictly disabled.
    if (bill.last_paid_date && bill.last_paid_date.startsWith(currentMonthStr)) {
      return res.status(400).json({ 
        error: `Paid bills cannot be edited during the same month. This bill will automatically become editable next month.` 
      });
    }

    if (!name || !name.trim() || !amount || isNaN(amount) || Number(amount) <= 0 || !due_day || isNaN(due_day)) {
      return res.status(400).json({ error: 'Valid bill name, amount (>0), and due day (1-31) are required.' });
    }

    const dueDayNum = Math.min(31, Math.max(1, Number(due_day)));

    await db.prepare(`
      UPDATE recurring_bills 
      SET name = ?, amount = ?, category = ?, frequency = ?, due_day = ? 
      WHERE id = ? AND user_id = ?
    `).run(name.trim(), Number(amount), category || bill.category || 'Bills', frequency || bill.frequency || 'monthly', dueDayNum, billId, userId);

    const updatedBill = await db.prepare('SELECT * FROM recurring_bills WHERE id = ?').get(billId);

    res.json({ message: 'Recurring bill updated successfully!', bill: updatedBill });
  } catch (err) {
    console.error('updateBill error:', err);
    res.status(500).json({ error: 'Failed to update recurring bill.' });
  }
}

export async function deleteBill(req, res) {
  try {
    const userId = req.user.id;
    const billId = req.params.id;

    await db.prepare('DELETE FROM recurring_bills WHERE id = ? AND user_id = ?').run(billId, userId);
    res.json({ message: 'Recurring bill deleted.' });
  } catch (err) {
    console.error('deleteBill error:', err);
    res.status(500).json({ error: 'Failed to delete recurring bill.' });
  }
}
