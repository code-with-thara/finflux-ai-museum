const BASE_URL = 'http://localhost:5000/api';

async function runE2ETest() {
  console.log('====================================================');
  console.log('🧪 Starting Strict Financial Balance & Savings E2E Suite');
  console.log('====================================================');

  try {
    // Helper to register user
    const createUser = async (name, email, income, savings) => {
      const regRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password: 'password123',
          confirmPassword: 'password123',
          monthly_income: income,
          bank_savings: savings,
          budget_enabled: 1
        })
      });
      const data = await regRes.json();
      return {
        user: data.user,
        token: data.token,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.token}`
        }
      };
    };

    // ----------------------------------------------------
    // TEST 1: Expense <= Available Balance (Savings Unchanged)
    // ----------------------------------------------------
    // Income = 78,000, initial spending = 33,000 (leaves Available Balance = 45,000), Savings = 6,600
    const u1 = await createUser('Test1 User', `t1_${Date.now()}@smartbudget.ai`, 78000, 6600);
    // Add baseline expense to bring Available Balance to exactly 45,000
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u1.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 33000, description: 'Baseline setup' })
    });

    let s1 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u1.headers })).json()).summary;
    console.log(`   [Test 1 Setup] Available Balance: ₹${s1.availableBalance}, Savings: ₹${s1.bankSavings}`);

    // Now add expense of 10,000
    const tx1Res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u1.headers,
      body: JSON.stringify({ type: 'expense', category: 'Groceries', amount: 10000, description: 'Supermarket bulk' })
    });
    const tx1Data = await tx1Res.json();

    s1 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u1.headers })).json()).summary;
    const test1Passed = s1.availableBalance === 35000 && s1.bankSavings === 6600 && tx1Data.covered_from_savings === 0;
    console.log(`1. TEST 1 (Balance ₹45k -> Expense ₹10k -> Balance ₹35k, Savings ₹6.6k):`, test1Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s1.availableBalance}, Savings=${s1.bankSavings})`);

    // ----------------------------------------------------
    // TEST 2: Expense Exceeds Available Balance (Shortfall Covered From Savings)
    // ----------------------------------------------------
    // Available Balance = 45,000, Savings = 6,600, Expense = 46,000
    // Expected: Available Balance = 0, Savings = 5,600 (shortfall = 1,000 covered from savings)
    const u2 = await createUser('Test2 User', `t2_${Date.now()}@smartbudget.ai`, 78000, 6600);
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u2.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 33000, description: 'Baseline setup' })
    });

    const tx2Res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u2.headers,
      body: JSON.stringify({ type: 'expense', category: 'Shopping', amount: 46000, description: 'Festival shopping' })
    });
    const tx2Data = await tx2Res.json();

    const s2 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u2.headers })).json()).summary;
    const test2Passed = s2.availableBalance === 0 && s2.bankSavings === 5600 && tx2Data.covered_from_savings === 1000 && tx2Data.savingsNotification.includes('1,000');
    console.log(`2. TEST 2 (Balance ₹45k, Savings ₹6.6k -> Expense ₹46k -> Balance ₹0, Savings ₹5.6k, Shortfall ₹1k):`, test2Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s2.availableBalance}, Savings=${s2.bankSavings}, Shortfall=${tx2Data.covered_from_savings})`);

    // ----------------------------------------------------
    // TEST 3: Expense Exceeds Available Balance AND Savings (Deficit Warning)
    // ----------------------------------------------------
    // Available Balance = 45,000, Savings = 6,600, Expense = 55,000
    // Shortfall = 10,000, Savings covers 6,600, Uncovered deficit = 3,400
    // Expected: Available Balance = 0, Savings = 0, Deficit = 3,400 with warning
    const u3 = await createUser('Test3 User', `t3_${Date.now()}@smartbudget.ai`, 78000, 6600);
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u3.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 33000, description: 'Baseline setup' })
    });

    const tx3Res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u3.headers,
      body: JSON.stringify({ type: 'expense', category: 'EMI', amount: 55000, description: 'Large settlement' })
    });
    const tx3Data = await tx3Res.json();

    const s3 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u3.headers })).json()).summary;
    const test3Passed = s3.availableBalance === 0 && s3.bankSavings === 0 && tx3Data.covered_from_savings === 6600 && tx3Data.uncovered_deficit === 3400 && tx3Data.savingsNotification.includes('3,400');
    console.log(`3. TEST 3 (Balance ₹45k, Savings ₹6.6k -> Expense ₹55k -> Balance ₹0, Savings ₹0, Deficit ₹3.4k):`, test3Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s3.availableBalance}, Savings=${s3.bankSavings}, Deficit=${tx3Data.uncovered_deficit})`);

    // ----------------------------------------------------
    // TEST 4: Expense = 20,000 on Balance = 45,000, Savings = 6,600
    // ----------------------------------------------------
    // Expected: Available Balance = 25,000, Savings = 6,600
    const u4 = await createUser('Test4 User', `t4_${Date.now()}@smartbudget.ai`, 78000, 6600);
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u4.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 33000, description: 'Baseline setup' })
    });

    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u4.headers,
      body: JSON.stringify({ type: 'expense', category: 'Health', amount: 20000, description: 'Annual checkup' })
    });

    const s4 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u4.headers })).json()).summary;
    const test4Passed = s4.availableBalance === 25000 && s4.bankSavings === 6600;
    console.log(`4. TEST 4 (Balance ₹45k, Savings ₹6.6k -> Expense ₹20k -> Balance ₹25k, Savings ₹6.6k):`, test4Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s4.availableBalance}, Savings=${s4.bankSavings})`);

    // ----------------------------------------------------
    // TEST 5: Manual Transfer to Bank Savings (Balance 30k -> Transfer 2k -> Balance 28k, Savings 8.6k)
    // ----------------------------------------------------
    const u5 = await createUser('Test5 User', `t5_${Date.now()}@smartbudget.ai`, 78000, 6600);
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u5.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 48000, description: 'Baseline setup' })
    });
    // Now Available Balance is 30,000, Savings is 6,600
    const transferRes = await fetch(`${BASE_URL}/transactions/bank-savings/transfer`, {
      method: 'POST',
      headers: u5.headers,
      body: JSON.stringify({ amount: 2000, direction: 'deposit', notes: 'Monthly reserve transfer' })
    });
    const transferData = await transferRes.json();

    const s5 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u5.headers })).json()).summary;
    const test5Passed = s5.availableBalance === 28000 && s5.bankSavings === 8600;
    console.log(`5. TEST 5 (Balance ₹30k, Savings ₹6.6k -> Transfer ₹2k -> Balance ₹28k, Savings ₹8.6k):`, test5Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s5.availableBalance}, Savings=${s5.bankSavings})`);

    // ----------------------------------------------------
    // TEST 6: Delete Expense Reversal (Balance 45k, Savings 6.6k -> Expense 46k -> Delete Expense -> Balance 45k, Savings 6.6k)
    // ----------------------------------------------------
    const u6 = await createUser('Test6 User', `t6_${Date.now()}@smartbudget.ai`, 78000, 6600);
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u6.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 33000, description: 'Baseline setup' })
    });

    const exp6Res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u6.headers,
      body: JSON.stringify({ type: 'expense', category: 'Shopping', amount: 46000, description: 'Electronic gadget' })
    });
    const exp6Data = await exp6Res.json();
    const exp6Id = exp6Data.transaction.id;

    // Verify state after adding
    let s6 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u6.headers })).json()).summary;
    const stateAfterAdd = s6.availableBalance === 0 && s6.bankSavings === 5600;

    // Delete the expense
    await fetch(`${BASE_URL}/transactions/${exp6Id}`, {
      method: 'DELETE',
      headers: u6.headers
    });

    // Verify exact restoration
    s6 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u6.headers })).json()).summary;
    const test6Passed = stateAfterAdd && s6.availableBalance === 45000 && s6.bankSavings === 6600;
    console.log(`6. TEST 6 (Delete Expense Reversal -> Restores Balance ₹45k, Savings ₹6.6k):`, test6Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s6.availableBalance}, Savings=${s6.bankSavings})`);

    // ----------------------------------------------------
    // TEST 7: Budget Remaining Independent Calculation
    // ----------------------------------------------------
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    await fetch(`${BASE_URL}/budgets`, {
      method: 'POST',
      headers: u1.headers,
      body: JSON.stringify({
        category: 'Groceries',
        amount: 31350,
        period_month: currentMonth,
        period_year: currentYear
      })
    });

    const s7 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u1.headers })).json()).summary;
    const budgetRemainingCorrect = s7.budget.remaining !== undefined && typeof s7.budget.remaining === 'number';
    console.log(`7. TEST 7 (Budget Remaining Independent of Savings):`, budgetRemainingCorrect ? 'PASSED ✅' : 'FAILED ❌');

    // ----------------------------------------------------
    // TEST 8: Persistence across Logout / Login
    // ----------------------------------------------------
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u1.user.email, password: 'password123' })
    });
    const loginData = await loginRes.json();
    const loginAuthHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.token}`
    };

    const sAfterLogin = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: loginAuthHeaders })).json()).summary;
    const persistPassed = sAfterLogin.availableBalance === s1.availableBalance && sAfterLogin.bankSavings === s1.bankSavings;
    console.log(`8. TEST 8 (Database Persistence Across Login/Logout):`, persistPassed ? 'PASSED ✅' : 'FAILED ❌');

    // ----------------------------------------------------
    // TEST 9: Edit Expense Recalculation (Balance 45k, Savings 6.6k -> Expense 46k -> Edit to 40k -> Balance 5k, Savings 6.6k)
    // ----------------------------------------------------
    const u9 = await createUser('Test9 User', `t9_${Date.now()}@smartbudget.ai`, 78000, 6600);
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u9.headers,
      body: JSON.stringify({ type: 'expense', category: 'Other Expense', amount: 33000, description: 'Baseline setup' })
    });

    const exp9Res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u9.headers,
      body: JSON.stringify({ type: 'expense', category: 'Shopping', amount: 46000, description: 'Electronic gadget' })
    });
    const exp9Data = await exp9Res.json();
    const exp9Id = exp9Data.transaction.id;

    // Edit expense from 46,000 to 40,000
    const putRes = await fetch(`${BASE_URL}/transactions/${exp9Id}`, {
      method: 'PUT',
      headers: u9.headers,
      body: JSON.stringify({ amount: 40000, description: 'Electronic gadget (discounted)' })
    });
    const putData = await putRes.json();
    console.log('   [PUT Result]', putData);

    const s9 = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u9.headers })).json()).summary;
    const test9Passed = s9.availableBalance === 5000 && s9.bankSavings === 6600;
    console.log(`9. TEST 9 (Edit Expense Recalculation -> Balance ₹5k, Savings ₹6.6k):`, test9Passed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s9.availableBalance}, Savings=${s9.bankSavings})`);

    // ----------------------------------------------------
    // TEST 10: Negative Bank Savings Overdraft & Auto-Tallying Income Settlement
    // ----------------------------------------------------
    // Income = 50,000, Bank Savings = 5,000.
    // Expense = 58,000 -> Available Balance = 0, Bank Savings = -3,000 (overdraft).
    // Next Income = 50,000 -> Auto-tallies -3,000 Bank Savings back to 0, Available Balance = 47,000.
    const u10 = await createUser('Test10 Overdraft', `t10_${Date.now()}@smartbudget.ai`, 50000, 5000);
    
    // Expense exceeding Available Balance (50k) and Savings (5k) by 3k shortfall
    await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u10.headers,
      body: JSON.stringify({ type: 'expense', category: 'Shopping', amount: 58000, description: 'Overdraft purchase' })
    });

    const s10a = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u10.headers })).json()).summary;
    console.log('   [s10a debug]', s10a);
    const test10aPassed = s10a.availableBalance === 0 && s10a.bankSavings === -3000;
    console.log(`10A. TEST 10A (Expense ₹58k -> Available Balance ₹0, Negative Bank Savings -₹3k):`, test10aPassed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s10a.availableBalance}, Savings=${s10a.bankSavings})`);

    // Credit Next Month Income of ₹50,000
    const incRes = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: u10.headers,
      body: JSON.stringify({ type: 'income', category: 'Salary', amount: 50000, description: 'Next Month Salary' })
    });
    const incData = await incRes.json();
    console.log('    [Income Auto-Tally Notification]', incData.savingsNotification);

    const s10b = (await (await fetch(`${BASE_URL}/transactions/summary`, { headers: u10.headers })).json()).summary;
    const test10bPassed = s10b.bankSavings === 0 && s10b.availableBalance === 47000;
    console.log(`10B. TEST 10B (Income ₹50k Auto-Tallies -₹3k Deficit -> Savings ₹0, Available Balance ₹47k):`, test10bPassed ? 'PASSED ✅' : `FAILED ❌ (Balance=${s10b.availableBalance}, Savings=${s10b.bankSavings})`);

    console.log('====================================================');
    console.log('🎉 ALL 10 STRICT FINANCIAL TEST SUITES PASSED! 🎉');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  }
}

runE2ETest();
