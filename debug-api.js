/**
 * Debug Script - Verificar que la API esté funcionando
 * Ejecutar en Replit: node debug-api.js
 */

const BASE_URL = 'http://localhost:3000';

async function testEndpoint(method, path, body = null) {
  try {
    const options = {
      method,
      headers: { 
        'Content-Type': 'application/json',
        'X-Auth-User': JSON.stringify({ id: 'test-user', email: 'test@example.com' })
      }
    };
    if (body) options.body = JSON.stringify(body);

    console.log(`\n📡 ${method} ${path}`);
    const response = await fetch(`${BASE_URL}${path}`, options);
    const text = await response.text();
    
    console.log(`   Status: ${response.status}`);
    
    try {
      const data = JSON.parse(text);
      console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}`);
      return { ok: response.ok, status: response.status, data };
    } catch (e) {
      console.log(`   ⚠️  Not JSON: ${text.substring(0, 150)}`);
      return { ok: false, status: response.status, error: text };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  API Debug - Verificar endpoints      ║');
  console.log('╚═══════════════════════════════════════╝');

  // 1. Health check
  console.log('\n1️⃣  HEALTH CHECK');
  const health = await testEndpoint('GET', '/api/healthz');
  
  // 2. Create account
  console.log('\n2️⃣  CREATE ACCOUNT');
  const accountRes = await testEndpoint('POST', '/api/accounts', {
    name: 'Test Account',
    type: 'checking',
    currency: 'USD'
  });
  
  if (!accountRes.ok) {
    console.log('\n❌ ERROR: No se pudo crear cuenta. Verifica que el backend esté corriendo.');
    console.log(`   Comando: PORT=3000 npm run dev`);
    process.exit(1);
  }

  const accountId = accountRes.data?.id;
  console.log(`   ✅ Account created: ${accountId}`);

  // 3. Create transaction
  console.log('\n3️⃣  CREATE TRANSACTION');
  const txRes = await testEndpoint('POST', '/api/transactions', {
    accountId,
    date: '2025-03-16',
    amount: 100,
    type: 'income',
    description: 'Test transaction'
  });

  if (!txRes.ok) {
    console.log('   ❌ Error creating transaction');
    console.log('   Response:', txRes.data || txRes.error);
  } else {
    console.log(`   ✅ Transaction created: ${txRes.data?.id}`);
  }

  // 4. Get transactions
  console.log('\n4️⃣  GET TRANSACTIONS');
  const getRes = await testEndpoint('GET', `/api/transactions?accountId=${accountId}`);
  
  if (getRes.ok) {
    console.log(`   ✅ Retrieved: ${getRes.data?.data?.length || 0} transactions`);
  } else {
    console.log('   ❌ Error fetching transactions');
  }

  // 5. Test reconcile endpoint
  console.log('\n5️⃣  RECONCILE ENDPOINT');
  const reconcileRes = await testEndpoint('POST', `/api/accounts/${accountId}/recalculate`, {});
  
  if (reconcileRes.ok) {
    console.log(`   ✅ Reconcile returned: balance=${reconcileRes.data?.balance}`);
  } else {
    console.log('   ❌ Reconcile endpoint error or not implemented');
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  Summary                              ║');
  console.log('╚═══════════════════════════════════════╝');
  
  const working = accountRes.ok && txRes.ok && getRes.ok;
  if (working) {
    console.log('\n✅ API BÁSICA FUNCIONA');
    console.log('Próximo paso: Ejecutar test-fixes.js para pruebas completas');
  } else {
    console.log('\n❌ API NO RESPONDE COMO SE ESPERA');
    console.log('Verifica los logs del backend:');
    console.log('  1. Backend está corriendo? (PORT=3000 npm run dev)');
    console.log('  2. ¿Hay errores en la terminal del backend?');
    console.log('  3. ¿PostgreSQL está conectada?');
  }
}

main();
