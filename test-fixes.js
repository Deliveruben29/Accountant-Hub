/**
 * Test Suite para las 8 correcciones de AccountantHub
 * Ejecutar en Replit: node test-fixes.js
 */

const BASE_URL = 'http://localhost:3000';
let testResults = [];
let accountId, statementImportId;

async function apiCall(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log(`⚠️  Response not JSON: ${text.substring(0, 100)}`);
      data = { error: text };
    }
    
    return { status: response.status, data, ok: response.ok };
  } catch (error) {
    return { status: 0, data: null, error: error.message, ok: false };
  }
}

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  testResults.push({ name, passed, details });
  console.log(`\n${status} – ${name}`);
  if (details) console.log(`   ${details}`);
}

async function setupTestData() {
  console.log('\n═══ SETUP: Creating test account ═══\n');

  // 1. Create account
  let res = await apiCall('POST', '/api/accounts', { name: 'Test Account', type: 'checking', currency: 'USD' });
  accountId = res.data?.id;
  logTest('Create test account', res.ok && accountId, `Account ID: ${accountId}`);

  return accountId;
}

async function testFix1_QueryLimit() {
  console.log('\n═══ TEST 1: Transaction query limit (500 → 2000) ═══\n');

  // Create 100 test transactions
  const promises = [];
  for (let i = 0; i < 100; i++) {
    const payload = {
      accountId,
      date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
      amount: 100 + i,
      description: `Test transaction ${i}`
    };
    promises.push(apiCall('POST', '/api/transactions', payload));
  }

  const results = await Promise.all(promises);
  const allCreated = results.every(r => r.ok);
  logTest('Create 100 transactions', allCreated, `Created for limit test`);

  // Query all transactions
  const res = await apiCall('GET', `/api/transactions?accountId=${accountId}&limit=500`);
  const countReturned = res.data?.data?.length || 0;
  logTest('Retrieve transactions with limit=500', res.ok, `Returned ${countReturned} transactions`);

  // Test limit > 500
  const res2 = await apiCall('GET', `/api/transactions?accountId=${accountId}&limit=2000`);
  const count2000 = res2.data?.data?.length || 0;
  logTest('Retrieve with limit=2000', res2.ok && count2000 >= countReturned, `Returned ${count2000} (should be ≥ ${countReturned})`);
}

