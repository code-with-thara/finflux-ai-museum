import db from '../db/db.js';

// Standard budget categories for classification
const CATEGORIES = [
  'House Rent',
  'Food & Groceries',
  'Snacks & Drinks',
  'Transport',
  'Electricity',
  'Mobile & Internet',
  'EMI',
  'Entertainment',
  'Shopping',
  'Education',
  'Health',
  'Salary',
  'Investment',
  'Other'
];

/**
 * Parses natural language input for transaction extraction.
 */
export async function parseTransactionInput(input, user) {
  // 1. Check high-confidence rule-based parser FIRST so deterministic rules (savings, goals, bills, budgets, categories) always work accurately!
  const ruleResult = ruleBasedTransactionParser(input, user);
  if (ruleResult && ruleResult.confidence >= 0.7) {
    return ruleResult;
  }

  const apiKey = process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL || 'google/gemma-4-31b-it:free';
  const provider = process.env.LLM_PROVIDER || (apiKey?.startsWith('sk-or-') ? 'openrouter' : 'google');

  if (apiKey && apiKey.trim().length > 0) {
    try {
      if (provider === 'openrouter' || apiKey.startsWith('sk-or-')) {
        return await callOpenRouterForTransaction(input, user, apiKey, modelName);
      } else {
        return await callGeminiForTransaction(input, user, apiKey, modelName);
      }
    } catch (err) {
      console.warn('LLM API call failed, falling back to rule-based parser:', err.message);
    }
  }

  // Pure rule-based / heuristic NLP parser fallback
  return ruleResult;
}

/**
 * Standardized heuristic parser when LLM API key is absent or pending
 */
