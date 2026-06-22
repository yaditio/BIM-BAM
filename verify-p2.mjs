import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  let executablePath = null;

  if (existsSync(chromePath)) {
    executablePath = chromePath;
  } else if (existsSync(edgePath)) {
    executablePath = edgePath;
  }

  if (!executablePath) {
    console.error('Could not find local Chrome or Edge installation.');
    process.exit(1);
  }

  console.log(`Launching local browser from: ${executablePath}`);
  const browser = await chromium.launch({ 
    executablePath: executablePath,
    headless: true 
  });
  const page = await browser.newPage();

  // Log all console messages
  page.on('console', msg => {
    console.log(`[Browser Console - ${msg.type()}]: ${msg.text()}`);
  });

  // Log all page errors
  page.on('pageerror', err => {
    console.error(`[Browser PageError]:`, err.message);
  });

  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  } catch (err) {
    console.error('Failed to load page:', err.message);
    await browser.close();
    process.exit(1);
  }

  console.log('Waiting for initial load...');
  await page.waitForTimeout(2000);

  console.log('Clicking the "Load Demo House IFC" button...');
  await page.locator('#btnLoadDemo').click();

  console.log('Waiting for model to load...');
  // Wait up to 30s for status to change to "Model loaded successfully"
  let loaded = false;
  for (let i = 0; i < 60; i++) {
    const statusText = await page.locator('#statusMessage').innerText();
    if (statusText.includes('Model loaded successfully')) {
      console.log(`Model load verified: "${statusText}"`);
      loaded = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!loaded) {
    console.error('Model failed to load in time.');
    await browser.close();
    process.exit(1);
  }

  console.log('Checking harvested properties in Advanced Filter dropdown...');
  const propOptions = await page.locator('#filterPropName option').evaluateAll(opts => opts.map(o => o.value));
  console.log(`Harvester found ${propOptions.length - 1} unique properties.`);
  console.log('Sample properties:', propOptions.slice(1, 10));

  // Select a property and apply query filter
  if (propOptions.length > 1) {
    const testProp = propOptions[1]; // Get first real property name
    console.log(`Testing filter query on property: "${testProp}"`);
    
    await page.locator('#filterPropName').selectOption(testProp);
    await page.locator('#filterOperator').selectOption('contains');
    await page.locator('#filterPropVal').fill('1'); // Match properties containing "1"
    
    await page.locator('#btnApplyPropFilter').click();
    await page.waitForTimeout(500);
    
    const resultCount = await page.locator('#filterResultCount').innerText();
    console.log(`Filter results message: "${resultCount}"`);
    
    // Reset filter
    await page.locator('#btnResetPropFilter').click();
    await page.waitForTimeout(500);
  }

  console.log('Opening Quantity Take-Off Modal...');
  await page.locator('#btnOpenQto').click();
  await page.waitForTimeout(500);

  const modalDisplay = await page.locator('#qtoModal').evaluate(el => window.getComputedStyle(el).display);
  console.log(`QTO Modal visibility display style: "${modalDisplay}"`);

  const summaryText = await page.locator('#qtoSummaryText').innerText();
  console.log(`QTO Summary text: "${summaryText}"`);

  const rowCount = await page.locator('#qtoTableBody tr').count();
  console.log(`QTO Table rendering has ${rowCount} rows.`);

  if (rowCount > 0) {
    // Intercept download
    console.log('Clicking "Export CSV" to trigger download...');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnExportCsv').click();
    const download = await downloadPromise;
    
    const downloadPath = await download.path();
    const csvContent = readFileSync(downloadPath, 'utf-8');
    const lines = csvContent.split('\n');
    console.log(`CSV Export Success. Downloaded file size: ${csvContent.length} bytes, Rows: ${lines.length - 1}`);
    console.log(`CSV Header: "${lines[0]}"`);
    console.log(`CSV Sample row: "${lines[1]}"`);
  } else {
    console.error('QTO table rendering failed: 0 rows found.');
    await browser.close();
    process.exit(1);
  }

  console.log('Closing QTO Modal...');
  await page.locator('#btnCloseQto').click();
  await page.waitForTimeout(500);

  console.log('Testing visibility controls (Hide, Isolate, Show All)...');
  const testObjId = await page.evaluate(() => {
    const ids = Object.keys(window.viewer.metaScene.metaObjects);
    const firstId = ids.find(id => window.viewer.scene.objects[id]);
    if (firstId) {
      const entity = window.viewer.scene.objects[firstId];
      window.handleObjectSelected(entity);
      return firstId;
    }
    return null;
  });

  if (testObjId) {
    console.log(`Selected object ID: ${testObjId} for visibility tests.`);
    
    // 1. Hide the object
    console.log('Clicking "Hide Object" button...');
    await page.locator('#btnHideObject').click();
    await page.waitForTimeout(500);
    
    const isVisibleAfterHide = await page.evaluate((id) => {
      return window.viewer.scene.objects[id].visible;
    }, testObjId);
    console.log(`Object visible after Hide click: ${isVisibleAfterHide}`);
    if (isVisibleAfterHide !== false) {
      console.error('FAIL: Object should be invisible after Hide.');
      process.exit(1);
    }
    
    // 2. Show all objects
    console.log('Clicking "Show All Objects" button...');
    await page.locator('#btnShowAllGlobal').click();
    await page.waitForTimeout(500);
    
    const isVisibleAfterShowAll = await page.evaluate((id) => {
      return window.viewer.scene.objects[id].visible;
    }, testObjId);
    console.log(`Object visible after Show All click: ${isVisibleAfterShowAll}`);
    if (isVisibleAfterShowAll !== true) {
      console.error('FAIL: Object should be visible after Show All.');
      process.exit(1);
    }
    
    // 3. Isolate the object
    console.log('Re-selecting object...');
    await page.evaluate((id) => {
      const entity = window.viewer.scene.objects[id];
      window.handleObjectSelected(entity);
    }, testObjId);
    await page.waitForTimeout(500);
    
    console.log('Clicking "Isolate Object" button...');
    await page.locator('#btnIsolateObject').click();
    await page.waitForTimeout(500);
    
    const visibilityStates = await page.evaluate((targetId) => {
      const objects = window.viewer.scene.objects;
      const targetVisible = objects[targetId].visible;
      // Find another active object ID in the scene
      const otherId = Object.keys(objects).find(id => id !== targetId && objects[id]);
      const otherVisible = otherId ? objects[otherId].visible : true;
      return { targetVisible, otherVisible };
    }, testObjId);
    
    console.log(`Isolate verification: target object visible = ${visibilityStates.targetVisible}, other object visible = ${visibilityStates.otherVisible}`);
    if (visibilityStates.targetVisible !== true || visibilityStates.otherVisible !== false) {
      console.error('FAIL: Isolate failed. Target should be visible and others should be invisible.');
      process.exit(1);
    }
    
    // Restore all before closing
    await page.locator('#btnShowAllGlobal').click();
    await page.waitForTimeout(500);
  }

  console.log('Testing multi-object visibility controls (Hide, Isolate)...');
  const testObjIds = await page.evaluate(() => {
    window.handleObjectDeselected();
    const ids = Object.keys(window.viewer.metaScene.metaObjects);
    const selected = [];
    for (const id of ids) {
      if (window.viewer.scene.objects[id]) {
        selected.push(id);
        if (selected.length === 2) break;
      }
    }
    if (selected.length === 2) {
      // Simulate multi-selection by holding Ctrl key
      window.viewer.scene.input.ctrlDown = true;
      window.handleObjectSelected(window.viewer.scene.objects[selected[0]]);
      window.handleObjectSelected(window.viewer.scene.objects[selected[1]]);
      window.viewer.scene.input.ctrlDown = false;
      return selected;
    }
    return null;
  });

  if (testObjIds) {
    console.log(`Selected multi-object IDs: ${testObjIds.join(', ')}`);
    
    // 1. Hide both
    console.log('Clicking "Hide Object" button for multi-selection...');
    await page.locator('#btnHideObject').click();
    await page.waitForTimeout(500);
    
    const multiHideStates = await page.evaluate((ids) => {
      const o1 = window.viewer.scene.objects[ids[0]].visible;
      const o2 = window.viewer.scene.objects[ids[1]].visible;
      return [o1, o2];
    }, testObjIds);
    
    console.log(`Objects visibility after Hide: [${multiHideStates.join(', ')}]`);
    if (multiHideStates[0] !== false || multiHideStates[1] !== false) {
      console.error('FAIL: Both objects should be invisible.');
      process.exit(1);
    }
    
    // 2. Show all
    console.log('Restoring visibility...');
    await page.locator('#btnShowAllGlobal').click();
    await page.waitForTimeout(500);
    
    // 3. Isolate both
    console.log('Selecting both objects again for Isolate test...');
    await page.evaluate((ids) => {
      window.viewer.scene.input.ctrlDown = true;
      window.handleObjectSelected(window.viewer.scene.objects[ids[0]]);
      window.handleObjectSelected(window.viewer.scene.objects[ids[1]]);
      window.viewer.scene.input.ctrlDown = false;
    }, testObjIds);
    await page.waitForTimeout(500);
    
    console.log('Clicking "Isolate Object" button for multi-selection...');
    await page.locator('#btnIsolateObject').click();
    await page.waitForTimeout(500);
    
    const isolateStates = await page.evaluate((ids) => {
      const objects = window.viewer.scene.objects;
      const o1 = objects[ids[0]].visible;
      const o2 = objects[ids[1]].visible;
      // Find a third object ID that is not one of the selected ones
      const thirdId = Object.keys(objects).find(id => !ids.includes(id) && objects[id]);
      const o3 = thirdId ? objects[thirdId].visible : true;
      return { o1, o2, o3 };
    }, testObjIds);
    
    console.log(`Isolate verification: target 1 visible = ${isolateStates.o1}, target 2 visible = ${isolateStates.o2}, other visible = ${isolateStates.o3}`);
    if (isolateStates.o1 !== true || isolateStates.o2 !== true || isolateStates.o3 !== false) {
      console.error('FAIL: Isolate failed for multiple objects.');
      process.exit(1);
    }
    
    // Restore all before closing
    await page.locator('#btnShowAllGlobal').click();
    await page.waitForTimeout(500);
  }

  console.log('Testing Select Similar Type integration with visibility controls...');
  const similarTestIds = await page.evaluate(() => {
    window.handleObjectDeselected();
    const ids = Object.keys(window.viewer.metaScene.metaObjects);
    const targetId = ids.find(id => {
      const obj = window.viewer.metaScene.metaObjects[id];
      return obj && obj.type && window.viewer.scene.objects[id];
    });
    if (targetId) {
      const entity = window.viewer.scene.objects[targetId];
      window.handleObjectSelected(entity);
      return { targetId, type: window.viewer.metaScene.metaObjects[targetId].type };
    }
    return null;
  });

  if (similarTestIds) {
    console.log(`Initial single selection: ${similarTestIds.targetId} (Type: ${similarTestIds.type})`);
    
    console.log('Clicking "Select Similar" button...');
    await page.locator('#btnSelectSimilar').click();
    await page.waitForTimeout(500);
    
    const similaritySelectionCount = await page.evaluate((type) => {
      const selected = window.viewer.scene.selectedObjectIds;
      const highlighted = window.viewer.scene.highlightedObjectIds;
      const allTypeMatch = selected.every(id => window.viewer.metaScene.metaObjects[id].type === type);
      return { selectedCount: selected.length, highlightedCount: highlighted.length, allTypeMatch };
    }, similarTestIds.type);
    
    console.log(`Select Similar results: Selected = ${similaritySelectionCount.selectedCount}, Highlighted = ${similaritySelectionCount.highlightedCount}, Type Match = ${similaritySelectionCount.allTypeMatch}`);
    if (similaritySelectionCount.selectedCount <= 1 || !similaritySelectionCount.allTypeMatch) {
      console.error('FAIL: Select Similar should select multiple matching objects.');
      process.exit(1);
    }
    
    console.log('Clicking "Hide Object" to hide all similar elements...');
    await page.locator('#btnHideObject').click();
    await page.waitForTimeout(500);
    
    const hiddenCount = await page.evaluate((type) => {
      const ids = window.viewer.metaScene.getObjectIDsByType(type);
      return ids.filter(id => window.viewer.scene.objects[id] && window.viewer.scene.objects[id].visible).length;
    }, similarTestIds.type);
    
    console.log(`Visible similar objects left after Hide: ${hiddenCount}`);
    if (hiddenCount !== 0) {
      console.error('FAIL: Similar objects were not successfully hidden.');
      process.exit(1);
    }
    
    await page.locator('#btnShowAllGlobal').click();
    await page.waitForTimeout(500);
  }

  console.log('Testing Model Tree Panel features...');
  
  // 1. Verify Model Tree container is visible
  const isTreeSectionVisible = await page.locator('#modelTreeSection').isVisible();
  console.log(`Model Tree section visible: ${isTreeSectionVisible}`);
  if (!isTreeSectionVisible) {
    console.error('FAIL: Model Tree section should be visible after model is loaded.');
    process.exit(1);
  }

  // 2. Count tree nodes
  const nodeCount = await page.locator('#treeContainer .tree-node').count();
  console.log(`Number of nodes in Model Tree: ${nodeCount}`);
  if (nodeCount === 0) {
    console.error('FAIL: Model Tree should render nodes.');
    process.exit(1);
  }

  // 3. Test selection from tree
  // Find a leaf tree node that corresponds to a valid scene object ID
  const testNodeId = await page.evaluate(() => {
    const nodes = document.querySelectorAll('#treeContainer .tree-node');
    for (const node of nodes) {
      const id = node.dataset.id;
      const entity = window.viewer.scene.objects[id];
      if (entity) {
        return id;
      }
    }
    return null;
  });

  if (testNodeId) {
    console.log(`Testing tree selection with node ID: ${testNodeId}`);
    
    // Click on the node content to select it
    await page.locator(`#treeContainer .tree-node-content[data-id="${testNodeId}"]`).click();
    await page.waitForTimeout(500);
    
    // Verify selection is synced to the 3D scene
    const isSelectedInScene = await page.evaluate((id) => {
      return window.viewer.scene.objects[id].selected;
    }, testNodeId);
    console.log(`Node ${testNodeId} selected in scene after tree click: ${isSelectedInScene}`);
    if (!isSelectedInScene) {
      console.error('FAIL: Clicking tree node should select the object in 3D scene.');
      process.exit(1);
    }

    // Verify properties panel is populated with the selected object details
    const propIdText = await page.locator('#propObjId').innerText();
    console.log(`Properties panel ID: "${propIdText}"`);
    if (!propIdText.includes(testNodeId)) {
      console.error(`FAIL: Properties panel should show the ID of the selected object: ${testNodeId}`);
      process.exit(1);
    }

    // 4. Test visibility toggle via tree checkbox
    console.log(`Unchecking checkbox for node ${testNodeId}...`);
    // Find the checkbox for this node and click it
    await page.locator(`#treeContainer .tree-node[data-id="${testNodeId}"] > .tree-node-content > .tree-checkbox`).setChecked(false);
    await page.waitForTimeout(500);

    const isVisibleInScene = await page.evaluate((id) => {
      return window.viewer.scene.objects[id].visible;
    }, testNodeId);
    console.log(`Node ${testNodeId} visible in scene after unchecking: ${isVisibleInScene}`);
    if (isVisibleInScene !== false) {
      console.error('FAIL: Unchecking tree checkbox should make the object invisible in 3D scene.');
      process.exit(1);
    }

    console.log(`Checking checkbox for node ${testNodeId} back to visible...`);
    await page.locator(`#treeContainer .tree-node[data-id="${testNodeId}"] > .tree-node-content > .tree-checkbox`).setChecked(true);
    await page.waitForTimeout(500);

    const isVisibleAfterRecheck = await page.evaluate((id) => {
      return window.viewer.scene.objects[id].visible;
    }, testNodeId);
    console.log(`Node ${testNodeId} visible in scene after rechecking: ${isVisibleAfterRecheck}`);
    if (isVisibleAfterRecheck !== true) {
      console.error('FAIL: Re-checking tree checkbox should make the object visible again.');
      process.exit(1);
    }
  } else {
    console.warn('Could not find a valid leaf node for tree selection/visibility tests.');
  }

  // Deselect object
  await page.evaluate(() => {
    window.handleObjectDeselected();
  });
  await page.waitForTimeout(500);

  console.log('Testing Georeference Panel features...');
  
  // 1. Check initial loaded model georeference status (Duplex.ifc has no georeference info)
  const initialStatusText = await page.locator('#geoStatusText').innerText();
  console.log(`Initial georeference status text: "${initialStatusText}"`);
  if (!initialStatusText.includes('This file is not georeferenced yet.')) {
    console.error('FAIL: Status should indicate model is not georeferenced yet.');
    process.exit(1);
  }

  // Check inputs are disabled
  const eastingDisabled = await page.locator('#geoEasting').getAttribute('disabled');
  const northingDisabled = await page.locator('#geoNorthing').getAttribute('disabled');
  const trueNorthDisabled = await page.locator('#geoTrueNorth').getAttribute('disabled');
  const epsgDisabled = await page.locator('#geoEPSG').getAttribute('disabled');
  const verticalDatumDisabled = await page.locator('#geoVerticalDatum').getAttribute('disabled');
  console.log(`Initial input disabled status: Easting=${eastingDisabled}, Northing=${northingDisabled}, TrueNorth=${trueNorthDisabled}, EPSG=${epsgDisabled}, VerticalDatum=${verticalDatumDisabled}`);
  if (eastingDisabled === null || northingDisabled === null || trueNorthDisabled === null || epsgDisabled === null || verticalDatumDisabled === null) {
    console.error('FAIL: Inputs should be disabled initially.');
    process.exit(1);
  }

  // 2. Click Edit button
  console.log('Clicking "Edit Georeference" button to unlock...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  // Check button text changes to Apply Georeference
  const editBtnText = await page.locator('#btnEditGeoreference').innerText();
  console.log(`Button text after edit click: "${editBtnText}"`);
  if (!editBtnText.includes('Apply Georeference')) {
    console.error('FAIL: Button should change to Apply Georeference.');
    process.exit(1);
  }

  // Check inputs are enabled
  const eastingDisabledAfter = await page.locator('#geoEasting').getAttribute('disabled');
  const epsgDisabledAfter = await page.locator('#geoEPSG').getAttribute('disabled');
  const verticalDatumDisabledAfter = await page.locator('#geoVerticalDatum').getAttribute('disabled');
  console.log(`Input disabled after Edit click: Easting=${eastingDisabledAfter}, EPSG=${epsgDisabledAfter}, VerticalDatum=${verticalDatumDisabledAfter}`);
  if (eastingDisabledAfter !== null || epsgDisabledAfter !== null || verticalDatumDisabledAfter !== null) {
    console.error('FAIL: Inputs should be enabled in edit mode.');
    process.exit(1);
  }

  // 3. Fill in dummy coordinates
  console.log('Filling in georeference coordinates...');
  await page.locator('#geoEasting').fill('123456.78');
  await page.locator('#geoNorthing').fill('9876543.21');
  await page.locator('#geoTrueNorth').fill('15.5');
  await page.locator('#geoEPSG').fill('EPSG:32631');
  await page.locator('#geoVerticalDatum').fill('EPSG:5111');
  
  // 4. Click Apply
  console.log('Clicking "Apply Georeference" button...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  // Check status and values
  const appliedStatusText = await page.locator('#geoStatusText').innerText();
  console.log(`Status text after apply: "${appliedStatusText}"`);
  if (!appliedStatusText.includes('Georeferenced manually.')) {
    console.error('FAIL: Status should indicate manual georeferencing.');
    process.exit(1);
  }

  const savedEasting = await page.locator('#geoEasting').inputValue();
  const savedNorthing = await page.locator('#geoNorthing').inputValue();
  const savedTrueNorth = await page.locator('#geoTrueNorth').inputValue();
  const savedEPSG = await page.locator('#geoEPSG').inputValue();
  const savedVerticalDatum = await page.locator('#geoVerticalDatum').inputValue();
  console.log(`Applied values: Easting=${savedEasting}, Northing=${savedNorthing}, TrueNorth=${savedTrueNorth}, EPSG=${savedEPSG}, VerticalDatum=${savedVerticalDatum}`);
  if (savedEasting !== '123456.78' || savedNorthing !== '9876543.21' || savedTrueNorth !== '15.5' || savedEPSG !== 'EPSG:32631' || savedVerticalDatum !== 'EPSG:5111') {
    console.error('FAIL: Saved values do not match inputs.');
    process.exit(1);
  }

  // Check inputs are disabled again
  const eastingDisabledFinal = await page.locator('#geoEasting').getAttribute('disabled');
  const epsgDisabledFinal = await page.locator('#geoEPSG').getAttribute('disabled');
  const verticalDatumDisabledFinal = await page.locator('#geoVerticalDatum').getAttribute('disabled');
  if (eastingDisabledFinal === null || epsgDisabledFinal === null || verticalDatumDisabledFinal === null) {
    console.error('FAIL: Inputs should be locked after Apply.');
    process.exit(1);
  }

  console.log('Testing Cesium Globe activation controls...');
  
  // 1. Verify "btnToggleCesium" button is enabled after model is loaded
  const toggleBtnDisabled = await page.locator('#btnToggleCesium').getAttribute('disabled');
  console.log(`Cesium Toggle button disabled status: ${toggleBtnDisabled}`);
  if (toggleBtnDisabled !== null) {
    console.error('FAIL: Cesium toggle button should be enabled after model load.');
    process.exit(1);
  }

  // 2. Clear georeference inputs and apply empty values (to trigger validation checks)
  console.log('Clicking "Edit Georeference" to clear fields...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  console.log('Clearing georeference values...');
  await page.locator('#geoEasting').fill('');
  await page.locator('#geoNorthing').fill('');
  
  console.log('Clicking "Apply Georeference" with empty fields...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  // Attempt to activate Cesium globe (should show warning and not load container)
  console.log('Clicking "Activate Cesium Globe" button with missing coordinates...');
  await page.locator('#btnToggleCesium').click();
  await page.waitForTimeout(300);

  const statusTextAfterFail = await page.locator('#statusMessage').innerText();
  console.log(`Status message after empty activation: "${statusTextAfterFail}"`);
  if (!statusTextAfterFail.includes('Please configure georeference coordinates first.')) {
    console.error('FAIL: Status should indicate coordinates must be configured.');
    process.exit(1);
  }

  const containerDisplayAfterFail = await page.locator('#cesiumContainer').evaluate(el => window.getComputedStyle(el).display);
  console.log(`Cesium container display after failed activation: "${containerDisplayAfterFail}"`);
  if (containerDisplayAfterFail !== 'none') {
    console.error('FAIL: Cesium container should remain hidden.');
    process.exit(1);
  }

  // 3. Configure valid coordinates and try again
  console.log('Clicking "Edit Georeference" to fill coordinate values...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  await page.locator('#geoEasting').fill('500000');
  await page.locator('#geoNorthing').fill('5000000');
  await page.locator('#geoTrueNorth').fill('45');
  await page.locator('#geoEPSG').fill('EPSG:32631');
  await page.locator('#geoVerticalDatum').fill('100');

  console.log('Clicking "Apply Georeference" to save coordinates...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  // Activate Cesium globe (should succeed)
  console.log('Clicking "Activate Cesium Globe" button with valid coordinates...');
  await page.locator('#btnToggleCesium').click();
  
  // Wait up to 10s for Cesium widgets to initialize
  console.log('Waiting for Cesium viewer canvas to load...');
  let cesiumLoaded = false;
  for (let i = 0; i < 20; i++) {
    const isVisible = await page.locator('#cesiumContainer').evaluate(el => window.getComputedStyle(el).display === 'block');
    const hasCanvas = await page.locator('#cesiumContainer canvas').count() > 0;
    if (isVisible && hasCanvas) {
      console.log('Cesium viewer canvas load verified.');
      cesiumLoaded = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!cesiumLoaded) {
    console.error('FAIL: Cesium viewer failed to load canvas inside the container.');
    process.exit(1);
  }

  // Check toggle button state matches active state
  const activeBtnText = await page.locator('#btnToggleCesium').innerText();
  console.log(`Toggle button text when active: "${activeBtnText}"`);
  if (!activeBtnText.includes('Deactivate Cesium Globe')) {
    console.error('FAIL: Button text should toggle to Deactivate.');
    process.exit(1);
  }

  // 4. Deactivate Cesium globe
  console.log('Clicking "Deactivate Cesium Globe" button...');
  await page.locator('#btnToggleCesium').click();
  await page.waitForTimeout(300);

  const containerDisplayFinal = await page.locator('#cesiumContainer').evaluate(el => window.getComputedStyle(el).display);
  console.log(`Cesium container display after deactivation: "${containerDisplayFinal}"`);
  if (containerDisplayFinal !== 'none') {
    console.error('FAIL: Cesium container should be hidden.');
    process.exit(1);
  }

  console.log('Testing Multi-Model Append features...');

  // 1. Verify append toggle checkbox is unchecked by default
  const isAppendChecked = await page.locator('#chkAppendModel').isChecked();
  console.log(`Initial append model checkbox state: ${isAppendChecked}`);
  if (isAppendChecked !== false) {
    console.error('FAIL: Append checkbox should be unchecked by default.');
    process.exit(1);
  }

  // 2. Check the append checkbox
  console.log('Checking "Append model" checkbox...');
  await page.locator('#chkAppendModel').evaluate(el => {
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);

  // 3. Load the Demo House model again (which will append it)
  console.log('Clicking "Load Demo House IFC" to append a second model...');
  await page.locator('#btnLoadDemo').click();

  // Wait for the second model to load
  let secondModelLoaded = false;
  for (let i = 0; i < 60; i++) {
    const statusText = await page.locator('#statusMessage').innerText();
    if (statusText.includes('Model loaded successfully')) {
      const modelCount = await page.evaluate(() => {
        return window.loadedModels.length;
      });
      if (modelCount === 2) {
        console.log(`Second model load verified: "${statusText}"`);
        secondModelLoaded = true;
        break;
      }
    }
    await page.waitForTimeout(500);
  }

  if (!secondModelLoaded) {
    console.error('FAIL: Second model failed to append in time.');
    process.exit(1);
  }

  // 4. Verify Model Tree renders multiple top-level root model nodes
  const modelRootNodesCount = await page.locator('#treeContainer .model-root-node').count();
  console.log(`Number of model root nodes in Tree: ${modelRootNodesCount}`);
  if (modelRootNodesCount !== 2) {
    console.error('FAIL: Tree should display exactly 2 model root nodes in append mode.');
    process.exit(1);
  }

  // Verify model names in tree label
  const modelNames = await page.locator('#treeContainer .model-root-node .tree-label').evaluateAll(els => els.map(el => el.innerText));
  console.log(`Model root labels in tree: [${modelNames.join(', ')}]`);
  if (modelNames[0] !== 'Duplex.ifc' || modelNames[1] !== 'Duplex.ifc') {
    console.error('FAIL: Model root labels should correspond to the loaded filenames.');
    process.exit(1);
  }

  // 5. Verify the Georeference dropdown model list is visible and has 2 options
  const isGeoSelectGroupVisible = await page.locator('#geoModelSelectGroup').isVisible();
  console.log(`Georeference model dropdown group visible: ${isGeoSelectGroupVisible}`);
  if (!isGeoSelectGroupVisible) {
    console.error('FAIL: Georeference model select group should be visible when multiple models are loaded.');
    process.exit(1);
  }

  const geoModelSelectOptionsCount = await page.locator('#geoModelSelect option').count();
  console.log(`Number of options in Georeference model dropdown: ${geoModelSelectOptionsCount}`);
  if (geoModelSelectOptionsCount !== 2) {
    console.error('FAIL: Georeference model dropdown should have 2 options.');
    process.exit(1);
  }

  // 6. Test switching selection in Georeference dropdown updates values
  // Edit the second model's coordinates
  console.log('Switching georeference dropdown to second model...');
  const secondModelId = await page.evaluate(() => {
    return window.loadedModels[1].id;
  });
  await page.locator('#geoModelSelect').selectOption(secondModelId);
  await page.waitForTimeout(300);

  console.log('Clicking "Edit Georeference" to edit second model coordinates...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(300);

  console.log('Filling in different coordinates for the second model...');
  await page.locator('#geoEasting').fill('999999.99');
  await page.locator('#geoNorthing').fill('8888888.88');
  await page.locator('#geoTrueNorth').fill('90.0');

  console.log('Applying georeference...');
  await page.locator('#btnEditGeoreference').click();
  await page.waitForTimeout(500);

  // Check the values are saved for the second model
  const secondModelEasting = await page.locator('#geoEasting').inputValue();
  console.log(`Second model applied Easting: ${secondModelEasting}`);
  if (secondModelEasting !== '999999.99') {
    console.error('FAIL: Georeference coordinates were not saved for the second model.');
    process.exit(1);
  }

  // Switch back to the first model and verify its coordinates are different
  const firstModelId = await page.evaluate(() => {
    return window.loadedModels[0].id;
  });
  console.log('Switching georeference dropdown back to first model...');
  await page.locator('#geoModelSelect').selectOption(firstModelId);
  await page.waitForTimeout(500);

  const firstModelEasting = await page.locator('#geoEasting').inputValue();
  console.log(`First model applied Easting: ${firstModelEasting}`);
  if (firstModelEasting !== '500000') {
    console.error('FAIL: First model georeference coordinates should remain unchanged.');
    process.exit(1);
  }

  // Reset append checkbox for clean state
  await page.locator('#chkAppendModel').evaluate(el => {
    el.checked = false;
    el.dispatchEvent(new Event('change'));
  });

  console.log('Testing Measurement Toolbar & Spot Elevation features...');

  // 1. Verify toolbar exists
  const isToolbarVisible = await page.locator('#measurementToolbar').isVisible();
  console.log(`Measurement toolbar visible: ${isToolbarVisible}`);
  if (!isToolbarVisible) {
    console.error('FAIL: Measurement toolbar should be visible.');
    process.exit(1);
  }

  // 2. Click Distance button and check active state
  console.log('Clicking "Distance" button...');
  await page.locator('#btnMeasureDistance').click();
  await page.waitForTimeout(300);

  const activeClass = await page.locator('#btnMeasureDistance').getAttribute('class');
  console.log(`Distance button class: "${activeClass}"`);
  if (!activeClass.includes('active')) {
    console.error('FAIL: Distance button should have active state styling.');
    process.exit(1);
  }

  // 3. Check Snap toggle
  console.log('Toggling Snap checkbox...');
  const initialSnap = await page.locator('#chkMeasurementSnap').isChecked();
  console.log(`Initial snap checkbox state: ${initialSnap}`);
  await page.locator('#chkMeasurementSnap').click();
  const toggledSnap = await page.locator('#chkMeasurementSnap').isChecked();
  console.log(`Snap state after click: ${toggledSnap}`);
  if (toggledSnap === initialSnap) {
    console.error('FAIL: Snap checkbox state did not toggle.');
    process.exit(1);
  }
  // Toggle it back to true
  await page.locator('#chkMeasurementSnap').click();

  // 4. Test Spot Elevation placement
  console.log('Clicking "Spot Elevation" button...');
  await page.locator('#btnSpotElevation').click();
  await page.waitForTimeout(300);

  console.log('Clicking on the canvas to place a spot elevation tag...');
  const canvasBox = await page.locator('#myCanvas').boundingBox();
  if (canvasBox) {
    const clickX = canvasBox.x + canvasBox.width / 2;
    const clickY = canvasBox.y + canvasBox.height / 2;
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(500);

    const markerCount = await page.locator('#elevationOverlay .spot-elevation-marker').count();
    console.log(`Spot elevation markers placed: ${markerCount}`);
    if (markerCount === 0) {
      console.error('FAIL: Spot elevation marker should be placed on click.');
      process.exit(1);
    }

    const elevText = await page.locator('#elevationOverlay .spot-elevation-tag').first().innerText();
    console.log(`Placed elevation tag text: "${elevText}"`);
    if (!elevText.includes('EL:')) {
      console.error('FAIL: Spot elevation tag does not display elevation text.');
      process.exit(1);
    }
  }

  // 5. Test Area Drawing and calculation
  console.log('Clicking "Area" button...');
  await page.locator('#btnMeasureArea').click();
  await page.waitForTimeout(300);

  console.log('Clicking four points to define a polygon and double-clicking to close...');
  if (canvasBox) {
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;

    await page.mouse.click(cx - 60, cy - 60);
    await page.waitForTimeout(300);
    await page.mouse.click(cx + 60, cy - 60);
    await page.waitForTimeout(300);
    await page.mouse.click(cx + 60, cy + 60);
    await page.waitForTimeout(300);
    // Double click near starting point to close
    await page.mouse.dblclick(cx - 60, cy + 60);
    await page.waitForTimeout(600);

    const polygonCount = await page.locator('#measurementOverlay .area-svg-polygon').count();
    const areaTextCount = await page.locator('#measurementOverlay .area-svg-text').count();
    console.log(`Finalized SVG Area polygons: ${polygonCount}, texts: ${areaTextCount}`);
    if (polygonCount === 0 || areaTextCount === 0) {
      console.error('FAIL: Area polygon was not finalized and drawn inside SVG overlay.');
      process.exit(1);
    }

    const areaLabel = await page.locator('#measurementOverlay .area-svg-text').first().textContent();
    console.log(`Calculated area tag label: "${areaLabel}"`);
    if (!areaLabel.includes('m²')) {
      console.error('FAIL: Area label should show value in square meters (m²).');
      process.exit(1);
    }
  }

  // 5b. Test Multiline Distance drawing and calculation
  console.log('Clicking "Multiline" button...');
  await page.locator('#btnMeasureMultiline').click();
  await page.waitForTimeout(300);

  const activeMultilineClass = await page.locator('#btnMeasureMultiline').getAttribute('class');
  console.log(`Multiline button class: "${activeMultilineClass}"`);
  if (!activeMultilineClass.includes('active')) {
    console.error('FAIL: Multiline button should have active state styling.');
    process.exit(1);
  }

  console.log('Clicking three points to define a multiline path and double-clicking to close...');
  if (canvasBox) {
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;

    await page.mouse.click(cx - 80, cy - 80);
    await page.waitForTimeout(300);
    await page.mouse.click(cx + 80, cy - 80);
    await page.waitForTimeout(300);
    // Double click to close
    await page.mouse.dblclick(cx + 80, cy + 80);
    await page.waitForTimeout(600);

    const pathCount = await page.locator('#measurementOverlay .multiline-svg-line').count();
    const totalTextCount = await page.locator('#measurementOverlay .multiline-svg-text-total').count();
    console.log(`Finalized SVG Multiline lines: ${pathCount}, total text labels: ${totalTextCount}`);
    if (pathCount === 0 || totalTextCount === 0) {
      console.error('FAIL: Multiline path was not finalized and drawn inside SVG overlay.');
      process.exit(1);
    }

    const multilineLabel = await page.locator('#measurementOverlay .multiline-svg-text-total').first().textContent();
    console.log(`Calculated multiline total distance label: "${multilineLabel}"`);
    if (!multilineLabel.includes('Total:')) {
      console.error('FAIL: Multiline label should show running total value.');
      process.exit(1);
    }
  }

  // 6. Test Clear measurements button
  console.log('Clicking "Clear" button to clean up all measurements...');
  await page.evaluate(() => {
    document.getElementById('btnClearMeasurements').click();
  });
  await page.waitForTimeout(500);

  const markerCountAfter = await page.locator('#elevationOverlay .spot-elevation-marker').count();
  const polygonCountAfter = await page.locator('#measurementOverlay .area-svg-polygon').count();
  const multilineCountAfter = await page.locator('#measurementOverlay .multiline-svg-line').count();
  console.log(`After clear: spot elevations count = ${markerCountAfter}, areas count = ${polygonCountAfter}, multilines count = ${multilineCountAfter}`);
  if (markerCountAfter !== 0 || polygonCountAfter !== 0 || multilineCountAfter !== 0) {
    console.error('FAIL: Cleared measurements should be removed from viewport.');
    process.exit(1);
  }

  console.log('Closing browser.');
  await browser.close();
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
