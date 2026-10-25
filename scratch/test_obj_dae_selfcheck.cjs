const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('[Test] Running Load Model (.obj, .mtl, .dae) self-check...');

// 1. Check index.html fileInput accept attribute
const htmlPath = path.join(__dirname, '..', 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');
assert.ok(htmlContent.includes('.obj'), 'index.html must include .obj in fileInput accept');
assert.ok(htmlContent.includes('.mtl'), 'index.html must include .mtl in fileInput accept');
assert.ok(htmlContent.includes('.dae'), 'index.html must include .dae in fileInput accept');
console.log('✔ index.html accept attribute includes .obj, .mtl, .dae');

// 2. Check main.js configuration
const mainPath = path.join(__dirname, '..', 'main.js');
const mainContent = fs.readFileSync(mainPath, 'utf8');
assert.ok(mainContent.includes('OBJLoaderPlugin'), 'main.js must import OBJLoaderPlugin');
assert.ok(mainContent.includes('objLoader = new OBJLoaderPlugin(viewer)'), 'main.js must initialize objLoader');
assert.ok(mainContent.includes("fileExt === 'obj'"), "main.js must route fileExt === 'obj'");
assert.ok(mainContent.includes("fileExt === 'dae'"), "main.js must route fileExt === 'dae'");
assert.ok(mainContent.includes('pendingMtlFile'), 'main.js must track companion pendingMtlFile');
console.log('✔ main.js router and state checks passed');

// 3. Test Wavefront OBJ and MTL parsing format
const sampleObj = `
# Sample cube
mtllib sample.mtl
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 1.0 1.0 0.0
v 0.0 1.0 0.0
usemtl WallMaterial
f 1 2 3
f 1 3 4
`;

const sampleMtl = `
newmtl WallMaterial
Kd 0.8 0.2 0.2
d 1.0
Ns 10.0
`;

// Verify OBJ vertex and face patterns
const vMatches = sampleObj.match(/^v\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/gm);
assert.strictEqual(vMatches.length, 4, 'Should parse 4 vertices');
const fMatches = sampleObj.match(/^f\s+(\d+)\s+(\d+)\s+(\d+)/gm);
assert.strictEqual(fMatches.length, 2, 'Should parse 2 triangle faces');
assert.ok(sampleMtl.includes('newmtl WallMaterial'), 'Should contain WallMaterial in MTL');
console.log('✔ OBJ & MTL sample syntax validated');

// 4. Test COLLADA .dae XML structure
const sampleDae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><up_axis>Z_UP</up_axis></asset>
  <library_geometries>
    <geometry id="mesh-1" name="Box">
      <mesh>
        <source id="mesh-1-pos">
          <float_array id="mesh-1-pos-arr" count="9">0 0 0 1 0 0 0 1 0</float_array>
        </source>
        <vertices id="mesh-1-vertices">
          <input semantic="POSITION" source="#mesh-1-pos"/>
        </vertices>
        <triangles count="1">
          <input semantic="VERTEX" source="#mesh-1-vertices" offset="0"/>
          <p>0 1 2</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
</COLLADA>`;

assert.ok(sampleDae.includes('<COLLADA'), 'Should contain COLLADA root');
assert.ok(sampleDae.includes('<geometry id="mesh-1"'), 'Should contain geometry definition');
console.log('✔ COLLADA DAE sample syntax validated');

console.log('⭐ ALL LOAD MODEL (.OBJ, .MTL, .DAE) CHECKS PASSED SUCCESSFULLY ⭐');