function ruleBasedTransactionParser(input, user) {
  const text = input.trim();
  const lower = text.toLowerCase();

  // Extract amount using regex (supports ₹, Rs, RS, rupees, or raw numbers)
  const amountMatch = lower.match(/(?:(?:rs\.?|inr|₹|rupees?)\s*)?(\d+(?:,\d+)*(?:\.\d{1,2})?)(?:\s*(?:rupees?|rs\.?|inr|bucks))?/i) || lower.match(/(\d+)/);
  let amount = null;
  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // 1. Detect INTENT: savings_goal, create_budget, recurring_bill, bank_savings_deposit, income, or expense

  // A. Bank Savings Deposit Intent (e.g. "300 for savings", "savings 300", "saving 500", "save 300", "300 to savings")
  if (/\b(savings|saving|save|deposit|reserve)\b/i.test(lower) && !lower.includes('goal') && !lower.includes('bill') && !lower.includes('spent') && !lower.includes('paid') && !lower.includes('bought') && !lower.includes('budget')) {
    return {
      intent: 'bank_savings_deposit',
      type: 'savings_deposit',
      amount: amount || 0,
      category: 'Savings',
      description: 'Deposit to Bank Savings',
      date: new Date().toISOString().split('T')[0],
      confidence: amount ? 0.95 : 0.6
    };
  }

  // B. Savings Goal Intent (e.g. "900 for gold", "save 900 for laptop", "goal 900 for bike", "set goal 50000 for car")
  const goalMatch = lower.match(/(?:save|saving|goal|target|need)?\s*(?:for|of)?\s*(\d+(?:,\d+)*)\s*(?:for|on|towards?|to)?\s*([a-z0-9\s]+)/i) || lower.match(/(\d+(?:,\d+)*)\s*for\s*([a-z0-9\s]+)/i);
  if (lower.includes('goal') || lower.includes('saving for') || lower.includes('save for') || (goalMatch && /\b(gold|laptop|car|bike|trip|house|home|jewel|jewellery|phone|iphone|wedding|vacation)\b/i.test(lower))) {
    let goalName = 'Savings Goal';
    const specificMatch = lower.match(/(?:for|on|target|goal)\s+([a-zA-Z\s]{2,20})/i);
    if (specificMatch && specificMatch[1]) {
      goalName = specificMatch[1].replace(/(?:goal|target|budget|saving|savings|the|a)\s*/gi, '').trim();
    }
    if (!goalName || goalName.length < 2) {
      if (lower.includes('gold')) goalName = 'Gold';
      else if (lower.includes('laptop')) goalName = 'Laptop';
      else if (lower.includes('car')) goalName = 'Car';
      else if (lower.includes('bike')) goalName = 'Bike';
      else if (lower.includes('phone') || lower.includes('iphone')) goalName = 'Phone';
      else goalName = 'Savings Goal';
    }
    goalName = goalName.charAt(0).toUpperCase() + goalName.slice(1);

    return {
      intent: 'create_goal',
      type: 'goal',
      goalName,
      targetAmount: amount || 5000,
      initialDeposit: 0,
      description: `Savings goal for ${goalName}`,
      confidence: amount ? 0.95 : 0.7
    };
  }

  // C. Category Budget Intent (e.g. "1000 for food budget", "set budget 2000 for snacks", "500 budget for groceries")
  if (lower.includes('budget')) {
    let matchedCategory = 'Other Expense';
    if (/\b(snack|snacks|tea|coffee|chai)\b/i.test(lower)) matchedCategory = 'Snacks';
    else if (/\b(food|lunch|dinner|restaurant)\b/i.test(lower)) matchedCategory = 'Food';
    else if (/\b(grocery|groceries|veggies)\b/i.test(lower)) matchedCategory = 'Groceries';
    else if (/\b(rent|house rent)\b/i.test(lower)) matchedCategory = 'House Rent';
    else if (/\b(transport|petrol|fuel)\b/i.test(lower)) matchedCategory = 'Transport';
    else if (/\b(electricity|eb bill)\b/i.test(lower)) matchedCategory = 'Electricity';
    else if (/\b(mobile|recharge|wifi)\b/i.test(lower)) matchedCategory = 'Mobile Recharge';
    else if (/\b(shopping|clothes)\b/i.test(lower)) matchedCategory = 'Shopping';

    return {
      intent: 'create_budget',
      type: 'budget',
      category: matchedCategory,
      amount: amount || 1000,
      description: `Monthly budget limit for ${matchedCategory}`,
      confidence: amount ? 0.95 : 0.7
    };
  }

  // D. Recurring Bill Intent (e.g. "1500 for electricity bill", "500 for wifi bill", "add bill wifi 500")
  if (lower.includes('bill')) {
    let dueDayMatch = lower.match(/(?:due\s*(?:on)?|day)\s*(\d{1,2})/i);
    let dueDay = dueDayMatch ? Math.min(31, Math.max(1, parseInt(dueDayMatch[1]))) : 5;

    let billName = text
      .replace(/(?:add|set|create|new|bill|due|on|day|\d{1,2}th|\d{1,2}st|\d{1,2}nd|\d{1,2}rd)\s*/gi, '')
      .replace(/(?:rs\.?|inr|₹|rupees?)\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi, '')
      .replace(/\d+(?:,\d+)*(?:\.\d{1,2})?\s*(?:rupees?|rs\.?|inr|bucks)?/gi, '')
      .trim();

    if (!billName || billName.length < 2) billName = 'Utility Bill';
    else billName = billName.charAt(0).toUpperCase() + billName.slice(1);

    return {
      intent: 'create_bill',
      type: 'bill',
      billName,
      amount: amount || 500,
      dueDay,
      category: lower.includes('electricity') ? 'Electricity' : lower.includes('wifi') || lower.includes('internet') ? 'Mobile Recharge' : 'Other Expense',
      confidence: amount ? 0.95 : 0.7
    };
  }

  // D. Income Intent
  if (lower.includes('salary') || lower.includes('received') || lower.includes('got income') || lower.includes('earned') || lower.includes('freelance') || lower.includes('cashback') || lower.includes('bonus')) {
    return {
      intent: 'create_transaction',
      type: 'income',
      amount: amount || 0,
      category: lower.includes('bonus') ? 'Bonus' : lower.includes('freelance') ? 'Freelance' : 'Salary',
      description: lower.includes('salary') ? 'Monthly Salary Income' : 'Income Received',
      date: new Date().toISOString().split('T')[0],
      confidence: amount ? 0.95 : 0.6
    };
  }

  // E. Standard Expense Intent
  if (!amount || isNaN(amount) || amount <= 0) {
    return {
      intent: 'unknown',
      type: 'expense',
      amount: null,
      category: 'Other Expense',
      description: text,
      date: new Date().toISOString().split('T')[0],
      confidence: 0.2,
      requires_clarification: true,
      clarification_prompt: `I couldn't detect the amount. How much did you spend or earn?`
    };
  }

  // Detect category keywords matching default categories
  let category = 'Other Expense';

  if (/\b(tea|chai|coffee|snack|snacks|biscuit|biscuits|samosa|juice|bakery|ice cream|vada|dosa|maggi|chips|cold drink)\b/i.test(lower)) {
    category = 'Snacks';
  } else if (/\b(rent|house rent|room rent|flat rent|pg rent|hostel)\b/i.test(lower)) {
    category = 'House Rent';
  } else if (/\b(emi|loan|credit card|card bill|installment)\b/i.test(lower)) {
    category = 'EMI';
  } else if (/\b(grocery|groceries|vegetables|veggies|fruits|milk|rice|dal|oil|supermarket|mart|kirana|provision)\b/i.test(lower)) {
    category = 'Groceries';
  } else if (/\b(food|lunch|dinner|breakfast|swiggy|zomato|restaurant|hotel|pizza|burger|biryani|meal)\b/i.test(lower)) {
    category = 'Food';
  } else if (/\b(petrol|diesel|fuel|transport|travel|cab|uber|ola|auto|taxi|bus|train|metro|toll|parking)\b/i.test(lower)) {
    category = 'Transport';
  } else if (/\b(electricity|current bill|power bill|eb bill|electric)\b/i.test(lower)) {
    category = 'Electricity';
  } else if (/\b(mobile|recharge|wifi|internet|broadband|phone bill|sim|airtel|jio|vi)\b/i.test(lower)) {
    category = 'Mobile Recharge';
  } else if (/\b(movie|cinema|theatre|theater|netflix|prime|hotstar|spotify|game|party|outing)\b/i.test(lower)) {
    category = 'Entertainment';
  } else if (/\b(shopping|clothes|dress|shirt|pants|shoes|amazon|flipkart|myntra|gadget|mall)\b/i.test(lower)) {
    category = 'Shopping';
  } else if (/\b(education|school|college|tuition|books|stationery|course|udemy|fees)\b/i.test(lower)) {
    category = 'Education';
  } else if (/\b(health|doctor|hospital|medicine|pharmacy|medical|clinic|dentist|tablet)\b/i.test(lower)) {
    category = 'Health';
  } else if (/\b(policy|insurance|lic|term plan|health insurance|life insurance|premium)\b/i.test(lower)) {
    category = 'Policy Plans';
  }

  let description = text
    .replace(/(?:spent|paid|add|record|bought|buy)\s*/gi, '')
    .replace(/(?:rs\.?|inr|₹|rupees?)\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi, '')
    .replace(/\d+(?:,\d+)*(?:\.\d{1,2})?\s*(?:rupees?|rs\.?|inr|bucks)?/gi, '')
    .replace(/\b(?:for|on|in|to)\b/gi, '')
    .trim();

  if (!description || description.length < 2) {
    description = category;
  } else {
    description = description.charAt(0).toUpperCase() + description.slice(1);
  }

  return {
    intent: 'create_transaction',
    type: 'expense',
    amount,
    category,
    description,
    date: new Date().toISOString().split('T')[0],
    confidence: 0.95
  };
}