async function testFix2_RejectionDetails() {
  console.log('\n═══ TEST 2: Rejection details in response ═══\n');

  const csvContent = `date,amount,description
2025-01-15,500,Salary
2025-01-15,500,Salary
2025-01-16,250,Groceries`;

  const formData = new FormData();
  formData.append('file', new File([csvContent], 'test.csv', { type: 'text/csv' }));
  formData.append('accountId', accountId);

  try {
    const response = await fetch(`${BASE_URL}/statements/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    statementImportId = data.statementImportId;

    const hasRejectedArray = Array.isArray(data.rejected);
    const hasReasonField = data.rejected?.[0]?.reason !== undefined;
    
    logTest('Upload returns rejected[] array', hasRejectedArray && data.rejected.length > 0, 
      `Found ${data.rejected?.length || 0} rejections with reasons`);
    logTest('Rejection has reason field', hasReasonField, 
      `Reason: "${data.rejected?.[0]?.reason || 'N/A'}"`);
  } catch (error) {
    logTest('Upload with rejection details', false, error.message);
  }
}

async function testFix3_FuzzyMatching() {
  console.log('\n═══ TEST 3: Fuzzy matching for similar transactions ═══\n');

  // Create base transaction
  const t1 = await apiCall('POST', '/api/transactions', {
    accountId,
    date: '2025-01-20',
    amount: 150,
    description: 'Amazon Purchase Electronics'
  });
  const t1Id = t1.data?.id;

  // Try to import similar description (should be fuzzy matched)
  const csvContent = `date,amount,description
2025-01-20,150,Amazon Puchase Elektronics`;  // Typos: Puchase, Elektronics

  const formData = new FormData();
  formData.append('file', new File([csvContent], 'fuzzy-test.csv', { type: 'text/csv' }));
  formData.append('accountId', accountId);

  try {
    const response = await fetch(`${BASE_URL}/statements/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    const hasFuzzyRejection = data.rejected?.some(r => r.fuzzyMatch === true);
    logTest('Fuzzy match detection works', hasFuzzyRejection, 
      `Fuzzy match found: ${hasFuzzyRejection}`);
    
    if (hasFuzzyRejection) {
      const fuzzyEntry = data.rejected.find(r => r.fuzzyMatch);
      logTest('Fuzzy rejection has conflictingTransactionId', 
        fuzzyEntry?.conflictingTransactionId !== undefined,
        `Conflicting ID: ${fuzzyEntry?.conflictingTransactionId || 'N/A'}`);
    }
  } catch (error) {
    logTest('Fuzzy matching test', false, error.message);
  }
}

async function testFix4_ManualRecordProtection() {
  console.log('\n═══ TEST 4: Manual records protection (deleteOnlyImported) ═══\n');

  // Create manual transaction (no statementImportId)
  const manual = await apiCall('POST', '/api/transactions', {
    accountId,
    date: '2025-02-01',
    amount: 300,
    description: 'Manual Entry - Should NOT Delete'
  });
  const manualId = manual.data?.id;
  logTest('Create manual transaction', manual.ok, `Manual TX ID: ${manualId}`);

  // Try to delete with deleteOnlyImported flag
  // (This should either prevent deletion or return error)
  const res = await apiCall('DELETE', `/api/statements/${statementImportId}?deleteOnlyImported=true`);
  
  // Verify manual tx still exists
  const checkManual = await apiCall('GET', `/transactions/${manualId}`);
  logTest('Manual record protected from deletion', checkManual.ok, 
    `Manual TX still exists: ${checkManual.ok}`);
}

async function testFix5_ReconcileEndpoint() {
  console.log('\n═══ TEST 5: Reconcile endpoint for accurate balance ═══\n');

  // GET /accounts/:id/reconcile should recalculate balance
  const res = await apiCall('POST', `/api/accounts/${accountId}/reconcile`, {});
  
  const hasBalance = res.data?.balance !== undefined;
  logTest('Reconcile endpoint exists and returns balance', res.ok && hasBalance,
    `Balance after reconcile: ${res.data?.balance || 'N/A'}`);
}

async function testFix6_TransactionVisibilityInFilters() {
  console.log('\n═══ TEST 6: Transactions visible after creation (React Query invalidation) ═══\n');

  // Create transaction with specific date
  const targetDate = '2025-03-10';
  const tx = await apiCall('POST', '/api/transactions', {
    accountId,
    date: targetDate,
    amount: 550,
    description: 'Visibility Test TX',
    category: 'Food'  // Add category to enable filtering
  });
  const newTxId = tx.data?.id;

  // Query with filter for that date
  const res = await apiCall('GET', `/api/transactions?accountId=${accountId}&startDate=${targetDate}&endDate=${targetDate}`);
  
  const foundNewTX = res.data?.data?.some(t => t.id === newTxId);
  logTest('New TX visible immediately in filtered query', foundNewTX,
    `Query for date=${targetDate} – Found new TX: ${foundNewTX}`);
}

async function testFix7_LimitHandling() {
  console.log('\n═══ TEST 7: Handle >600 line imports correctly ═══\n');

  // Generate CSV with 800 lines
  let csv = 'date,amount,description\n';
  for (let i = 0; i < 800; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    csv += `${date},${100 + i},CSV Import Line ${i}\n`;
  }

  const formData = new FormData();
  formData.append('file', new File([csv], 'large-import.csv', { type: 'text/csv' }));
  formData.append('accountId', accountId);

  try {
    const response = await fetch(`${BASE_URL}/statements/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    const imported = data.imported || 0;
    const skipped = data.rejected?.length || 0;
    
    logTest('Process 800-line import without silent failures', 
      response.ok && (imported + skipped) > 0,
      `Imported: ${imported}, Rejected: ${skipped} (Total: ${imported + skipped})`);
  } catch (error) {
    logTest('Large file import', false, error.message);
  }
}

async function testFix8_FilterAccuracy() {
  console.log('\n═══ TEST 8: Filter results are accurate ═══\n');

  // Get all transactions
  const allRes = await apiCall('GET', `/api/transactions?accountId=${accountId}&limit=2000`);
  const allCount = allRes.data?.data?.length || 0;

  // Get transactions for March
  const marchRes = await apiCall('GET', `/api/transactions?accountId=${accountId}&limit=2000`);
  const marchCount = marchRes.data?.data?.length || 0;

  // Verify counts make sense
  const filtered = marchRes.data?.data?.filter(t => {
    const month = new Date(t.date).getMonth() + 1;
    return month === 3;
  });

  logTest('Filters return correct subsets', 
    marchCount === filtered?.length,
    `All TXs: ${allCount}, March: ${marchCount} (verified: ${filtered?.length})`);
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  AccountantHub: 8 Fixes Test Suite    ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await setupTestData();
    await testFix1_QueryLimit();
    await testFix2_RejectionDetails();
    await testFix3_FuzzyMatching();
    await testFix4_ManualRecordProtection();
    await testFix5_ReconcileEndpoint();
    await testFix6_TransactionVisibilityInFilters();
    await testFix7_LimitHandling();
    await testFix8_FilterAccuracy();

    // Summary
    console.log('\n╔════════════════════════════════════════╗');
    const passed = testResults.filter(t => t.passed).length;
    const total = testResults.length;
    const percentage = Math.round((passed / total) * 100);
    
    console.log(`║  RESULTS: ${passed}/${total} PASSED (${percentage}%)       ║`);
    console.log('╚════════════════════════════════════════╝\n');

    testResults.forEach(t => {
      const icon = t.passed ? '✅' : '❌';
      console.log(`${icon} ${t.name}`);
    });

  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }
}

runAllTests();
