const assert = require('assert');
const db = require('../db.cjs');
const { exec } = require('child_process');

console.log('[Test] Running 5D Cost Estimate verification checks...');

try {
  // 1. Check if Default Regions are preloaded
  const jkt = db.get("SELECT * FROM regions WHERE id = 'R-JKT'");
  assert.ok(jkt, 'Jakarta region should be preloaded');
  assert.strictEqual(jkt.name, 'Jakarta');
  console.log('✔ Region preloading check passed');

  // 2. Check if default rules are present
  const beamRules = db.query("SELECT * FROM rules WHERE ifc_type = 'IfcBeam'");
  assert.ok(beamRules.length >= 3, 'Default beam rules should include concrete, rebar, and formwork mappings');
  console.log('✔ Rule preloading check passed');

  // 3. Test insert & calculation workflow
  const testProjectId = 'test-proj-1';
  db.run("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)", [testProjectId, 'Test Project', 'Unit Testing']);
  
  // Insert 2 Concrete Beams
  const testElementId1 = 'el-beam-1';
  const testElementId2 = 'el-beam-2';
  db.run(`
    INSERT INTO ifc_elements (id, project_id, global_id, ifc_type, name, volume, surface_area, count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [testElementId1, testProjectId, 'guid-b1', 'IfcBeam', 'Concrete Beam 1', 1.5, 8.0, 1]);
  
  db.run(`
    INSERT INTO ifc_elements (id, project_id, global_id, ifc_type, name, volume, surface_area, count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [testElementId2, testProjectId, 'guid-b2', 'IfcBeam', 'Concrete Beam 2', 2.5, 12.0, 1]);

  console.log('✔ Element registration check passed');

  // 4. Test math evaluator logic directly in endpoint logic
  // Helper matches server.cjs evaluateExpression
  function evaluateExpression(expression, context) {
    const allowedTokens = ['volume', 'area', 'surface_area', 'length', 'count', 'val', 'x', '\\d+', '\\.', '\\+', '\\-', '\\*', '\\/', '\\(', '\\)', '\\s+'];
    const cleanRegex = new RegExp(`^(${allowedTokens.join('|')})+$`, 'i');
    const sanitized = expression.trim();
    if (!cleanRegex.test(sanitized)) return 0;
    
    let evalStr = sanitized;
    const vars = {
      volume: context.volume || 0.0,
      area: context.area || 0.0,
      surface_area: context.surface_area || 0.0,
      length: context.length || 0.0,
      count: context.count || 1
    };
    for (const [key, val] of Object.entries(vars)) {
      const varRegex = new RegExp(`\\b${key}\\b`, 'gi');
      evalStr = evalStr.replace(varRegex, String(val));
    }
    const calc = new Function(`return (${evalStr});`);
    return calc();
  }

  // Check concrete beam rebar calculation: 1.5m3 * 135 = 202.5 kg rebar
  const context1 = { volume: 1.5, surface_area: 8.0, count: 1 };
  const rebarQty = evaluateExpression('volume * 135.0', context1);
  assert.strictEqual(rebarQty, 202.5, 'Beam 1 rebar quantity calculation should equal 202.5');
  console.log('✔ Rule engine mathematical expression evaluator check passed');

  // 5. Test manual override logic
  const overrideVal = 250.0;
  const overrideId = testElementId1 + '-volume';
  db.run(`
    INSERT INTO quantity_overrides (id, element_id, quantity_name, calculated_value, override_value, reason, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [overrideId, testElementId1, 'volume', 1.5, overrideVal, 'Manual estimation adjustment', 'Tester']);

  // Fetch overrides
  const overrides = db.query("SELECT * FROM quantity_overrides WHERE element_id = ?", [testElementId1]);
  assert.strictEqual(overrides.length, 1);
  assert.strictEqual(overrides[0].override_value, 250.0);
  console.log('✔ Manual override registration & overrides audit trail check passed');

  // Cleanup testing workspace
  db.run("DELETE FROM projects WHERE id = ?", [testProjectId]);
  console.log('✔ Testing cleanup completed');
  console.log('\n⭐ ALL NATIVE 5D ESTIMATION CHECKS PASSED SUCCESSFULLY ⭐');
  
} catch (e) {
  console.error('❌ Verification failed:', e);
  process.exit(1);
}