/**
 * Call OpenRouter API for structured transaction parsing
 */
async function callOpenRouterForTransaction(input, user, apiKey, modelName) {
  const prompt = `
You are a financial AI parsing structured transaction details.
User input: "${input}"
User currency: ${user?.currency || '₹'}
Today date: ${new Date().toISOString().split('T')[0]}

Categories available:
- House Rent
- Food & Groceries
- Snacks & Drinks
- Transport
- Electricity
- Mobile & Internet
- EMI
- Entertainment
- Shopping
- Education
- Health
- Salary
- Other

Return ONLY a valid JSON object matching this schema without markdown or extra text:
{
  "intent": "create_transaction",
  "type": "expense" or "income",
  "amount": 250,
  "category": "one of available categories",
  "description": "short clear description",
  "date": "YYYY-MM-DD",
  "confidence": 0.95,
  "requires_clarification": false,
  "clarification_prompt": null
}
`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5000',
      'X-Title': 'SmartBudget AI'
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: 'You extract structured JSON for personal financial tracking.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const textResp = json.choices?.[0]?.message?.content || '';
  const cleanJsonStr = textResp.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJsonStr);
}

/**
 * Call Google Gemini REST API for transaction parsing when Gemini API key is provided
 */
async function callGeminiForTransaction(input, user, apiKey, modelName) {
  const prompt = `
You are a financial AI parsing structured transaction details.
User input: "${input}"
User currency: ${user?.currency || '₹'}
Today date: ${new Date().toISOString().split('T')[0]}

Categories available:
- House Rent
- Food & Groceries
- Snacks & Drinks
- Transport
- Electricity
- Mobile & Internet
- EMI
- Entertainment
- Shopping
- Education
- Health
- Salary
- Other

Return ONLY a valid JSON object matching this schema without markdown:
{
  "intent": "create_transaction",
  "type": "expense" or "income",
  "amount": number,
  "category": "one of available categories",
  "description": "short clear description",
  "date": "YYYY-MM-DD",
  "confidence": number between 0 and 1,
  "requires_clarification": boolean,
  "clarification_prompt": string or null
}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini LLM API returned ${response.status}`);
  }

  const json = await response.json();
  const textResp = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleanJsonStr = textResp.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJsonStr);
}

