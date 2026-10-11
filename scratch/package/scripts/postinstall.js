'use strict';

const path = require('path');
const fs = require('fs');

const convertersDir = path.join(__dirname, '..', 'converters');

// Ensure converters directory exists
if (!fs.existsSync(convertersDir)) {
  fs.mkdirSync(convertersDir, { recursive: true });
}

const required = [
  'RvtExporter.exe',
  'IfcExporter.exe',
  'DwgExporter.exe',
  'DgnExporter.exe',
  'RVT2IFCconverter.exe',
];

const missing = required.filter(
  (exe) => !fs.existsSync(path.join(convertersDir, exe))
);

if (missing.length > 0) {
  console.log('\n========================================');
  console.log('  @datadrivenconstruction/cad2data');
  console.log('========================================\n');
  console.log('  Converter executables not found.');
  console.log('  Copy the following .exe files into:\n');
  console.log(`  ${convertersDir}\n`);
  for (const exe of missing) {
    console.log(`    - ${exe}`);
  }
  console.log('\n  Download from: https://datadrivenconstruction.io/convertors/');
  console.log('  Or run: cad2data list\n');
  console.log('========================================\n');
}
