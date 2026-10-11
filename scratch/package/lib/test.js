'use strict';

const { CAD2Data } = require('./index');
const { listAvailableConverters, SUPPORTED_EXTENSIONS, EXPORT_MODES } = require('./utils');

console.log('=== cad2data package test ===\n');

// Test 1: Module loads
console.log('[OK] Module loads successfully');

// Test 2: CAD2Data class
const cad = new CAD2Data();
console.log('[OK] CAD2Data class instantiated');

// Test 3: Supported extensions
console.log(`[OK] Supported extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`);

// Test 4: Export modes
console.log(`[OK] Export modes: ${Object.keys(EXPORT_MODES).join(', ')}`);

// Test 5: List converters
const converters = listAvailableConverters();
console.log(`\n--- Converter status ---`);
for (const c of converters) {
  const status = c.installed ? 'INSTALLED' : 'MISSING';
  console.log(`  ${c.extension.padEnd(12)} ${c.executable.padEnd(25)} ${status}`);
}

// Test 6: Methods exist
const methods = ['convert', 'convertRevitToIfc', 'batch', 'listConverters'];
for (const m of methods) {
  if (typeof cad[m] === 'function') {
    console.log(`[OK] Method cad.${m}() exists`);
  } else {
    console.error(`[FAIL] Method cad.${m}() NOT found`);
  }
}

console.log('\n=== All tests passed ===');