/**
 * Process financial assistant chat message with data grounding
 */
/**
 * Process financial assistant chat message with data grounding
 */
export async function processFinancialChat(userMessage, userId, history = []) {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const currency = user?.currency || '₹';

  // Fetch actual data context from database
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  
  const transactions = await db.prepare(`
    SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 50
  `).all(userId);

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

  const goals = await db.prepare(`
    SELECT * FROM savings_goals WHERE user_id = ?
  `).all(userId);

  const bills = await db.prepare(`
    SELECT * FROM recurring_bills WHERE user_id = ?
  `).all(userId);

  const totalIncomeRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'income'").get(userId) || {};
  const totalExpenseRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'expense'").get(userId) || {};
  const totalSavedRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'savings_deposit'").get(userId) || {};

  const totalIncome = Number(totalIncomeRow.total || 0);
  const totalExpense = Number(totalExpenseRow.total || 0);
  const totalSaved = Number(totalSavedRow.total || 0);
  const availableBalance = totalIncome - totalExpense - totalSaved;

  const thisMonthExpenses = await db.prepare(`
    SELECT category, SUM(amount) as spent FROM transactions 
    WHERE user_id = ? AND type = 'expense' AND date LIKE ?
    GROUP BY category
  `).all(userId, `${currentMonthStr}%`);

  const thisMonthTotalSpent = thisMonthExpenses.reduce((sum, e) => sum + Number(e.spent), 0);
  const totalBudgetAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0);
  const remainingBudget = totalBudgetAllocated - thisMonthTotalSpent;

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const currentDay = now.getDate();
  const daysLeft = Math.max(1, daysInMonth - currentDay);
  const dailySpendAllowance = remainingBudget > 0 ? Math.round(remainingBudget / daysLeft) : 0;

  const dataContext = {
    user,
    currency,
    availableBalance,
    totalIncome,
    totalExpense,
    totalSaved,
    thisMonthTotalSpent,
    totalBudgetAllocated,
    remainingBudget,
    daysLeft,
    dailySpendAllowance,
    budgetEnabled: user?.budget_enabled !== 0,
    budgets,
    goals,
    bills,
    thisMonthExpenses,
    recentTransactions: transactions.slice(0, 10)
  };

  const apiKey = process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL || 'google/gemma-4-31b-it:free';
  const provider = process.env.LLM_PROVIDER || (apiKey?.startsWith('sk-or-') ? 'openrouter' : 'google');

  if (apiKey && apiKey.trim().length > 0) {
    try {
      if (provider === 'openrouter' || apiKey.startsWith('sk-or-')) {
        return await callOpenRouterForChat(userMessage, dataContext, apiKey, modelName);
      } else {
        return await callGeminiForChat(userMessage, dataContext, apiKey, modelName);
      }
    } catch (err) {
      console.warn('LLM chat call failed, seamlessly falling back to high-precision grounded analysis:', err.message);
    }
  }

  // Data-grounded rule engine fallback for chat queries
  return groundedChatResponse(userMessage, dataContext);
}

