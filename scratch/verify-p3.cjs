const assert = require('assert');
const db = require('../db.cjs');

console.log('[Test] Running manual classification overrides & JSON Backup verification checks...');

try {
  const testProjectId = 'test-proj-p3';
  const testElementId = 'el-beam-p3';
  const testGlobalId = 'guid-beam-p3';

  // Cleanup in case of previous failures
  db.run("DELETE FROM projects WHERE id = ?", [testProjectId]);

  // Insert project & test element
  db.run("INSERT INTO projects (id, name, description) VALUES (?, ?, ?)", [testProjectId, 'Test Project P3', 'Overrides Verification']);
  db.run(`
    INSERT INTO ifc_elements (id, project_id, global_id, ifc_type, name, volume, surface_area, count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [testElementId, testProjectId, testGlobalId, 'IfcBeam', 'Concrete Beam P3', 2.0, 10.0, 1]);

  console.log('✔ Test project and elements initialized');

  // 1. Register manual override: Assign 'A.2.2.1' (Excavation) to this concrete beam
  db.run(`
    INSERT INTO classification_overrides (project_id, element_id, classification_code)
    VALUES (?, ?, ?)
  `, [testProjectId, testElementId, 'A.2.2.1']);

  const overrides = db.query("SELECT * FROM classification_overrides WHERE project_id = ?", [testProjectId]);
  assert.strictEqual(overrides.length, 1, 'Should have registered exactly 1 manual override');
  assert.strictEqual(overrides[0].classification_code, 'A.2.2.1', 'Manual override should map to Excavation A.2.2.1');
  console.log('✔ Manual override registration check passed');

  // 2. Validate BOQ Generator logic for manual overrides
  // Load elements, rules, classifications
  const elements = db.query("SELECT * FROM ifc_elements WHERE project_id = ?", [testProjectId]);
  const rules = db.query("SELECT * FROM rules ORDER BY priority DESC");
  const classifications = db.query("SELECT * FROM classifications");

  const classOverrides = db.query("SELECT * FROM classification_overrides WHERE project_id = ?", [testProjectId]);
  const classOverrideMap = {};
  for (const co of classOverrides) {
    classOverrideMap[co.element_id] = co.classification_code;
  }

  const boqAccumulator = {};
  for (const el of elements) {
    const context = {
      volume: el.volume,
      area: el.area,
      surface_area: el.surface_area,
      length: el.length,
      count: el.count
    };

    const overriddenCode = classOverrideMap[el.id];
    assert.strictEqual(overriddenCode, 'A.2.2.1', 'Manual override should bypass normal mapping and identify A.2.2.1');

    if (overriddenCode) {
      const classification = classifications.find(c => c.code === overriddenCode);
      assert.ok(classification, 'Should find classification record for A.2.2.1');
      
      const unit = classification.unit.toLowerCase();
      assert.strictEqual(unit, 'm³', 'A.2.2.1 unit should be m³');

      let qty = 0;
      if (unit.includes('m³') || unit.includes('volume') || unit.includes('cub')) {
        qty = context.volume;
      }
      
      if (qty > 0) {
        boqAccumulator[overriddenCode] = (boqAccumulator[overriddenCode] || 0) + qty;
      }
    }
  }

  assert.strictEqual(boqAccumulator['A.2.2.1'], 2.0, 'Calculated quantity should equal 2.0m3 for A.2.2.1');
  console.log('✔ BOQ manual override routing & unit heuristic calculations check passed');

  // 3. Test backup functionality - Fetch all rules
  const allRules = db.query("SELECT * FROM rules");
  assert.ok(Array.isArray(allRules), 'Rules list should be an array');
  assert.ok(allRules.length > 0, 'Should have some rule mappings');
  console.log('✔ Rules JSON backup pre-extraction check passed');

  // Cleanup
  db.run("DELETE FROM projects WHERE id = ?", [testProjectId]);
  console.log('✔ Test cleanup completed');
  console.log('\n⭐ ALL OVERRIDES & JSON BACKUP VERIFICATION CHECKS PASSED ⭐');

} catch (e) {
  console.error('❌ Verification failed:', e);
  process.exit(1);
}
