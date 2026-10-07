const assert = require('assert');
const { exec } = require('child_process');

console.log('[Test] Running Import/Export format verification...');

const port = 5123;
const env = { ...process.env, PORT: port };
const serverProcess = exec('node server.cjs', { env });

serverProcess.stdout.pipe(process.stdout);
serverProcess.stderr.pipe(process.stderr);

// Give it 1.5 seconds to start
setTimeout(async () => {
  try {
    console.log('[Test] Checking server API...');
    
    // 1. Test Rules Export CSV
    const rulesExportCsvRes = await fetch(`http://localhost:${port}/api/rules/export?format=csv`);
    assert.strictEqual(rulesExportCsvRes.status, 200);
    const rulesCsvText = await rulesExportCsvRes.text();
    assert.ok(rulesCsvText.includes("ID,Rule Name,IFC Type,Material Filter,Classification Code,Quantity Expression,Priority"));
    console.log('✔ Rules Export CSV check passed');

    // 2. Test Rules Export JSON
    const rulesExportJsonRes = await fetch(`http://localhost:${port}/api/rules/export`);
    assert.strictEqual(rulesExportJsonRes.status, 200);
    const rulesJson = await rulesExportJsonRes.json();
    assert.ok(Array.isArray(rulesJson));
    console.log('✔ Rules Export JSON check passed');

    // 3. Test AHSP Export CSV
    const ahspExportCsvRes = await fetch(`http://localhost:${port}/api/ahsp/export`);
    assert.strictEqual(ahspExportCsvRes.status, 200);
    const ahspCsvText = await ahspExportCsvRes.text();
    assert.ok(ahspCsvText.includes("Analysis Code,WBS Item,Source Catalog,Analysis Description,Overhead Factor"));
    console.log('✔ AHSP Export CSV check passed');

    // 4. Test AHSP Export JSON
    const ahspExportJsonRes = await fetch(`http://localhost:${port}/api/ahsp/export?format=json`);
    assert.strictEqual(ahspExportJsonRes.status, 200);
    const ahspJson = await ahspExportJsonRes.json();
    assert.ok(ahspJson.classifications);
    assert.ok(ahspJson.resources);
    assert.ok(ahspJson.resource_prices);
    assert.ok(ahspJson.ahsp_analyses);
    assert.ok(ahspJson.ahsp_details);
    console.log('✔ AHSP Export JSON check passed');

    // 5. Test Rules Import CSV (Database format)
    const testCsvRulesDb = `ID,Rule Name,IFC Type,Material Filter,Classification Code,Quantity Expression,Priority\ntest-rule-csv-1,Test Rule CSV 1,IfcWall,Concrete,W-CONC-1,volume * 1.0,5\n`;
    const rulesImportCsvResDb = await fetch(`http://localhost:${port}/api/rules/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: testCsvRulesDb })
    });
    const rulesImportCsvResultDb = await rulesImportCsvResDb.json();
    assert.strictEqual(rulesImportCsvResultDb.success, true);
    assert.strictEqual(rulesImportCsvResultDb.count, 1);
    console.log('✔ Rules Import CSV (Database Format) check passed');

    // 5b. Test Rules Import CSV (HTML Table format)
    const testCsvRulesHtml = `Rule Name,IFC Class,Material Match,Classification Target,Formula,Priority\nTest Rule CSV Html,IfcWall,Concrete,AHSP-W-CONC-2 (W-CONC-2),volume * 2.0,8\n`;
    const rulesImportCsvResHtml = await fetch(`http://localhost:${port}/api/rules/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: testCsvRulesHtml })
    });
    const rulesImportCsvResultHtml = await rulesImportCsvResHtml.json();
    assert.strictEqual(rulesImportCsvResultHtml.success, true);
    assert.strictEqual(rulesImportCsvResultHtml.count, 1);
    console.log('✔ Rules Import CSV (HTML Table Format) check passed');

    // 6. Test AHSP Import JSON
    const testJsonAhsp = {
      classifications: [
        { code: 'test-ahsp-json-1', description: 'Test Classification from JSON', unit: 'm3', category: 'General' }
      ]
    };
    const ahspImportJsonRes = await fetch(`http://localhost:${port}/api/ahsp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonData: testJsonAhsp })
    });
    const ahspImportJsonResult = await ahspImportJsonRes.json();
    assert.strictEqual(ahspImportJsonResult.success, true);
    console.log('✔ AHSP Import JSON check passed');

    // 6b. Test AHSP Import CSV (HTML Table format)
    const testCsvAhspHtml = `Analysis Code,WBS Item,Source Catalog,Description\nAHSP-A.2.2.1,A.2.2.1,Catalog A,Description A\n`;
    const ahspImportCsvResHtml = await fetch(`http://localhost:${port}/api/ahsp/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csvText: testCsvAhspHtml })
    });
    const ahspImportCsvResultHtml = await ahspImportCsvResHtml.json();
    assert.strictEqual(ahspImportCsvResultHtml.success, true);
    console.log('✔ AHSP Import CSV (HTML Table Format) check passed');

    console.log('⭐ ALL IMPORT/EXPORT FORMAT TESTS PASSED SUCCESSFULLY ⭐');
    serverProcess.kill();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    serverProcess.kill();
    process.exit(1);
  }
}, 1500);