function groundedChatResponse(message, context) {
  const lower = message.toLowerCase();
  const c = context.currency;

  // 1. Remaining budget questions & explanation
  if (lower.includes('budget') && (lower.includes('left') || lower.includes('remaining') || lower.includes('explain') || lower.includes('how much') || lower.includes('status'))) {
    if (!context.budgetEnabled) {
      return `Budget tracking is currently inactive. You have ${context.budgets.length} category allocations totaling ${c}${context.totalBudgetAllocated.toLocaleString()}. You can enable active budget tracking in the Budget or Settings tab.`;
    }
    if (context.totalBudgetAllocated === 0) {
      return `You haven't set up your monthly budget allocation yet. Go to the Budget tab to set spending limits for categories like Food, Rent, Transport, etc.`;
    }

    const pct = Math.round((context.thisMonthTotalSpent / context.totalBudgetAllocated) * 100);
    if (context.remainingBudget <= 0) {
      return `🔴 Budget Target Reached – You have reached and exceeded your allocated budget for this month. Total Budget: ${c}${context.totalBudgetAllocated.toLocaleString()} | Total Spent: ${c}${context.thisMonthTotalSpent.toLocaleString()} (Exceeded by ${c}${Math.abs(context.remainingBudget).toLocaleString()}). Consider pausing discretionary spending for the remaining ${context.daysLeft} days.`;
    }

    return `📊 Here is your remaining budget breakdown:\n• Allocated Monthly Budget: ${c}${context.totalBudgetAllocated.toLocaleString()}\n• Spent So Far: ${c}${context.thisMonthTotalSpent.toLocaleString()} (${pct}% used)\n• Remaining Budget: ${c}${context.remainingBudget.toLocaleString()}\n• Recommended Daily Allowance: ~${c}${context.dailySpendAllowance.toLocaleString()}/day for the remaining ${context.daysLeft} days of the month.`;
  }

  // 2. Spending in specific categories or general spending
  if (lower.includes('spend') || lower.includes('spent') || lower.includes('expense') || lower.includes('cost')) {
    // Check specific categories
    for (const cat of ['food', 'groceries', 'snack', 'snacks', 'transport', 'petrol', 'rent', 'electricity', 'mobile', 'emi', 'entertainment', 'shopping', 'education', 'health']) {
      if (lower.includes(cat)) {
        const match = context.thisMonthExpenses.find(e => e.category.toLowerCase().includes(cat));
        const spent = match ? match.spent : 0;
        const bMatch = context.budgets.find(b => b.category.toLowerCase().includes(cat));
        const allocated = bMatch ? bMatch.allocated_amount : null;

        if (allocated !== null) {
          const rem = allocated - spent;
          return `You have spent ${c}${spent.toLocaleString()} on ${match ? match.category : cat} this month out of your allocated ${c}${allocated.toLocaleString()} budget (${rem >= 0 ? `${c}${rem.toLocaleString()} remaining` : `exceeded by ${c}${Math.abs(rem).toLocaleString()}`}).`;
        }
        return `You have spent ${c}${spent.toLocaleString()} on ${match ? match.category : cat} this month.`;
      }
    }

    if (lower.includes('highest') || lower.includes('most') || lower.includes('top')) {
      const highest = [...context.thisMonthExpenses].sort((a, b) => b.spent - a.spent)[0];
      if (highest) {
        return `Your highest spending category this month is **${highest.category}** at ${c}${highest.spent.toLocaleString()} (${Math.round((highest.spent / (context.thisMonthTotalSpent || 1)) * 100)}% of your monthly expenses).`;
      }
      return `You haven't recorded any expenses yet this month.`;
    }

    return `This month, you have spent a total of ${c}${context.thisMonthTotalSpent.toLocaleString()} across ${context.thisMonthExpenses.length} categories. Total all-time expenditure recorded is ${c}${context.totalExpense.toLocaleString()}.`;
  }

  // 3. Suggestions on ways to stay within budget / reduce spending
  if (lower.includes('reduce') || lower.includes('cut') || lower.includes('save money') || lower.includes('stay within') || lower.includes('suggestion') || lower.includes('tip') || lower.includes('advice')) {
    const highCats = context.thisMonthExpenses
      .map(e => {
        const b = context.budgets.find(bg => bg.category === e.category);
        const allocated = b ? b.allocated_amount : 0;
        const pct = allocated > 0 ? (e.spent / allocated) * 100 : 0;
        return { category: e.category, spent: e.spent, allocated, pct };
      })
      .filter(item => item.pct >= 80 || item.spent > 3000)
      .sort((a, b) => b.pct - a.pct);

    if (highCats.length > 0) {
      const topIssue = highCats[0];
      return `💡 Personalized Budget Suggestions:\n1. Your highest pressure category is **${topIssue.category}** (${c}${topIssue.spent.toLocaleString()} spent${topIssue.allocated > 0 ? `, reaching ${Math.round(topIssue.pct)}% of budget` : ''}). Reducing non-essential purchases here will save the most money.\n2. Keep your daily spending under ~${c}${context.dailySpendAllowance.toLocaleString()} for the next ${context.daysLeft} days to stay comfortably within your remaining ${c}${context.remainingBudget.toLocaleString()} budget.\n3. Check your upcoming bills in the Bills tab to make sure funds are reserved.`;
    }

    return `💡 To stay well within your budget:\n• Your current daily recommended spending limit is ~${c}${context.dailySpendAllowance.toLocaleString()}/day.\n• Record expenses instantly via voice or chat so nothing slips through.\n• You currently have ${c}${context.remainingBudget.toLocaleString()} left in your allocated budget.`;
  }

  // 4. "Can I spend ₹X?" queries
  const canSpendMatch = lower.match(/can i spend\s*(?:₹|rs\.?)?\s*(\d+(?:,\d+)*)/i) || lower.match(/spend\s*(?:₹|rs\.?)?\s*(\d+(?:,\d+)*)/i);
  if (canSpendMatch && canSpendMatch[1]) {
    const askAmt = parseFloat(canSpendMatch[1].replace(/,/g, ''));
    if (!isNaN(askAmt) && askAmt > 0) {
      if (askAmt > context.availableBalance) {
        return `⚠️ Not Recommended: Spending ${c}${askAmt.toLocaleString()} exceeds your current available balance (${c}${context.availableBalance.toLocaleString()}).`;
      }
      if (context.budgetEnabled && askAmt > context.remainingBudget) {
        return `⚠️ Caution: You have ${c}${context.remainingBudget.toLocaleString()} remaining in your monthly budget. Spending ${c}${askAmt.toLocaleString()} will cause you to exceed your budget by ${c}${(askAmt - context.remainingBudget).toLocaleString()}.`;
      }
      return `✅ Yes! You have ${c}${context.availableBalance.toLocaleString()} available balance and ${c}${context.remainingBudget.toLocaleString()} remaining budget for this month. Spending ${c}${askAmt.toLocaleString()} leaves you with ${c}${(context.remainingBudget - askAmt).toLocaleString()} budget.`;
    }
  }

  // 5. Savings goals queries
  if (lower.includes('saved') || lower.includes('savings') || lower.includes('goal')) {
    if (context.goals.length > 0) {
      const gList = context.goals.map(g => {
        const pct = g.target_amount > 0 ? Math.round((g.current_saved / g.target_amount) * 100) : 0;
        return `• **${g.name}**: ${c}${g.current_saved.toLocaleString()} / ${c}${g.target_amount.toLocaleString()} (${pct}% reached)`;
      }).join('\n');
      return `🎯 Your Savings Goals Progress (Total Saved: ${c}${context.totalSaved.toLocaleString()}):\n${gList}`;
    }
    return `You have saved ${c}${context.totalSaved.toLocaleString()} so far. You haven't created any savings goals yet. Create one in the Goals tab to track specific targets!`;
  }

  // 6. Available Balance & Income queries
  if (lower.includes('balance') || lower.includes('income') || lower.includes('salary') || lower.includes('how much money do i have')) {
    const userIncome = context.user?.monthly_income || 0;
    return `💰 Financial Balance Summary:\n• Available Bank Balance: ${c}${context.availableBalance.toLocaleString()}\n• Monthly Income Setting: ${userIncome > 0 ? `${c}${userIncome.toLocaleString()}` : 'Not specified'}\n• Recorded Income: ${c}${context.totalIncome.toLocaleString()}\n• Recorded Expenses: ${c}${context.totalExpense.toLocaleString()}\n• Transferred to Savings: ${c}${context.totalSaved.toLocaleString()}`;
  }

  // 7. General overview
  return `Hello ${context.user?.name || 'there'}! Here is a quick snapshot of your real numbers:\n• Available Balance: ${c}${context.availableBalance.toLocaleString()}\n• Monthly Budget: ${c}${context.totalBudgetAllocated.toLocaleString()} (${c}${context.thisMonthTotalSpent.toLocaleString()} spent, ${c}${context.remainingBudget.toLocaleString()} left)\n• Total Saved: ${c}${context.totalSaved.toLocaleString()}\n\nHow can I assist you with your spending or budget planning today?`;
}

async function callOpenRouterForChat(message, context, apiKey, modelName) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const systemPrompt = `
You are SmartBudget AI, a friendly, concise personal financial assistant.
Answer the user's question using ONLY their real financial records provided below.
Do NOT invent fake figures or make unverified assumptions.

User Financial Context:
- User Name: ${context.user?.name || 'User'}
- Currency: ${context.currency}
- Available Balance: ${context.currency}${context.availableBalance}
- Monthly Income: ${context.currency}${context.user?.monthly_income || context.totalIncome}
- Total Recorded Income: ${context.currency}${context.totalIncome}
- Total Spent This Month: ${context.currency}${context.thisMonthTotalSpent}
- Total Allocated Budget: ${context.currency}${context.totalBudgetAllocated}
- Remaining Budget: ${context.currency}${context.remainingBudget}
- Budget Tracking Enabled: ${context.budgetEnabled ? 'Yes' : 'No'}
- Daily Recommended Spend Allowance: ${context.currency}${context.dailySpendAllowance}/day (${context.daysLeft} days remaining)
- Category Budgets: ${JSON.stringify(context.budgets)}
- Category Spending This Month: ${JSON.stringify(context.thisMonthExpenses)}
- Savings Goals: ${JSON.stringify(context.goals)}
- Recurring Bills: ${JSON.stringify(context.bills)}
- Recent Transactions: ${JSON.stringify(context.recentTransactions)}

Provide warm, clear, actionable, and mathematically exact answers based on these real numbers.
`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5000',
        'X-Title': 'SmartBudget AI'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter Chat API status ${response.status}`);
    }

    const json = await response.json();
    const reply = json.choices?.[0]?.message?.content;
    if (reply && reply.trim()) return reply.trim();
    throw new Error('Empty reply from OpenRouter');
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function callGeminiForChat(message, context, apiKey, modelName) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const systemPrompt = `
You are SmartBudget AI, a friendly, concise, financial assistant.
Answer the user's question using ONLY their real financial context provided below.
Do NOT invent fake transactions or figures.

User Context:
- User Name: ${context.user?.name || 'User'}
- Currency: ${context.currency}
- Available Balance: ${context.currency}${context.availableBalance}
- Monthly Income: ${context.currency}${context.user?.monthly_income || context.totalIncome}
- Total Spent This Month: ${context.currency}${context.thisMonthTotalSpent}
- Total Allocated Budget: ${context.currency}${context.totalBudgetAllocated}
- Remaining Budget: ${context.currency}${context.remainingBudget}
- Budget Tracking Enabled: ${context.budgetEnabled ? 'Yes' : 'No'}
- Daily Recommended Spend Allowance: ${context.currency}${context.dailySpendAllowance}/day (${context.daysLeft} days remaining)
- Category Budgets: ${JSON.stringify(context.budgets)}
- Category Spending This Month: ${JSON.stringify(context.thisMonthExpenses)}
- Savings Goals: ${JSON.stringify(context.goals)}
- Recent Transactions: ${JSON.stringify(context.recentTransactions)}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: `${systemPrompt}\nUser Question: "${message}"` }] }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gemini LLM API returned ${response.status}`);
    }

    const json = await response.json();
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (reply && reply.trim()) return reply.trim();
    throw new Error('Empty reply from Gemini');
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}
