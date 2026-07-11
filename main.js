import { 
  Viewer, 
  XKTLoaderPlugin, 
  WebIFCLoaderPlugin, 
  IFCOpenShellLoaderPlugin, 
  LASLoaderPlugin,
  GLTFLoaderPlugin,
  NavCubePlugin, 
  SectionPlanesPlugin, 
  DistanceMeasurementsPlugin,
  DistanceMeasurementsMouseControl,
  AngleMeasurementsPlugin,
  AngleMeasurementsMouseControl,
  PointerLens,
  math 
} from "./lib/xeokit/xeokit-sdk.min.es.js";

import * as WebIFC from "https://cdn.jsdelivr.net/npm/web-ifc@0.0.51/web-ifc-api.js";

// --- Global UI State ---
let viewer;
let xktLoader;
let lasLoader = null;
let gltfLoader = null;
let pendingGeoreference = null;
let webIfcLoader = null;
let ifcOpenShellLoader = null;
let sectionPlanes = null;
let activeModel = null;
let activeMetaModel = null;
let activeMetaObject = null;
let activeElementId = null;
const localFileBufferMap = {};

// Multi-model support variables
let loadedModels = [];
window.loadedModels = loadedModels;
let selectedGeoModelId = null;

// Measurement system state
let distanceMeasurements = null;
let distanceControl = null;
let angleMeasurements = null;
let angleControl = null;

let activeMeasurementMode = null; // null, 'distance', 'angle', 'area', 'spotelev', 'multiline'
let areaPoints = []; // [{x, y, z}]
let finalizedAreas = []; // [{ vertices, areaValue, svgGroup }]
let spotElevations = []; // [{ worldPos, element, textNode }]
let multilinePoints = []; // [{x, y, z}]
let finalizedMultilines = []; // [{ vertices, totalDistance, svgGroup, pathElement, segmentTextElements, totalTextElement, vertexElements }]

let clickToAddPlaneEnabled = false;
let webIfcInitialized = false;

// Store converted XKT in memory for download
let convertedXktBuffer = null;
let convertedXktName = "";

// Get UI Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfoBar = document.getElementById('fileInfoBar');
const fileNameSpan = document.getElementById('fileName');
const loaderRadios = document.getElementsByName('ifcEngine');
const convertToXktOpt = document.getElementById('convertToXktOpt');
const btnDownloadXkt = document.getElementById('btnDownloadXkt');
const btnLoadDemo = document.getElementById('btnLoadDemo');

const btnAddPlaneInteractive = document.getElementById('btnAddPlaneInteractive');
const btnAddPlaneCenter = document.getElementById('btnAddPlaneCenter');
const chkShowGizmos = document.getElementById('chkShowGizmos');
const btnClearPlanes = document.getElementById('btnClearPlanes');

const propertySearch = document.getElementById('propertySearch');
const btnClearSearch = document.getElementById('btnClearSearch');
const filterResultCount = document.getElementById('filterResultCount');

const noSelectionPrompt = document.getElementById('noSelectionPrompt');
const propertiesContent = document.getElementById('propertiesContent');
const propObjName = document.getElementById('propObjName');
const propObjType = document.getElementById('propObjType');
const propObjId = document.getElementById('propObjId');
const btnSelectSimilar = document.getElementById('btnSelectSimilar');
const propertySetsContainer = document.getElementById('propertySetsContainer');

const loadingOverlay = document.getElementById('loadingOverlay');
const loaderTitle = document.getElementById('loaderTitle');
const loaderMessage = document.getElementById('loaderMessage');
const progressBarFill = document.getElementById('progressBarFill');
const progressBarText = document.getElementById('progressBarText');
const planePlacementPrompt = document.getElementById('planePlacementPrompt');
const statusBar = document.getElementById('statusBar');
const statusMessage = document.getElementById('statusMessage');

// --- Phase 2 Variables ---
let modelProperties = {};
let availableQuantities = [];

// --- Revit (xeoRvt) metadata storage ---
// Maps modelId -> xeoRvt metadata JSON { Elements, ParameterGroups, Parameters, Units }
const revitMetadataMap = {};

// --- Georeference Variables & State ---
let activeGeoreference = null;
let isEditingGeoreference = false;

// --- Cesium & Proj4 state ---
let isCesiumActive = false;
let cesiumViewer = null;
let cesiumTickUnsubscribe = null;

// Phase 2 UI elements
const filterPropName = document.getElementById('filterPropName');
const filterOperator = document.getElementById('filterOperator');
const filterPropVal = document.getElementById('filterPropVal');
const btnApplyPropFilter = document.getElementById('btnApplyPropFilter');
const btnResetPropFilter = document.getElementById('btnResetPropFilter');

const btnOpenQto = document.getElementById('btnOpenQto');
const qtoModal = document.getElementById('qtoModal');
const btnCloseQto = document.getElementById('btnCloseQto');
const qtoSearch = document.getElementById('qtoSearch');
const btnExportCsv = document.getElementById('btnExportCsv');
const qtoTableBody = document.getElementById('qtoTableBody');
const qtoSummaryText = document.getElementById('qtoSummaryText');

// Hide/Unhide visibility controls
const btnShowAllGlobal = document.getElementById('btnShowAllGlobal');
const btnHideObject = document.getElementById('btnHideObject');
const btnIsolateObject = document.getElementById('btnIsolateObject');
const btnXrayObject = document.getElementById('btnXrayObject');

// Georeference UI elements
const geoEasting = document.getElementById('geoEasting');
const geoNorthing = document.getElementById('geoNorthing');
const geoTrueNorth = document.getElementById('geoTrueNorth');
const geoEPSG = document.getElementById('geoEPSG');
const geoVerticalDatum = document.getElementById('geoVerticalDatum');
const geoCesiumToken = document.getElementById('geoCesiumToken');
const geoStatusText = document.getElementById('geoStatusText');
const btnEditGeoreference = document.getElementById('btnEditGeoreference');
const btnToggleCesium = document.getElementById('btnToggleCesium');
const cesiumContainer = document.getElementById('cesiumContainer');

// Model Tree elements
const modelTreeSection = document.getElementById('modelTreeSection');
const treeContainer = document.getElementById('treeContainer');

// Multi-model elements
const chkAppendModel = document.getElementById('chkAppendModel');
const geoModelSelect = document.getElementById('geoModelSelect');
const geoModelSelectGroup = document.getElementById('geoModelSelectGroup');

// --- Initialize Viewer ---
function initViewer() {
  viewer = new Viewer({
    canvasId: "myCanvas",
    transparent: true,
    saoEnabled: true,
    numCachedSectionPlanes: 4
  });
  window.viewer = viewer;

  // Position camera
  viewer.camera.eye = [-15, 12, 30];
  viewer.camera.look = [0, 2, 0];
  viewer.camera.up = [0, 1, 0];

  viewer.cameraControl.followPointer = true;

  // Add NavCube
  new NavCubePlugin(viewer, {
    canvasId: "myNavCubeCanvas",
    visible: true,
    size: 130,
    alignment: "bottomRight",
    bottomMargin: 50,
    rightMargin: 20
  });

  // Setup loaders
  xktLoader = new XKTLoaderPlugin(viewer);
  lasLoader = new LASLoaderPlugin(viewer, {
    dataSource: {
      getLAS: function (src, ok, error) {
        const key = src.split('.')[0];
        const buffer = localFileBufferMap[key];
        if (buffer) {
          ok(buffer);
          delete localFileBufferMap[key];
        } else {
          error(`File buffer not found for source: ${src}`);
        }
      }
    }
  });
  gltfLoader = new GLTFLoaderPlugin(viewer);
  sectionPlanes = new SectionPlanesPlugin(viewer);

  // Bind click listener for single-click selection
  viewer.cameraControl.on("picked", (pickResult) => {
    if (activeMeasurementMode) return; // Prevent selection when measuring
    if (pickResult && pickResult.entity && pickResult.entity.isObject) {
      handleObjectSelected(pickResult.entity);
    } else {
      handleObjectDeselected();
    }
  });

  viewer.cameraControl.on("pickedNothing", () => {
    if (activeMeasurementMode) return; // Prevent deselection when measuring
    handleObjectDeselected();
  });

  // Bind double-click listener to toggle highlight (Feature 6)
  viewer.scene.input.on("dblclick", (canvasCoords) => {
    if (activeMeasurementMode) return; // Prevent highlight when measuring
    const pickResult = viewer.scene.pick({
      canvasPos: canvasCoords
    });
    if (pickResult && pickResult.entity && pickResult.entity.isObject) {
      const entity = pickResult.entity;
      entity.highlighted = !entity.highlighted;
      updateStatus(`Toggled highlight on object: ${entity.id}`);
    } else {
      // Clicked background, clear all highlights
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
      updateStatus("Cleared all highlights");
    }
  });

  // Handle canvas click to place plane (Feature 5)
  viewer.scene.input.on("mouseclicked", (coords) => {
    if (activeMeasurementMode) return; // Prevent section cut when measuring
    if (!clickToAddPlaneEnabled) return;

    const pickResult = viewer.scene.pick({
      canvasPos: coords,
      pickSurface: true
    });

    if (pickResult && pickResult.worldNormal) {
      if (pickResult.entity && !pickResult.entity.isObject) {
        return;
      }

      const id = `plane-click-${Date.now()}`;
      const plane = sectionPlanes.createSectionPlane({
        id: id,
        pos: pickResult.worldPos,
        dir: math.mulVec3Scalar(pickResult.worldNormal, -1) // cut pointing inward
      });

      if (chkShowGizmos.checked) {
        sectionPlanes.showControl(plane.id);
      }

      clickToAddPlaneEnabled = false;
      planePlacementPrompt.style.display = "none";
      updateStatus("Section cut plane placed on clicked surface.");
    }
  });

  // Initialize the measurement system
  initMeasurementSystem();
}

// --- Loading Status Indicators ---
function showLoader(title, message, progress = 0) {
  loaderTitle.innerText = title;
  loaderMessage.innerText = message;
  progressBarFill.style.width = `${progress}%`;
  progressBarText.innerText = `${Math.round(progress)}%`;
  loadingOverlay.style.display = "flex";
}

function updateLoaderProgress(progress, text = null) {
  progressBarFill.style.width = `${progress}%`;
  progressBarText.innerText = `${Math.round(progress)}%`;
  if (text) {
    loaderMessage.innerText = text;
  }
}

function hideLoader() {
  loadingOverlay.style.display = "none";
}

function updateStatus(msg, isError = false) {
  statusMessage.innerHTML = isError 
    ? `<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i> ${msg}`
    : `<i class="fa-solid fa-circle-info"></i> ${msg}`;
}

// --- Setup Pyodide for IfcOpenShell (Feature 2) ---
let pyodide = null;
let ifcopenshell = null;
let ifcopenshell_geom = null;

async function initIfcOpenShell() {
  if (ifcopenshell && ifcopenshell_geom) return;

  showLoader("Initializing IfcOpenShell", "Loading Python WASM (Pyodide)...", 10);
  pyodide = await loadPyodide();
  
  updateLoaderProgress(35, "Loading Numpy, Shapely and Micropip...");
  await pyodide.loadPackage("micropip");
  await pyodide.loadPackage("numpy");
  await pyodide.loadPackage("shapely");
  
  updateLoaderProgress(60, "Downloading IfcOpenShell WASM Wheel...");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("typing-extensions");
  await micropip.install("https://ifcopenshell.github.io/wasm-wheels/ifcopenshell-0.8.3+34a1bc6-cp313-cp313-emscripten_4_0_9_wasm32.whl");
  
  updateLoaderProgress(85, "Importing IfcOpenShell modules...");
  ifcopenshell = pyodide.pyimport('ifcopenshell');
  ifcopenshell_geom = pyodide.pyimport('ifcopenshell.geom');
  const settings = ifcopenshell_geom.settings();
  settings.set(settings.WELD_VERTICES, false);

  ifcOpenShellLoader = new IFCOpenShellLoaderPlugin(viewer, {
    ifcopenshell,
    ifcopenshell_geom
  });

  updateLoaderProgress(100, "IfcOpenShell Ready!");
}

// --- Setup WebIFC Loader ---
async function initWebIfc() {
  if (webIfcInitialized) return;
  
  showLoader("Initializing web-ifc", "Loading WASM modules...", 30);
  const IfcAPI = new WebIFC.IfcAPI();
  IfcAPI.SetWasmPath("https://cdn.jsdelivr.net/npm/web-ifc@0.0.51/");
  await IfcAPI.Init();
  
  webIfcLoader = new WebIFCLoaderPlugin(viewer, {
    WebIFC,
    IfcAPI
  });
  
  webIfcInitialized = true;
  updateLoaderProgress(100, "web-ifc WASM Ready!");
}

// --- Load Model Router ---
async function loadModel(file, convertToXkt = false) {
  const appendMode = chkAppendModel && chkAppendModel.checked;

  if (!appendMode) {
    // Reset georeference state and loadedModels list
    activeGeoreference = null;
    isEditingGeoreference = false;
    selectedGeoModelId = null;
    
    // Deactivate Cesium globe
    isCesiumActive = false;
    if (cesiumContainer) {
      cesiumContainer.style.display = "none";
    }
    
    // Destroy all existing models
    loadedModels.forEach(item => item.model.destroy());
    loadedModels.length = 0;
    updateToolDropdowns();
    clearAllMeasurements();
    
    // Reset Model Tree
    if (modelTreeSection) {
      modelTreeSection.style.display = "none";
      treeContainer.innerHTML = "";
    }
    
    // Reset georeference dropdown & inputs
    if (geoEasting) {
      geoEasting.value = "";
      geoNorthing.value = "";
      geoTrueNorth.value = "";
      geoEPSG.value = "";
      geoVerticalDatum.value = "";
      geoEasting.disabled = true;
      geoNorthing.disabled = true;
      geoTrueNorth.disabled = true;
      geoEPSG.disabled = true;
      geoVerticalDatum.disabled = true;
      geoStatusText.innerText = "No model loaded.";
      geoStatusText.classList.add('no-geo');
      btnEditGeoreference.disabled = true;
      btnEditGeoreference.innerHTML = '<i class="fa-solid fa-lock"></i> Edit Georeference';
      btnEditGeoreference.className = 'btn btn-secondary btn-full';
      
      btnToggleCesium.disabled = true;
      btnToggleCesium.innerHTML = '<i class="fa-solid fa-earth-americas"></i> Activate Cesium Globe';
      btnToggleCesium.className = 'btn btn-secondary btn-full';
      
      geoModelSelectGroup.style.display = "none";
      geoModelSelect.innerHTML = "";
    }
  }

  // Clear active selections
  handleObjectDeselected();
  if (!appendMode) {
    sectionPlanes.clear();
  }

  const fileExt = file.name.split('.').pop().toLowerCase();
  const modelId = "model-" + Date.now();
  
  if (fileExt === 'xkt') {
    // Directly load XKT file
    showLoader("Loading XKT Model", "Reading local file into memory...", 10);
    const reader = new FileReader();
    reader.onload = (e) => {
      updateLoaderProgress(50, "Parsing geometry representation...");
      try {
        const arrayBuffer = e.target.result;
        activeModel = xktLoader.load({
          id: modelId,
          xkt: arrayBuffer,
          edges: true,
          dtxEnabled: true
        });
        setupModelLoadedListener(modelId, file);
      } catch (err) {
        hideLoader();
        updateStatus(`Failed to load XKT: ${err.message}`, true);
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (fileExt === 'ifc') {
    if (convertToXkt) {
      // Feature 1: IFC to XKT Conversion via Backend
      showLoader("Converting IFC to XKT", "Uploading IFC file to server...", 10);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('/api/convert', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Conversion failed on backend');
        }

        updateLoaderProgress(60, "Streaming converted XKT file...");
        const arrayBuffer = await response.arrayBuffer();
        
        // Cache for download
        convertedXktBuffer = arrayBuffer;
        convertedXktName = file.name.replace(/\.ifc$/i, '.xkt');
        btnDownloadXkt.disabled = false;

        updateLoaderProgress(85, "Rendering converted model...");
        activeModel = xktLoader.load({
          id: modelId,
          xkt: arrayBuffer,
          edges: true,
          dtxEnabled: true
        });
        setupModelLoadedListener(modelId, file);
      } catch (err) {
        hideLoader();
        updateStatus(`XKT Conversion failed: ${err.message}`, true);
      }
    } else {
      // Load IFC directly in browser
      const engine = document.querySelector('input[name="ifcEngine"]:checked').value;
      
      if (engine === 'web-ifc') {
        // Option 1: Load via web-ifc
        await initWebIfc();
        showLoader("Parsing IFC", "Reading file via web-ifc (WASM)...", 10);
        const reader = new FileReader();
        reader.onload = (e) => {
          updateLoaderProgress(50, "Compiling elements & geometry...");
          try {
            const arrayBuffer = e.target.result;
            activeModel = webIfcLoader.load({
              id: modelId,
              ifc: arrayBuffer,
              loadMetadata: true,
              edges: true,
              dtxEnabled: true
            });
            setupModelLoadedListener(modelId, file);
          } catch (err) {
            hideLoader();
            updateStatus(`web-ifc load failed: ${err.message}`, true);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // Option 2: Load via IfcOpenShell (Feature 2)
        await initIfcOpenShell();
        showLoader("Parsing IFC", "Processing file via IfcOpenShell (Python)...", 10);
        const reader = new FileReader();
        reader.onload = async (e) => {
          updateLoaderProgress(50, "Running IfcOpenShell geom iterator...");
          try {
            const text = e.target.result;
            activeModel = await ifcOpenShellLoader.load({
              id: modelId,
              text: text,
              loadMetadata: true,
              edges: true,
              saoEnabled: true,
              dtxEnabled: true
            });
            setupModelLoadedListener(modelId, file);
          } catch (err) {
            hideLoader();
            updateStatus(`IfcOpenShell load failed: ${err.message}`, true);
          }
        };
        reader.readAsText(file);
      }
    }
  } else if (fileExt === 'las' || fileExt === 'laz') {
    showLoader("Loading Point Cloud", "Reading LAS/LAZ file into memory...", 10);
    const reader = new FileReader();
    reader.onload = (e) => {
      updateLoaderProgress(50, "Parsing LiDAR coordinates...");
      try {
        const arrayBuffer = e.target.result;
        localFileBufferMap[modelId] = arrayBuffer;
        
        const skipInput = document.getElementById('pointSkip');
        const skipValue = skipInput ? parseInt(skipInput.value) || 5 : 5;
        
        activeModel = lasLoader.load({
          id: modelId,
          src: modelId + (fileExt === 'laz' ? '.laz' : '.las'),
          skip: skipValue
        });
        setupModelLoadedListener(modelId, file);
      } catch (err) {
        hideLoader();
        updateStatus(`Failed to load LAS/LAZ point cloud: ${err.message}`, true);
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (fileExt === 'gltf' || fileExt === 'glb') {
    showLoader("Loading glTF Model", "Reading glTF file into memory...", 10);
    try {
      const blobUrl = URL.createObjectURL(file);
      activeModel = gltfLoader.load({
        id: modelId,
        src: blobUrl + "#" + file.name
      });
      setupModelLoadedListener(modelId, file);
    } catch (err) {
      hideLoader();
      updateStatus(`Failed to load glTF model: ${err.message}`, true);
    }
  }
}

// --- Georeference Extractor Heuristics ---
function extractGeoreference(modelId) {
  let easting = null;
  let northing = null;
  let trueNorth = null;
  let epsg = null;
  let verticalDatum = null;

  if (!viewer.metaScene) return null;

  const metaObjects = viewer.metaScene.metaObjects;
  for (const metaObj of Object.values(metaObjects)) {
    if (metaObj.metaModel && metaObj.metaModel.id !== modelId) {
      continue;
    }
    if (metaObj.propertySets) {
      for (const pset of metaObj.propertySets) {
        if (pset.properties) {
          for (const prop of pset.properties) {
            if (prop.name) {
              const nameLower = prop.name.toLowerCase().trim();
              const val = prop.value;
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                const valStr = String(val).trim();
                
                // Heuristic detection based on property value containing 'EPSG:'
                if (valStr.toUpperCase().includes('EPSG:')) {
                  if (nameLower.includes('vertical') || nameLower === 'verticaldatum') {
                    verticalDatum = valStr;
                  } else {
                    epsg = valStr;
                  }
                }

                // Property name based detection for vertical datum
                if (nameLower === 'verticaldatum' || nameLower === 'vertical datum' || nameLower === 'vertical_datum') {
                  verticalDatum = valStr;
                }

                // Property name based detection for EPSG code
                if (nameLower === 'epsg' || 
                    nameLower === 'epsg code' || 
                    nameLower === 'epsgcode' || 
                    nameLower === 'crs' || 
                    nameLower === 'coordinate reference system' || 
                    nameLower === 'projected crs' || 
                    nameLower === 'projectedcrs' || 
                    nameLower.includes('coordinate system') ||
                    nameLower.includes('mapconversion.projectedcrs') ||
                    nameLower.includes('spatial reference')) {
                  if (!valStr.toUpperCase().includes('EPSG:')) {
                    // Normalize number only EPSG codes (e.g. 7856 -> EPSG:7856)
                    epsg = /^\d+$/.test(valStr) ? `EPSG:${valStr}` : valStr;
                  } else {
                    epsg = valStr;
                  }
                }

                const parsedVal = parseFloat(val);
                if (!isNaN(parsedVal)) {
                  if (nameLower === 'easting' || 
                      nameLower === 'eastings' || 
                      nameLower === 'easting (x)' ||
                      nameLower === 'easting(x)' ||
                      nameLower === 'ref longitude' ||
                      nameLower === 'reflongitude' ||
                      nameLower.includes('location - easting') || 
                      nameLower.includes('project location - easting') || 
                      nameLower.includes('site easting') || 
                      nameLower.includes('mapconversion.eastings')) {
                    easting = parsedVal;
                  }
                  if (nameLower === 'northing' || 
                      nameLower === 'northings' || 
                      nameLower === 'northing (y)' ||
                      nameLower === 'northing(y)' ||
                      nameLower === 'ref latitude' ||
                      nameLower === 'reflatitude' ||
                      nameLower.includes('location - northing') || 
                      nameLower.includes('project location - northing') || 
                      nameLower.includes('site northing') || 
                      nameLower.includes('mapconversion.northings')) {
                    northing = parsedVal;
                  }
                  if (nameLower === 'true north' || 
                      nameLower === 'truenorth' || 
                      nameLower === 'true north angle' || 
                      nameLower === 'truenorthangle' || 
                      nameLower.includes('angle to true north') || 
                      nameLower.includes('project location - true north') || 
                      nameLower.includes('mapconversion.axis') || 
                      nameLower.includes('mapconversion.xaxisabscissa')) {
                    trueNorth = parsedVal;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (easting !== null || northing !== null || trueNorth !== null || epsg !== null || verticalDatum !== null) {
    return { easting, northing, trueNorth, epsg, verticalDatum };
  }
  return null;
}

// --- Unified metadata and properties fetch helper ---
function getElementMetadata(id, modelId) {
  // Try Revit metadata map first
  const revitMeta = revitMetadataMap[modelId];
  if (revitMeta && revitMeta.Elements) {
    const element = revitMeta.Elements.find(e => String(e.Id) === String(id));
    if (element) {
      const props = [];
      if (element.class) {
        props.push({ name: "Revit Class", value: element.class });
      }
      if (element.Name) {
        props.push({ name: "Revit Name", value: element.Name });
      }
      if (element.ParameterGroups) {
        element.ParameterGroups.forEach((gIdx) => {
          const group = revitMeta.ParameterGroups[gIdx];
          if (group && group.Parameters) {
            group.Parameters.forEach((pIdx) => {
              const param = revitMeta.Parameters[pIdx];
              if (param && param.Name) {
                props.push({ name: param.Name, value: param.Value });
              }
            });
          }
        });
      }
      let foundCategory = element.class || "Revit Element";
      const catProp = props.find(p => p.name && p.name.toLowerCase() === "category");
      if (catProp && catProp.value && String(catProp.value).trim() !== "") {
        foundCategory = String(catProp.value).trim();
      }

      return {
        name: element.Name || `Revit Element ${element.Id}`,
        type: element.class || "Revit Element",
        category: foundCategory,
        props: props
      };
    }
  }

  // Try standard IFC metadata next
  if (viewer.metaScene) {
    const metaObj = viewer.metaScene.metaObjects[id];
    if (metaObj) {
      // Extract properties
      const props = [];
      if (metaObj.propertySets) {
        metaObj.propertySets.forEach((pset) => {
          if (pset.properties) {
            pset.properties.forEach((prop) => {
              if (prop.name) {
                props.push({ name: prop.name, value: prop.value });
              }
            });
          }
        });
      }

      // Determine category (using existing heuristics)
      const ifcClass = metaObj.type || "IfcObject";
      let category = "";
      
      if (metaObj.propertySets) {
        for (const pset of metaObj.propertySets) {
          if (pset.properties) {
            const catProp = pset.properties.find(p => p.name === "Category" || p.name.toLowerCase() === "category");
            if (catProp && catProp.value && catProp.value !== "N/A" && String(catProp.value).trim() !== "") {
              category = String(catProp.value).trim();
              break;
            }
          }
        }
      }
      
      if (!category && metaObj.propertySets) {
        for (const pset of metaObj.propertySets) {
          if (pset.properties) {
            const objTypeProp = pset.properties.find(p => p.name === "ObjectType" || p.name === "Object Type" || p.name.toLowerCase() === "objecttype");
            if (objTypeProp && objTypeProp.value && objTypeProp.value !== "N/A" && String(objTypeProp.value).trim() !== "") {
              category = String(objTypeProp.value).trim();
              break;
            }
          }
        }
      }
      
      if (!category && metaObj.propertySets) {
        for (const pset of metaObj.propertySets) {
          if (pset.properties) {
            const preTypeProp = pset.properties.find(p => p.name === "PredefinedType" || p.name === "Predefined Type" || p.name.toLowerCase() === "predefinedtype");
            if (preTypeProp && preTypeProp.value && preTypeProp.value !== "N/A" && String(preTypeProp.value).trim() !== "") {
              category = String(preTypeProp.value).trim();
              break;
            }
          }
        }
      }
      
      if (!category) {
        const rawType = metaObj.type || "IfcObject";
        let cleanType = rawType.startsWith("Ifc") ? rawType.substring(3) : rawType;
        category = cleanType.replace(/([A-Z])/g, ' $1').trim();
      }

      return {
        name: metaObj.name || "Unnamed Object",
        type: ifcClass,
        category: category,
        props: props
      };
    }
  }

  return null;
}

function setupModelLoadedListener(modelId, file) {
  if (!activeModel) return;

  activeModel.on("loaded", () => {
    hideLoader();
    viewer.cameraFlight.jumpTo(activeModel);
    
    const metaModel = viewer.metaScene.metaModels[modelId];
    activeMetaModel = metaModel; // keep for single model backward-compatibility
    
    console.log("Debug: metaModels keys = ", Object.keys(viewer.metaScene.metaModels));
    console.log("Debug: metaObjects size = ", Object.keys(viewer.metaScene.metaObjects).length);
    updateStatus(`Model loaded successfully. Objects: ${activeModel.numEntities}`);
    
    // Clear search filter when a new model is loaded
    propertySearch.value = "";
    btnClearSearch.style.display = "none";
    filterResultCount.innerText = "";

    // --- Parse metadata for Properties and Quantities (QTO) ---
    modelProperties = {};
    availableQuantities = [];
    
    // Clear previous options in filterPropName dropdown
    filterPropName.innerHTML = '<option value="">-- Select Property --</option>';
    
    // Gather all model object IDs (both IFC and Revit models populate viewer.scene.objects)
    const modelObjectIds = Object.values(viewer.scene.objects)
      .filter(obj => obj.model && obj.model.id === modelId)
      .map(obj => obj.id);

    modelObjectIds.forEach((id) => {
      const meta = getElementMetadata(id, modelId);
      if (!meta) return;

      // 1. Gather properties for Advanced Filtering
      meta.props.forEach((prop) => {
        if (!modelProperties[prop.name]) {
          modelProperties[prop.name] = new Set();
        }
        modelProperties[prop.name].add(prop.value);
      });

      // 2. Extract quantities for Quantity Take-Off according to user classification rules
      let qtoAdded = false;

      const tL = (meta.type || "").toLowerCase();
      const nL = (meta.name || "").toLowerCase();
      const cL = (meta.category || "").toLowerCase();

      // Check classification categories
      const isFamilyInstance = (tL === "familyinstance" || cL === "familyinstance") && 
                               !(tL.includes("railing") || cL.includes("railing") || nL.includes("railing"));
      const isStair = tL.includes("stair") || cL.includes("stair") || nL.includes("stair");
      const isConcrete = tL.includes("beam") || tL.includes("column") || tL.includes("slab") || 
                         tL.includes("footing") || tL.includes("foundation") || 
                         cL.includes("beam") || cL.includes("column") || cL.includes("slab") || 
                         cL.includes("footing") || cL.includes("foundation") || 
                         nL.includes("concrete");
      const isLinear = tL.includes("railing") || tL.includes("fence") || tL.includes("flowsegment") || 
                       tL.includes("pipe") || tL.includes("duct") || tL.includes("cable") || 
                       cL.includes("railing") || cL.includes("fence") || cL.includes("pipe") || cL.includes("duct");
      const isAreaBased = tL.includes("wall") || tL.includes("roof") || tL.includes("covering") || 
                          tL.includes("partition") || tL.includes("plate") || 
                          cL.includes("wall") || cL.includes("roof") || cL.includes("covering") || cL.includes("partition");

      const getParamVal = (names) => {
        for (const p of meta.props) {
          if (!p.name) continue;
          const pNameLower = p.name.toLowerCase();
          if (names.some(n => pNameLower === n || pNameLower.includes(n))) {
            const valStr = String(p.value).trim();
            const matchNum = valStr.match(/^[+-]?\d+(\.\d+)?/);
            if (matchNum) {
              return { rawName: p.name, numValue: parseFloat(matchNum[0]) };
            }
          }
        }
        return null;
      };

      if (isFamilyInstance) {
        availableQuantities.push({
          id: id,
          name: meta.name,
          ifcClass: meta.type,
          category: meta.category,
          quantityName: "pcs",
          value: 1,
          unit: "pcs"
        });
        qtoAdded = true;
      } else if (isStair) {
        const match = getParamVal(["risers", "riser count", "riser_count", "riser", "step"]);
        if (match) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Number of Risers",
            value: match.numValue,
            unit: "risers"
          });
          qtoAdded = true;
        }
      } else if (isConcrete) {
        const match = getParamVal(["volume", "vol", "netvolume", "grossvolume"]);
        if (match) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Volume",
            value: match.numValue,
            unit: "m³"
          });
          qtoAdded = true;
        }
      } else if (isLinear) {
        const match = getParamVal(["length", "len", "netlength", "grosslength", "perimeter"]);
        if (match) {
          const isRailing = tL.includes("railing") || cL.includes("railing") || nL.includes("railing");
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: isRailing ? "Railings" : meta.category,
            quantityName: "Length",
            value: match.numValue,
            unit: isRailing ? "mm" : "m"
          });
          qtoAdded = true;
        }
      } else if (isAreaBased) {
        const match = getParamVal(["area", "netarea", "grossarea"]);
        if (match) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Area",
            value: match.numValue,
            unit: "m²"
          });
          qtoAdded = true;
        }
      }

      // Generic Fallback: if classified as stair/concrete/linear/area but target property was not found,
      // search for ANY generic quantity property (volume, area, length) as a secondary backup!
      if (!qtoAdded) {
        const volMatch = getParamVal(["volume", "vol"]);
        const areaMatch = getParamVal(["area"]);
        const lenMatch = getParamVal(["length", "len", "perimeter"]);
        
        if (volMatch) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Volume",
            value: volMatch.numValue,
            unit: "m³"
          });
          qtoAdded = true;
        } else if (areaMatch) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Area",
            value: areaMatch.numValue,
            unit: "m²"
          });
          qtoAdded = true;
        } else if (lenMatch) {
          const isRailing = tL.includes("railing") || cL.includes("railing") || nL.includes("railing");
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: isRailing ? "Railings" : meta.category,
            quantityName: "Length",
            value: lenMatch.numValue,
            unit: isRailing ? "mm" : "m"
          });
          qtoAdded = true;
        }
      }

      // Ultimate Fallback: door, windows, furniture or any object without geometric props
      if (!qtoAdded) {
        const isRailing = tL.includes("railing") || cL.includes("railing") || nL.includes("railing");
        availableQuantities.push({
          id: id,
          name: meta.name,
          ifcClass: meta.type,
          category: isRailing ? "Railings" : meta.category,
          quantityName: "Count",
          value: 1,
          unit: isRailing ? "pcs" : "No.s"
        });
      }
    });

    // Post-process quantities to compute default prices
    availableQuantities.forEach((item) => {
      item.unitPrice = getDefaultUnitPrice(item);
      item.totalPrice = item.value * item.unitPrice;
    });
    
    const sortedPropNames = Object.keys(modelProperties).sort((a, b) => a.localeCompare(b));
    sortedPropNames.forEach((propName) => {
      const opt = document.createElement('option');
      opt.value = propName;
      opt.innerText = propName;
      filterPropName.appendChild(opt);
    });

    // Extract georeference specifically for this model
    const geo = pendingGeoreference || extractGeoreference(modelId);
    pendingGeoreference = null;

    // Save model metadata
    loadedModels.push({
      id: modelId,
      model: activeModel,
      metaModel: metaModel,
      fileName: file.name,
      georeference: geo,
      file: file
    });

    updateGeoModelDropdown(modelId);
    updateToolDropdowns();
    buildTree();
  });

  activeModel.on("error", (err) => {
    hideLoader();
    updateStatus(`Error loading model: ${err}`, true);
  });
}

function updateToolDropdowns() {
  const diffOldSelect = document.getElementById('diffOldModelSelect');
  const diffNewSelect = document.getElementById('diffNewModelSelect');
  const clashASelect = document.getElementById('clashModelASelect');
  const clashBSelect = document.getElementById('clashModelBSelect');
  const convertSelect = document.getElementById('convertModelSelect');
  const csvModelSelectEl = document.getElementById('csvModelSelect');

  const ifcModels = loadedModels.filter(m => m.fileName.toLowerCase().endsWith('.ifc'));

  const updateDropdown = (selectEl, options, placeholder) => {
    if (!selectEl) return;
    const selectedVal = selectEl.value;
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = m.fileName;
      selectEl.appendChild(opt);
    });
    if (options.some(m => m.id === selectedVal)) {
      selectEl.value = selectedVal;
    } else if (options.length > 0) {
      selectEl.value = options[0].id;
    }
  };

  updateDropdown(diffOldSelect, ifcModels, '-- Select Model --');
  updateDropdown(diffNewSelect, ifcModels, '-- Select Model --');
  updateDropdown(clashASelect, ifcModels, '-- Select Model A --');
  updateDropdown(clashBSelect, ifcModels, '-- Select Model B (Optional) --');
  updateDropdown(convertSelect, ifcModels, '-- Select Model --');
  updateDropdown(csvModelSelectEl, ifcModels, '-- Select Model --');

  // Notify CSV tool to refresh its property/class lists
  window.dispatchEvent(new CustomEvent('ifcModelsUpdated'));
}

function updateGeoModelDropdown(selectedId) {
  if (!geoModelSelect) return;

  if (loadedModels.length > 1) {
    geoModelSelectGroup.style.display = "grid";
  } else {
    geoModelSelectGroup.style.display = "none";
  }

  geoModelSelect.innerHTML = "";
  loadedModels.forEach(modelInfo => {
    const opt = document.createElement('option');
    opt.value = modelInfo.id;
    opt.innerText = modelInfo.fileName;
    geoModelSelect.appendChild(opt);
  });

  if (selectedId) {
    geoModelSelect.value = selectedId;
    selectedGeoModelId = selectedId;
  } else if (loadedModels.length > 0) {
    geoModelSelect.value = loadedModels[0].id;
    selectedGeoModelId = loadedModels[0].id;
  } else {
    selectedGeoModelId = null;
  }

  loadGeoreferenceIntoUI(selectedGeoModelId);
}

function loadGeoreferenceIntoUI(modelId) {
  const modelInfo = loadedModels.find(m => m.id === modelId);
  
  if (!modelInfo) {
    geoEasting.value = "";
    geoNorthing.value = "";
    geoTrueNorth.value = "";
    geoEPSG.value = "";
    geoVerticalDatum.value = "";
    geoCesiumToken.value = "";
    geoStatusText.innerText = "No model selected.";
    geoStatusText.classList.add('no-geo');
    btnEditGeoreference.disabled = true;
    return;
  }

  activeGeoreference = modelInfo.georeference;
  isEditingGeoreference = false;
  
  geoEasting.disabled = true;
  geoNorthing.disabled = true;
  geoTrueNorth.disabled = true;
  geoEPSG.disabled = true;
  geoVerticalDatum.disabled = true;
  geoCesiumToken.disabled = true;
  
  btnEditGeoreference.disabled = false;
  btnEditGeoreference.innerHTML = '<i class="fa-solid fa-lock"></i> Edit Georeference';
  btnEditGeoreference.className = 'btn btn-secondary btn-full';

  btnToggleCesium.disabled = false;

  if (activeGeoreference) {
    geoEasting.value = activeGeoreference.easting !== null ? activeGeoreference.easting : "";
    geoNorthing.value = activeGeoreference.northing !== null ? activeGeoreference.northing : "";
    geoTrueNorth.value = activeGeoreference.trueNorth !== null ? activeGeoreference.trueNorth : "";
    geoEPSG.value = activeGeoreference.epsg !== null ? activeGeoreference.epsg : "";
    geoVerticalDatum.value = activeGeoreference.verticalDatum !== null ? activeGeoreference.verticalDatum : "";
    geoCesiumToken.value = activeGeoreference.cesiumToken !== null ? activeGeoreference.cesiumToken : "";
    geoStatusText.innerText = "Georeference loaded from file.";
    geoStatusText.classList.remove('no-geo');
  } else {
    geoEasting.value = "";
    geoNorthing.value = "";
    geoTrueNorth.value = "";
    geoEPSG.value = "";
    geoVerticalDatum.value = "";
    geoCesiumToken.value = "";
    geoStatusText.innerText = "This file is not georeferenced yet.";
    geoStatusText.classList.add('no-geo');
  }
}

// --- Object Selection & Properties display ---
function updateSelectionUI() {
  const selectedIds = viewer.scene.selectedObjectIds;
  
  if (selectedIds.length === 0) {
    activeElementId = null;
    activeMetaObject = null;
    btnSelectSimilar.disabled = false;
    propertiesContent.style.display = "none";
    noSelectionPrompt.style.display = "block";
  } else if (selectedIds.length === 1) {
    const singleId = selectedIds[0];
    activeElementId = singleId;
    btnSelectSimilar.disabled = false;
    const metaObj = viewer.metaScene.metaObjects[singleId];
    
    if (metaObj) {
      activeMetaObject = metaObj;
      noSelectionPrompt.style.display = "none";
      
      // Fill basic properties
      propObjId.innerText = `ID: ${metaObj.id}`;
      propObjName.innerText = metaObj.name || "Unnamed Object";
      propObjType.innerText = metaObj.type || "IfcObject";
      
      // Build property sets list
      propertySetsContainer.innerHTML = "";
      
      if (metaObj.propertySets && metaObj.propertySets.length > 0) {
        metaObj.propertySets.forEach((pset) => {
          const card = document.createElement('div');
          card.className = "property-set-card";

          const header = document.createElement('div');
          header.className = "property-set-header";
          header.innerHTML = `<strong>${pset.name}</strong> <span>${pset.type || ''}</span>`;
          card.appendChild(header);

          const list = document.createElement('div');
          list.className = "property-list";

          if (pset.properties && pset.properties.length > 0) {
            pset.properties.forEach((prop) => {
              const row = document.createElement('div');
              row.className = "property-row";
              row.innerHTML = `<span class="property-name">${prop.name}</span><span class="property-value">${prop.value}</span>`;
              list.appendChild(row);
            });
          } else {
            list.innerHTML = `<div class="property-row"><span class="property-name" style="font-style: italic;">No properties found</span></div>`;
          }

          // Toggle expand/collapse
          header.addEventListener('click', () => {
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
          });

          card.appendChild(list);
          propertySetsContainer.appendChild(card);
        });
      } else {
        propertySetsContainer.innerHTML = `<p style="font-size: 13px; color: var(--text-muted); font-style: italic; text-align: center; margin-top: 20px;">No property sets available for this element.</p>`;
      }

      propertiesContent.style.display = "flex";
      updateStatus(`Selected element: ${metaObj.name || metaObj.id}`);
    } else {
      // Check if element belongs to a Revit model with xeoRvt metadata
      let revitElement = null;
      let revitMeta = null;
      const entity = viewer.scene.objects[singleId];
      // Try matching by model ID first
      if (entity && entity.model) {
        revitMeta = revitMetadataMap[entity.model.id];
        if (revitMeta && revitMeta.Elements) {
          // Use loose equality (==) to handle string/number ID mismatch
          revitElement = revitMeta.Elements.find(e => String(e.Id) === String(singleId));
        }
      }
      
      // Fallback: search all Revit models for this element ID
      if (!revitElement) {
        for (const [modelId, meta] of Object.entries(revitMetadataMap)) {
          if (meta && meta.Elements) {
            const found = meta.Elements.find(e => String(e.Id) === String(singleId));
            if (found) {
              revitElement = found;
              revitMeta = meta;
              break;
            }
          }
        }
      }

      if (revitElement && revitMeta) {
        activeMetaObject = null;
        noSelectionPrompt.style.display = "none";
        
        propObjId.innerText = `ID: ${revitElement.Id}`;
        propObjName.innerText = revitElement.Name || `[${revitElement.class} #${revitElement.Id}]`;
        propObjType.innerText = revitElement.class || "Revit Element";
        
        propertySetsContainer.innerHTML = "";
        
        if (revitElement.ParameterGroups && revitElement.ParameterGroups.length > 0) {
          revitElement.ParameterGroups.forEach((gIdx) => {
            const group = revitMeta.ParameterGroups[gIdx];
            if (!group) return;
            
            const card = document.createElement('div');
            card.className = "property-set-card";

            const header = document.createElement('div');
            header.className = "property-set-header";
            header.innerHTML = `<strong>${group.Name}</strong> <span>Revit Parameters</span>`;
            card.appendChild(header);

            const list = document.createElement('div');
            list.className = "property-list";

            if (group.Parameters && group.Parameters.length > 0) {
              group.Parameters.forEach((pIdx) => {
                const param = revitMeta.Parameters[pIdx];
                if (!param) return;
                const unitStr = ("Unit" in param && revitMeta.Units && revitMeta.Units[param.Unit])
                  ? ` [${revitMeta.Units[param.Unit].Name}]` : "";
                const row = document.createElement('div');
                row.className = "property-row";
                row.innerHTML = `<span class="property-name">${param.Name}</span><span class="property-value">${param.Value}${unitStr}</span>`;
                list.appendChild(row);
              });
            } else {
              list.innerHTML = `<div class="property-row"><span class="property-name" style="font-style: italic;">No parameters</span></div>`;
            }

            header.addEventListener('click', () => {
              list.style.display = list.style.display === 'none' ? 'block' : 'none';
            });

            card.appendChild(list);
            propertySetsContainer.appendChild(card);
          });
        } else {
          propertySetsContainer.innerHTML = `<p style="font-size: 13px; color: var(--text-muted); font-style: italic; text-align: center; margin-top: 20px;">No parameter groups available for this Revit element.</p>`;
        }
        
        propertiesContent.style.display = "flex";
        updateStatus(`Selected Revit element: ${revitElement.Name || revitElement.Id}`);
      } else {
        // No metadata at all
        activeMetaObject = null;
        noSelectionPrompt.style.display = "none";
        propObjId.innerText = `ID: ${singleId}`;
        propObjName.innerText = "Generic Mesh Object";
        propObjType.innerText = "IfcProduct";
        propertySetsContainer.innerHTML = `<p style="font-size: 13px; color: var(--text-muted); font-style: italic; text-align: center; margin-top: 20px;">No metadata is available for this object.</p>`;
        propertiesContent.style.display = "flex";
        updateStatus(`Selected generic mesh: ${singleId}`);
      }
    }
  } else {
    // Multiple elements selected
    activeElementId = null; 
    btnSelectSimilar.disabled = true;
    noSelectionPrompt.style.display = "none";
    
    propObjId.innerText = `Count: ${selectedIds.length}`;
    propObjName.innerText = "Multiple Elements Selected";
    propObjType.innerText = activeMetaObject ? `Type: ${activeMetaObject.type}` : "";
    
    propertySetsContainer.innerHTML = `
      <div class="multi-select-info" style="text-align: center; margin-top: 20px; font-size: 13px; color: var(--text-muted);">
        <i class="fa-solid fa-layer-group" style="font-size: 28px; display: block; margin-bottom: 12px; opacity: 0.5;"></i>
        <p>Selected Object IDs:</p>
        <div style="font-family: monospace; font-size: 11px; max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; margin-top: 8px; word-break: break-all; text-align: left; line-height: 1.4;">
          ${selectedIds.join("<br/>")}
        </div>
      </div>
    `;
    
    propertiesContent.style.display = "flex";
    updateStatus(`Selected ${selectedIds.length} elements.`);
  }
  syncTreeSelection();
}

function handleObjectSelected(entity) {
  const input = viewer.scene.input;
  const isMultiSelect = input.ctrlDown || input.shiftDown;

  if (isMultiSelect) {
    // Toggle selected state of the clicked object
    entity.selected = !entity.selected;
  } else {
    // Single select: Deselect all other objects first
    viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
    entity.selected = true;
  }

  updateSelectionUI();
}
window.handleObjectSelected = handleObjectSelected;

function handleObjectDeselected() {
  viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
  updateSelectionUI();
}
window.handleObjectDeselected = handleObjectDeselected;

// --- Select Similar Type (Feature 4) ---
btnSelectSimilar.addEventListener('click', () => {
  if (!activeMetaObject || !activeMetaObject.type) return;

  const type = activeMetaObject.type;
  const ids = viewer.metaScene.getObjectIDsByType(type);

  // Clear selections & highlight matching types
  viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
  
  // Set both selected (for hide/isolate) and highlighted (for yellow visual feedback)
  viewer.scene.setObjectsSelected(ids, true);
  viewer.scene.setObjectsHighlighted(ids, true);

  // Zoom fit camera
  const aabb = viewer.scene.getAABB(ids);
  viewer.cameraFlight.flyTo(aabb);

  const savedMetaObj = activeMetaObject;
  updateSelectionUI();
  
  // Restore single-select context for Select Similar button to remain active and clickable
  activeMetaObject = savedMetaObj;
  btnSelectSimilar.disabled = false;

  updateStatus(`Selected and highlighted all ${ids.length} objects of type ${type}`);
});

// --- Property Filtering (Feature 3) ---
function filterObjects(query) {
  query = query.toLowerCase().trim();
  const allObjectIds = viewer.scene.objectIds;

  if (query === "") {
    // Clear filter
    viewer.scene.setObjectsXRayed(allObjectIds, false);
    viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
    filterResultCount.innerText = "";
    btnClearSearch.style.display = "none";
    return;
  }

  btnClearSearch.style.display = "block";
  const matchedIds = [];

  allObjectIds.forEach((id) => {
    const metaObj = viewer.metaScene.metaObjects[id];
    if (!metaObj) return;

    let isMatch = (metaObj.name && metaObj.name.toLowerCase().includes(query)) ||
                  (metaObj.type && metaObj.type.toLowerCase().includes(query)) ||
                  String(id).toLowerCase().includes(query);

    if (!isMatch && metaObj.propertySets) {
      for (const pset of metaObj.propertySets) {
        if (pset.properties) {
          for (const prop of pset.properties) {
            if ((prop.name && prop.name.toLowerCase().includes(query)) ||
                (prop.value && String(prop.value).toLowerCase().includes(query))) {
              isMatch = true;
              break;
            }
          }
        }
        if (isMatch) break;
      }
    }

    if (isMatch) {
      matchedIds.push(id);
    }
  });

  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);

  if (matchedIds.length > 0) {
    viewer.scene.setObjectsXRayed(allObjectIds, true);
    viewer.scene.setObjectsXRayed(matchedIds, false);
    viewer.scene.setObjectsHighlighted(matchedIds, true);
    filterResultCount.innerText = `Found ${matchedIds.length} matching objects`;
  } else {
    viewer.scene.setObjectsXRayed(allObjectIds, true);
    filterResultCount.innerText = "No matching objects found";
  }
}

propertySearch.addEventListener('input', (e) => {
  filterObjects(e.target.value);
});

btnClearSearch.addEventListener('click', () => {
  propertySearch.value = "";
  filterObjects("");
});

// --- Section Planes (Feature 5) ---
btnAddPlaneCenter.addEventListener('click', () => {
  const id = `plane-center-${Date.now()}`;
  const plane = sectionPlanes.createSectionPlane({
    id: id,
    pos: viewer.scene.center,
    dir: [0, -1, 0] // Cut horizontally downward
  });
  if (chkShowGizmos.checked) {
    sectionPlanes.showControl(plane.id);
  }
  updateStatus("Added section plane at model center.");
});

btnAddPlaneInteractive.addEventListener('click', () => {
  clickToAddPlaneEnabled = true;
  planePlacementPrompt.style.display = "flex";
  updateStatus("Interactive section cut mode active. Click on model.");
});


chkShowGizmos.addEventListener('change', () => {
  const show = chkShowGizmos.checked;
  Object.keys(sectionPlanes.sectionPlanes).forEach((id) => {
    if (show) {
      sectionPlanes.showControl(id);
    } else {
      sectionPlanes.hideControl(id);
    }
  });
});

btnClearPlanes.addEventListener('click', () => {
  sectionPlanes.clear();
  clickToAddPlaneEnabled = false;
  planePlacementPrompt.style.display = "none";
  updateStatus("Cleared all section planes.");
});

// --- File Selection & Drag Drop Listeners ---
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleMultipleFiles(Array.from(e.target.files));
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleMultipleFiles(Array.from(e.dataTransfer.files));
  }
});

function handleMultipleFiles(files) {
  // Find if there is a json file containing georeference data
  const jsonFile = files.find(f => f.name.toLowerCase().endsWith('.json'));
  const modelFile = files.find(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ext === 'ifc' || ext === 'xkt' || ext === 'las' || ext === 'laz' || ext === 'gltf' || ext === 'glb';
  });

  if (!modelFile) {
    updateStatus("No valid model file selected! Please select a .ifc, .xkt, .las, .laz, .gltf, or .glb file.", true);
    return;
  }

  if (jsonFile) {
    // Read georeference data first
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        const easting = json.easting !== undefined ? parseFloat(json.easting) : (json.x !== undefined ? parseFloat(json.x) : null);
        const northing = json.northing !== undefined ? parseFloat(json.northing) : (json.y !== undefined ? parseFloat(json.y) : null);
        const trueNorth = json.trueNorth !== undefined ? parseFloat(json.trueNorth) : (json.rotation !== undefined ? parseFloat(json.rotation) : (json.trueNorthAngle !== undefined ? parseFloat(json.trueNorthAngle) : null));
        const epsg = json.epsg || json.crs || null;
        const verticalDatum = json.verticalDatum || json.elevation || json.z || json.altitude || null;
        const cesiumToken = json.cesiumToken || json.cesiumIonToken || null;
        
        pendingGeoreference = { 
          easting, 
          northing, 
          trueNorth, 
          epsg, 
          verticalDatum: verticalDatum !== null ? String(verticalDatum) : null, 
          cesiumToken 
        };
        updateStatus(`Loaded companion georeference JSON: Easting=${easting}, Northing=${northing}`);
      } catch (err) {
        updateStatus(`Failed to parse georeference JSON: ${err.message}`, true);
        pendingGeoreference = null;
      }
      // Load model file after trying to parse JSON
      handleFileSelected(modelFile);
    };
    reader.readAsText(jsonFile);
  } else {
    pendingGeoreference = null;
    handleFileSelected(modelFile);
  }
}

function handleFileSelected(file) {
  // Clear previous conversion buffer
  convertedXktBuffer = null;
  convertedXktName = "";
  btnDownloadXkt.disabled = true;

  fileNameSpan.innerText = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  fileInfoBar.style.display = "flex";

  const fileExt = file.name.split('.').pop().toLowerCase();
  
  if (fileExt === 'ifc') {
    // Show/enable toggles for IFC
    convertToXktOpt.disabled = false;
    document.querySelectorAll('input[name="ifcEngine"]').forEach(r => r.disabled = false);
    
    // Auto-trigger load
    loadModel(file, convertToXktOpt.checked);
  } else if (fileExt === 'xkt') {
    // Disable IFC configs since it's already XKT
    convertToXktOpt.disabled = true;
    document.querySelectorAll('input[name="ifcEngine"]').forEach(r => r.disabled = true);
    
    // Auto-trigger load
    loadModel(file, false);
  } else if (fileExt === 'las' || fileExt === 'laz' || fileExt === 'gltf' || fileExt === 'glb') {
    // Disable IFC configs since it's point cloud/glTF
    convertToXktOpt.disabled = true;
    document.querySelectorAll('input[name="ifcEngine"]').forEach(r => r.disabled = true);
    
    // Auto-trigger load
    loadModel(file, false);
  } else {
    updateStatus("Unsupported file type! Only .ifc, .xkt, .las, .laz, .gltf, and .glb files are supported.", true);
  }
}

// Re-trigger load if user toggles settings
convertToXktOpt.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    loadModel(fileInput.files[0], convertToXktOpt.checked);
  }
});

document.querySelectorAll('input[name="ifcEngine"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (fileInput.files.length > 0 && !convertToXktOpt.checked) {
      loadModel(fileInput.files[0], false);
    }
  });
});

// Download converted XKT helper
btnDownloadXkt.addEventListener('click', () => {
  if (!convertedXktBuffer || !convertedXktName) return;
  
  const blob = new Blob([convertedXktBuffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = convertedXktName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  updateStatus(`Downloaded converted XKT: ${convertedXktName}`);
});

// Load Demo Model helper
async function loadDemoModel() {
  showLoader("Fetching Demo Model", "Downloading Duplex.ifc...", 10);
  try {
    const response = await fetch('/Duplex.ifc');
    if (!response.ok) throw new Error("Failed to fetch demo model");
    const blob = await response.blob();
    const file = new File([blob], "Duplex.ifc", { type: "application/octet-stream" });
    
    // Select the file and trigger loading
    handleFileSelected(file);
  } catch (err) {
    hideLoader();
    updateStatus(`Failed to load demo model: ${err.message}`, true);
  }
}

btnLoadDemo.addEventListener('click', loadDemoModel);

// --- Advanced Property Query Filter ---
btnApplyPropFilter.addEventListener('click', () => {
  const propName = filterPropName.value;
  const operator = filterOperator.value;
  const valQuery = filterPropVal.value.trim().toLowerCase();
  
  if (!propName) {
    updateStatus("Please select a property name to filter.", true);
    return;
  }
  
  const allObjectIds = viewer.scene.objectIds;
  const matchedIds = [];
  
  allObjectIds.forEach((id) => {
    const entity = viewer.scene.objects[id];
    if (!entity || !entity.model) return;
    const modelId = entity.model.id;
    const meta = getElementMetadata(id, modelId);
    if (!meta) return;
    
    let isMatch = false;
    for (const prop of meta.props) {
      if (prop.name === propName) {
        const propValStr = String(prop.value).toLowerCase();
        const propValNum = parseFloat(prop.value);
        const queryValNum = parseFloat(valQuery);
        
        if (operator === 'equals') {
          isMatch = propValStr === valQuery;
        } else if (operator === 'contains') {
          isMatch = propValStr.includes(valQuery);
        } else if (operator === 'gt' && !isNaN(propValNum) && !isNaN(queryValNum)) {
          isMatch = propValNum > queryValNum;
        } else if (operator === 'lt' && !isNaN(propValNum) && !isNaN(queryValNum)) {
          isMatch = propValNum < queryValNum;
        }
        break;
      }
    }
    
    if (isMatch) {
      matchedIds.push(id);
    }
  });
  
  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
  
  if (matchedIds.length > 0) {
    viewer.scene.setObjectsXRayed(allObjectIds, true);
    viewer.scene.setObjectsXRayed(matchedIds, false);
    viewer.scene.setObjectsHighlighted(matchedIds, true);
    filterResultCount.innerText = `Found ${matchedIds.length} objects matching "${propName} ${operator} ${valQuery}"`;
    updateStatus(`Filtered: showing ${matchedIds.length} objects matching query.`);
  } else {
    viewer.scene.setObjectsXRayed(allObjectIds, true);
    filterResultCount.innerText = "No matching objects found";
    updateStatus("Property query returned 0 matches.", true);
  }
});

btnResetPropFilter.addEventListener('click', () => {
  filterPropName.value = "";
  filterOperator.value = "equals";
  filterPropVal.value = "";
  filterResultCount.innerText = "";
  
  viewer.scene.setObjectsXRayed(viewer.scene.objectIds, false);
  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
  updateStatus("Property query filter reset.");
});

// --- Quantity Take-Off (QTO) Modal Interface ---
let qtoPieChart = null;
let qtoBarChart = null;

// Format price to IDR format
function formatIDR(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

// Clean up category strings for display/grouping
function getCleanCategory(item) {
  let cat = item.category || item.ifcClass || "Other";
  if (cat.startsWith("Ifc")) {
    cat = cat.substring(3);
  }
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// Get default Indonesian market unit prices based on category and unit
function getDefaultUnitPrice(item) {
  const cls = (item.ifcClass || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  const unit = (item.unit || "").toLowerCase();
  
  if (cls.includes("door") || cat.includes("door")) return 2500000;
  if (cls.includes("window") || cat.includes("window")) return 1500000;
  
  if (cls.includes("column") || cat.includes("column")) {
    return unit.includes("3") ? 5000000 : 800000;
  }
  if (cls.includes("beam") || cat.includes("beam")) {
    return unit.includes("3") ? 4500000 : 700000;
  }
  if (cls.includes("slab") || cat.includes("slab") || cls.includes("floor") || cat.includes("floor")) {
    return unit.includes("3") ? 4000000 : 350000;
  }
  if (cls.includes("footing") || cat.includes("footing") || cls.includes("foundation") || cat.includes("foundation")) {
    return 3500000;
  }
  
  if (cls.includes("wall") || cat.includes("wall")) return 250000;
  if (cls.includes("roof") || cat.includes("roof")) return 400000;
  if (cls.includes("covering") || cat.includes("covering") || cls.includes("ceiling") || cat.includes("ceiling")) return 120000;
  
  if (cls.includes("railing") || cat.includes("railing")) {
    if (unit.includes("mm") && !unit.includes("2") && !unit.includes("²")) {
      return 600; // Rp 600 per mm (equivalent to Rp 600,000 per m)
    }
    return 600000;
  }
  if (cls.includes("pipe") || cat.includes("pipe") || cls.includes("duct") || cat.includes("duct") || cls.includes("flowsegment") || cat.includes("flowsegment")) return 150000;
  
  if (cls.includes("stair") || cat.includes("stair")) {
    if (unit.includes("riser")) return 200000;
    return 5000000;
  }
  
  if (cls.includes("furniture") || cat.includes("furniture")) return 1500000;
  
  if (unit.includes("3") || unit.includes("m3")) return 3000000;
  if (unit.includes("2") || unit.includes("m2")) return 250000;
  if (unit === "m" || unit === "meter") return 200000;
  
  return 500000;
}

// Update or initialize Pie and Bar charts using Chart.js
function updateQtoCharts() {
  if (typeof Chart === 'undefined') {
    console.warn("Chart.js is not loaded yet.");
    return;
  }
  
  const categoryTotals = {};
  availableQuantities.forEach((item) => {
    const category = getCleanCategory(item);
    if (!categoryTotals[category]) {
      categoryTotals[category] = 0;
    }
    categoryTotals[category] += item.totalPrice || 0;
  });
  
  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);
  
  const backgroundColors = [
    'rgba(79, 70, 229, 0.75)',  // var(--primary) - Indigo
    'rgba(6, 182, 212, 0.75)',  // var(--accent) - Cyan
    'rgba(16, 185, 129, 0.75)', // var(--success) - Emerald
    'rgba(239, 68, 68, 0.75)',  // var(--danger) - Rose
    'rgba(245, 158, 11, 0.75)',  // Orange
    'rgba(139, 92, 246, 0.75)', // Violet
    'rgba(236, 72, 153, 0.75)', // Pink
    'rgba(107, 114, 128, 0.75)' // Gray
  ];
  
  const borderColors = [
    '#4f46e5',
    '#06b6d4',
    '#10b981',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#6b7280'
  ];
  
  // Pie Chart
  const pieCanvas = document.getElementById('qtoPieChart');
  if (pieCanvas) {
    if (qtoPieChart) {
      qtoPieChart.data.labels = labels;
      qtoPieChart.data.datasets[0].data = data;
      qtoPieChart.data.datasets[0].backgroundColor = backgroundColors.slice(0, labels.length);
      qtoPieChart.data.datasets[0].borderColor = borderColors.slice(0, labels.length);
      qtoPieChart.update();
    } else {
      qtoPieChart = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: backgroundColors.slice(0, labels.length),
            borderColor: borderColors.slice(0, labels.length),
            borderWidth: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#f3f4f6',
                font: {
                  family: 'Inter',
                  size: 11
                }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw || 0;
                  return ` ${context.label}: ${formatIDR(val)}`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Bar Chart
  const barCanvas = document.getElementById('qtoBarChart');
  if (barCanvas) {
    if (qtoBarChart) {
      qtoBarChart.data.labels = labels;
      qtoBarChart.data.datasets[0].data = data;
      qtoBarChart.data.datasets[0].backgroundColor = backgroundColors.slice(0, labels.length);
      qtoBarChart.data.datasets[0].borderColor = borderColors.slice(0, labels.length);
      qtoBarChart.update();
    } else {
      qtoBarChart = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Accumulated Price (IDR)',
            data: data,
            backgroundColor: backgroundColors.slice(0, labels.length),
            borderColor: borderColors.slice(0, labels.length),
            borderWidth: 1.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw || 0;
                  return ` Price: ${formatIDR(val)}`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#9ca3af',
                font: {
                  family: 'Inter',
                  size: 10
                }
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              }
            },
            y: {
              ticks: {
                color: '#9ca3af',
                font: {
                  family: 'Inter',
                  size: 10
                },
                callback: function(value) {
                  if (value >= 1e9) return 'Rp ' + (value / 1e9).toFixed(1) + ' M';
                  if (value >= 1e6) return 'Rp ' + (value / 1e6).toFixed(1) + ' jt';
                  if (value >= 1e3) return 'Rp ' + (value / 1e3).toFixed(0) + ' rb';
                  return 'Rp ' + value;
                }
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              }
            }
          }
        }
      });
    }
  }
}

// Update summary text and trigger chart re-renders
function updateQtoSummaryAndCharts() {
  let totalBudget = 0;
  availableQuantities.forEach((item) => {
    totalBudget += item.totalPrice || 0;
  });
  
  const query = qtoSearch.value.toLowerCase().trim();
  let rowCount = 0;
  availableQuantities.forEach((item) => {
    const match = query === "" || 
                  item.ifcClass.toLowerCase().includes(query) || 
                  item.category.toLowerCase().includes(query) || 
                  item.quantityName.toLowerCase().includes(query) || 
                  item.name.toLowerCase().includes(query);
    if (match) {
      rowCount++;
    }
  });
  
  qtoSummaryText.style.display = 'flex';
  qtoSummaryText.style.width = '100%';
  qtoSummaryText.style.justifyContent = 'space-between';
  qtoSummaryText.innerHTML = `
    <span>Total items shown: <strong>${rowCount}</strong> of <strong>${availableQuantities.length}</strong></span>
    <span style="color: var(--accent); font-weight: 600;">Total Project Budget: <span style="font-family: monospace; font-size: 13px;">${formatIDR(totalBudget)}</span></span>
  `;
  
  updateQtoCharts();
}

function renderQtoTable(filterText = "") {
  qtoTableBody.innerHTML = "";
  const query = filterText.toLowerCase().trim();
  
  let rowCount = 0;
  availableQuantities.forEach((item) => {
    const match = query === "" || 
                  (item.ifcClass || "").toLowerCase().includes(query) || 
                  (item.category || "").toLowerCase().includes(query) || 
                  (item.quantityName || "").toLowerCase().includes(query) || 
                  (item.name || "").toLowerCase().includes(query);
    
    if (match) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.ifcClass || ""}</td>
        <td>${item.category || ""}</td>
        <td><span class="qto-object-link" data-id="${item.id}" style="color: var(--accent); text-decoration: underline; cursor: pointer; font-weight: 500;">${item.name || ""}</span></td>
        <td>${item.quantityName || ""}</td>
        <td>${(item.value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
        <td>${item.unit || ""}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 11px; color: var(--text-muted);">Rp</span>
            <input type="number" class="qto-price-input" data-id="${item.id}" value="${item.unitPrice || 0}">
          </div>
        </td>
        <td>
          <span class="qto-total-price" data-id="${item.id}" style="font-family: monospace; font-weight: 600; color: var(--accent);">
            ${formatIDR(item.totalPrice || 0)}
          </span>
        </td>
      `;
      qtoTableBody.appendChild(tr);
      rowCount++;
    }
  });
  
  updateQtoSummaryAndCharts();
}

// Click listener to fly to object from QTO table links
qtoTableBody.addEventListener('click', (e) => {
  const link = e.target.closest('.qto-object-link');
  if (link) {
    e.preventDefault();
    const objectId = link.dataset.id;
    if (objectId) {
      // 1. Close QTO modal
      qtoModal.style.display = 'none';
      updateStatus(`Zooming to object #${objectId} from QTO.`);
      
      // 2. Select & Highlight
      viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
      
      const entity = viewer.scene.objects[objectId];
      if (entity) {
        entity.selected = true;
        entity.highlighted = true;
        
        // 3. Populate Properties panel
        handleObjectSelected(entity);
        
        // 4. Zoom to it
        viewer.cameraFlight.flyTo(entity);
      }
    }
  }
});

// Input listener to update manual prices and recalculate totals
qtoTableBody.addEventListener('input', (e) => {
  if (e.target.classList.contains('qto-price-input')) {
    const objectId = e.target.dataset.id;
    const newPrice = parseFloat(e.target.value) || 0;
    
    const item = availableQuantities.find(q => String(q.id) === String(objectId));
    if (item) {
      item.unitPrice = newPrice;
      item.totalPrice = item.value * newPrice;
      
      // Update the total price cell in the row
      const row = e.target.closest('tr');
      if (row) {
        const totalSpan = row.querySelector('.qto-total-price');
        if (totalSpan) {
          totalSpan.innerText = formatIDR(item.totalPrice);
        }
      }
      
      // Recalculate and update summary and charts
      updateQtoSummaryAndCharts();
    }
  }
});

btnOpenQto.addEventListener('click', () => {
  renderQtoTable(qtoSearch.value);
  qtoModal.style.display = 'flex';
  updateStatus("Opened Quantity Take-Off modal.");
});

btnCloseQto.addEventListener('click', () => {
  qtoModal.style.display = 'none';
  updateStatus("Closed Quantity Take-Off modal.");
});

qtoModal.addEventListener('click', (e) => {
  if (e.target === qtoModal) {
    qtoModal.style.display = 'none';
    updateStatus("Closed Quantity Take-Off modal.");
  }
});

qtoSearch.addEventListener('input', (e) => {
  renderQtoTable(e.target.value);
});

btnExportCsv.addEventListener('click', () => {
  if (availableQuantities.length === 0) {
    updateStatus("No quantity takeoff data available to export.", true);
    return;
  }
  
  let csvContent = "IFC Class,Category,Quantity Name,Value,Unit,Unit Price (IDR),Total Price (IDR),Object Name,Object ID\n";
  
  const escapeCsv = (str) => {
    if (str === null || str === undefined) return "";
    const cleanStr = String(str).replace(/"/g, '""');
    return cleanStr.includes(",") || cleanStr.includes("\n") || cleanStr.includes('"') 
      ? `"${cleanStr}"` 
      : cleanStr;
  };
  
  availableQuantities.forEach((item) => {
    csvContent += `${escapeCsv(item.ifcClass)},${escapeCsv(item.category)},${escapeCsv(item.quantityName)},${item.value},${escapeCsv(item.unit)},${item.unitPrice || 0},${item.totalPrice || 0},${escapeCsv(item.name)},${escapeCsv(item.id)}\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quantity_takeoff_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  updateStatus("Exported quantity takeoff CSV spreadsheet.");
});

// --- Visibility Actions ---
btnShowAllGlobal.addEventListener('click', () => {
  if (loadedModels.length === 0) return;
  const allIds = viewer.scene.objectIds;
  viewer.scene.setObjectsVisible(allIds, true);
  viewer.scene.setObjectsXRayed(allIds, false);
  updateStatus("Restored visibility and cleared X-Ray of all objects.");
  syncTreeCheckboxes();
});

btnHideObject.addEventListener('click', () => {
  const selectedIds = viewer.scene.selectedObjectIds;
  if (selectedIds.length > 0) {
    viewer.scene.setObjectsVisible(selectedIds, false);
    const count = selectedIds.length;
    handleObjectDeselected();
    updateStatus(`Hidden ${count} object(s).`);
    syncTreeCheckboxes();
  }
});

btnIsolateObject.addEventListener('click', () => {
  const selectedIds = viewer.scene.selectedObjectIds;
  if (selectedIds.length > 0) {
    const allIds = viewer.scene.objectIds;
    // Hide all objects, then show the active ones
    viewer.scene.setObjectsVisible(allIds, false);
    viewer.scene.setObjectsVisible(selectedIds, true);
    updateStatus(`Isolated ${selectedIds.length} object(s).`);
    syncTreeCheckboxes();
  }
});

btnXrayObject.addEventListener('click', () => {
  const selectedIds = viewer.scene.selectedObjectIds;
  if (selectedIds.length > 0) {
    selectedIds.forEach(id => {
      const obj = viewer.scene.objects[id];
      if (obj) {
        obj.xrayed = !obj.xrayed;
      }
    });
    updateStatus(`Toggled X-Ray on ${selectedIds.length} object(s).`);
  }
});

// --- Georeference manual editing action ---
btnEditGeoreference.addEventListener('click', () => {
  if (loadedModels.length === 0) return;

  if (!isEditingGeoreference) {
    // Switch to editing mode
    isEditingGeoreference = true;
    geoEasting.disabled = false;
    geoNorthing.disabled = false;
    geoTrueNorth.disabled = false;
    geoEPSG.disabled = false;
    geoVerticalDatum.disabled = false;
    geoCesiumToken.disabled = false;
    
    btnEditGeoreference.innerHTML = '<i class="fa-solid fa-check"></i> Apply Georeference';
    btnEditGeoreference.className = 'btn btn-primary btn-full';
    
    geoEasting.focus();
  } else {
    // Switch to locked mode (apply georeference)
    isEditingGeoreference = false;
    geoEasting.disabled = true;
    geoNorthing.disabled = true;
    geoTrueNorth.disabled = true;
    geoEPSG.disabled = true;
    geoVerticalDatum.disabled = true;
    geoCesiumToken.disabled = true;
    
    btnEditGeoreference.innerHTML = '<i class="fa-solid fa-lock"></i> Edit Georeference';
    btnEditGeoreference.className = 'btn btn-secondary btn-full';
    
    const eastingVal = geoEasting.value.trim();
    const northingVal = geoNorthing.value.trim();
    const trueNorthVal = geoTrueNorth.value.trim();
    const epsgVal = geoEPSG.value.trim();
    const verticalDatumVal = geoVerticalDatum.value.trim();
    const cesiumTokenVal = geoCesiumToken.value.trim();
    
    if (eastingVal === "" && northingVal === "" && trueNorthVal === "" && epsgVal === "" && verticalDatumVal === "" && cesiumTokenVal === "") {
      activeGeoreference = null;
      geoStatusText.innerText = "This file is not georeferenced yet.";
      geoStatusText.classList.add('no-geo');
    } else {
      activeGeoreference = {
        easting: eastingVal !== "" ? parseFloat(eastingVal) : null,
        northing: northingVal !== "" ? parseFloat(northingVal) : null,
        trueNorth: trueNorthVal !== "" ? parseFloat(trueNorthVal) : null,
        epsg: epsgVal !== "" ? epsgVal : null,
        verticalDatum: verticalDatumVal !== "" ? verticalDatumVal : null,
        cesiumToken: cesiumTokenVal !== "" ? cesiumTokenVal : null
      };
      geoStatusText.innerText = "Georeferenced manually.";
      geoStatusText.classList.remove('no-geo');
    }
    
    // Update cached model info
    const modelInfo = loadedModels.find(m => m.id === selectedGeoModelId);
    if (modelInfo) {
      modelInfo.georeference = activeGeoreference;
    }
    
    // If Cesium is active, sync camera using the updated georeference immediately!
    if (isCesiumActive) {
      const tokenVal = geoCesiumToken.value.trim();
      initCesiumViewer(tokenVal);
      if (!cesiumTickUnsubscribe) {
        cesiumTickUnsubscribe = viewer.scene.on("tick", syncCameras);
      }
      syncCameras();
    }
    
    updateStatus("Georeference coordinates updated manually.");
  }
});

// --- Listen to model select change in Georeference panel ---
geoModelSelect.addEventListener('change', (e) => {
  selectedGeoModelId = e.target.value;
  loadGeoreferenceIntoUI(selectedGeoModelId);
  if (isCesiumActive) {
    syncCameras();
  }
});

// --- Model Tree view helper functions ---
function buildTree() {
  treeContainer.innerHTML = "";

  if (loadedModels.length === 0 || !viewer.metaScene) {
    modelTreeSection.style.display = "none";
    return;
  }

  modelTreeSection.style.display = "block";
  const rootUl = document.createElement("ul");
  rootUl.className = "tree-children";

  loadedModels.forEach(modelInfo => {
    const modelLi = document.createElement("li");
    modelLi.className = "tree-node";
    modelLi.dataset.modelId = modelInfo.id;

    const content = document.createElement("div");
    content.className = "tree-node-content model-root-node";
    content.dataset.modelId = modelInfo.id;

    // Toggle
    const toggleSpan = document.createElement("span");
    toggleSpan.className = "tree-toggle";
    toggleSpan.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    content.appendChild(toggleSpan);

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "tree-checkbox model-checkbox";
    const objects = Object.values(viewer.scene.objects).filter(o => o.model && o.model.id === modelInfo.id);
    checkbox.checked = objects.length === 0 || objects.some(o => o.visible);
    content.appendChild(checkbox);

    // Icon & Label
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-cube";
    icon.style.marginRight = "6px";
    icon.style.color = "var(--accent)";
    content.appendChild(icon);

    const label = document.createElement("span");
    label.className = "tree-label";
    label.innerText = modelInfo.fileName;
    label.style.fontWeight = "600";
    content.appendChild(label);

    modelLi.appendChild(content);

    // Nested spatial roots or Revit custom tree
    const childrenUl = document.createElement("ul");
    childrenUl.className = "tree-children";

    if (revitMetadataMap[modelInfo.id]) {
      // Use custom Revit tree hierarchy (Instances, Families, Levels)
      buildRevitTreeNodes(modelInfo, childrenUl);
    } else {
      // Standard IFC spatial tree
      let roots = [];
      if (modelInfo.metaModel && modelInfo.metaModel.rootMetaObject) {
        roots = [modelInfo.metaModel.rootMetaObject];
      } else if (modelInfo.metaModel) {
        roots = Object.values(viewer.metaScene.metaObjects).filter(metaObj => {
          return metaObj.metaModel && metaObj.metaModel.id === modelInfo.id && !metaObj.parent;
        });
      }

      roots.forEach(root => {
        childrenUl.appendChild(createTreeNodeElement(root));
      });
    }
    modelLi.appendChild(childrenUl);

    // Bind collapse/expand
    toggleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = childrenUl.classList.toggle('collapsed');
      toggleSpan.classList.toggle('collapsed', isCollapsed);
      toggleSpan.innerHTML = isCollapsed 
        ? '<i class="fa-solid fa-chevron-right"></i>' 
        : '<i class="fa-solid fa-chevron-down"></i>';
    });

    // Bind checkbox visibility toggle
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const visible = checkbox.checked;
      
      const getLeafIds = (metaObj) => {
        let ids = [];
        const sceneObj = viewer.scene.objects[metaObj.id];
        if (sceneObj) {
          ids.push(metaObj.id);
        }
        if (metaObj.children) {
          metaObj.children.forEach(child => {
            ids = ids.concat(getLeafIds(child));
          });
        }
        return ids;
      };

      let allLeafIds = [];
      roots.forEach(root => {
        allLeafIds = allLeafIds.concat(getLeafIds(root));
      });

      if (allLeafIds.length > 0) {
        viewer.scene.setObjectsVisible(allLeafIds, visible);
        updateStatus(`${visible ? "Shown" : "Hidden"} all elements of model ${modelInfo.fileName}.`);
      } else if (modelInfo.model) {
        modelInfo.model.visible = visible;
        updateStatus(`${visible ? "Shown" : "Hidden"} model ${modelInfo.fileName}.`);
      }

      childrenUl.querySelectorAll('.tree-checkbox').forEach(cb => {
        cb.checked = visible;
      });

      syncTreeCheckboxes();
    });

    rootUl.appendChild(modelLi);
  });

  treeContainer.appendChild(rootUl);
}

function createTreeNodeElement(metaObj) {
  const li = document.createElement("li");
  li.className = "tree-node";
  li.dataset.id = metaObj.id;

  const content = document.createElement("div");
  content.className = "tree-node-content";
  content.dataset.id = metaObj.id;

  const hasChildren = metaObj.children && metaObj.children.length > 0;
  const toggleSpan = document.createElement("span");
  toggleSpan.className = "tree-toggle";
  if (hasChildren) {
    toggleSpan.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
  } else {
    toggleSpan.innerHTML = '';
  }
  content.appendChild(toggleSpan);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "tree-checkbox";
  const entity = viewer.scene.objects[metaObj.id];
  checkbox.checked = entity ? entity.visible : true;
  content.appendChild(checkbox);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.innerText = metaObj.name || metaObj.id;
  content.appendChild(label);

  const typeSpan = document.createElement("span");
  typeSpan.className = "tree-type";
  typeSpan.innerText = metaObj.type;
  content.appendChild(typeSpan);

  li.appendChild(content);

  let childrenUl = null;
  if (hasChildren) {
    childrenUl = document.createElement("ul");
    childrenUl.className = "tree-children";
    
    const sortedChildren = [...metaObj.children].sort((a, b) => {
      const nameA = a.name || a.id;
      const nameB = b.name || b.id;
      return nameA.localeCompare(nameB);
    });

    sortedChildren.forEach(childMeta => {
      childrenUl.appendChild(createTreeNodeElement(childMeta));
    });
    li.appendChild(childrenUl);
  }

  if (hasChildren) {
    toggleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = childrenUl.classList.toggle('collapsed');
      toggleSpan.classList.toggle('collapsed', isCollapsed);
      toggleSpan.innerHTML = isCollapsed 
        ? '<i class="fa-solid fa-chevron-right"></i>' 
        : '<i class="fa-solid fa-chevron-down"></i>';
    });
  }

  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    const visible = checkbox.checked;
    
    const getLeafIds = (node) => {
      let ids = [];
      const sceneObj = viewer.scene.objects[node.id];
      if (sceneObj) {
        ids.push(node.id);
      }
      if (node.children) {
        node.children.forEach(child => {
          ids = ids.concat(getLeafIds(child));
        });
      }
      return ids;
    };

    const leafIds = getLeafIds(metaObj);
    if (leafIds.length > 0) {
      viewer.scene.setObjectsVisible(leafIds, visible);
      updateStatus(`${visible ? "Shown" : "Hidden"} ${leafIds.length} elements from tree.`);
    }

    if (childrenUl) {
      childrenUl.querySelectorAll('.tree-checkbox').forEach(cb => {
        cb.checked = visible;
      });
    }

    syncTreeCheckboxes();
  });

  content.addEventListener('click', (e) => {
    if (e.target.closest('.tree-checkbox') || e.target.closest('.tree-toggle')) {
      return;
    }
    
    const entity = viewer.scene.objects[metaObj.id];
    if (entity) {
      handleObjectSelected(entity);
      viewer.cameraFlight.flyTo(entity);
    } else {
      const getLeafIds = (node) => {
        let ids = [];
        const sceneObj = viewer.scene.objects[node.id];
        if (sceneObj) {
          ids.push(node.id);
        }
        if (node.children) {
          node.children.forEach(child => {
            ids = ids.concat(getLeafIds(child));
          });
        }
        return ids;
      };

      const leafIds = getLeafIds(metaObj);
      if (leafIds.length > 0) {
        viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
        viewer.scene.setObjectsSelected(leafIds, true);
        updateSelectionUI();
        
        const aabb = viewer.scene.getAABB(leafIds);
        viewer.cameraFlight.flyTo(aabb);
      }
    }
  });

  return li;
}

// --- Revit (xeoRvt) Custom Tree Builder ---
// Builds Instances, Families, and Levels hierarchy from xeoRvt metadata
function buildRevitTreeNodes(modelInfo, parentUl) {
  const metadata = revitMetadataMap[modelInfo.id];
  if (!metadata || !metadata.Elements) return;

  const Elements = metadata.Elements;
  const model = viewer.scene.models[modelInfo.id];

  // Helper: check if an Element has a drawable entity in the scene
  const getDrawable = (e) => {
    if (!e || e.Id == null) return null;
    return viewer.scene.objects[String(e.Id)] || null;
  };

  // Helper: build tree node data from an Element
  const elementTreenode = (e, children) => ({
    name: e.Name || `[${e.class} #${e.Id}]`,
    children: children || [],
    elementId: e.Id != null ? String(e.Id) : null,
    elementClass: e.class,
    elementIdx: Elements.indexOf(e),
    drawable: getDrawable(e)
  });

  // Build type hierarchy: Category -> Family -> Type -> Instance
  const typeHierarchy = (filter) => {
    const roots = new Map();
    Elements.forEach((e, idx) => {
      if (getDrawable(e) && filter(e)) {
        (function rec(e, idx) {
          const typeParentIdx = e.Type ?? e.Family ?? e.Category ?? null;
          const parentMap = ((typeParentIdx !== null)
                             ? rec(Elements[typeParentIdx], typeParentIdx)
                             : roots);
          if (!parentMap.has(idx)) {
            parentMap.set(idx, new Map());
          }
          return parentMap.get(idx);
        })(e, idx);
      }
    });
    return (function rec(map) {
      return [...map.entries()].map(
        ([idx, childrenMap]) => elementTreenode(Elements[idx], rec(childrenMap))
      ).sort((a, b) => a.name.localeCompare(b.name));
    })(roots);
  };

  // --- Build Instances folder ---
  const instancesData = Elements.filter(getDrawable).map(
    e => elementTreenode(e)
  ).sort((a, b) => a.name.localeCompare(b.name));

  // --- Build Families folder ---
  const familiesData = typeHierarchy(e => true);

  // --- Build Levels folder ---
  const levelsData = Elements.map((e, idx) => (e.class === "Level") && {
    elevation: e.Elevation ?? -Infinity,
    node: elementTreenode(e, typeHierarchy(el => el.Level === idx))
  }).filter(v => v).sort(
    (a, b) => b.elevation - a.elevation
  ).map(e => e.node).concat({
    name: "(none)",
    children: typeHierarchy(e => typeof e.Level !== "number"),
    elementId: null,
    drawable: null
  });

  // Create the three folder DOM nodes
  const folders = [
    { name: "Instances", icon: "fa-solid fa-list", children: instancesData, collapsed: true },
    { name: "Families", icon: "fa-solid fa-layer-group", children: familiesData, collapsed: true },
    { name: "Levels", icon: "fa-solid fa-building", children: levelsData, collapsed: true }
  ];

  folders.forEach(folder => {
    const folderLi = document.createElement("li");
    folderLi.className = "tree-node";

    const content = document.createElement("div");
    content.className = "tree-node-content rvt-folder-node";

    // Toggle
    const toggleSpan = document.createElement("span");
    toggleSpan.className = "tree-toggle" + (folder.collapsed ? " collapsed" : "");
    toggleSpan.innerHTML = folder.collapsed
      ? '<i class="fa-solid fa-chevron-right"></i>'
      : '<i class="fa-solid fa-chevron-down"></i>';
    content.appendChild(toggleSpan);

    // Folder icon
    const icon = document.createElement("i");
    icon.className = folder.icon;
    icon.style.marginRight = "5px";
    icon.style.color = "var(--accent)";
    icon.style.fontSize = "11px";
    content.appendChild(icon);

    // Label
    const label = document.createElement("span");
    label.className = "tree-label";
    label.innerText = folder.name;
    label.style.fontWeight = "600";
    content.appendChild(label);

    // Count badge
    const badge = document.createElement("span");
    badge.className = "tree-type";
    badge.innerText = `${folder.children.length}`;
    content.appendChild(badge);

    folderLi.appendChild(content);

    // Children container
    const childrenUl = document.createElement("ul");
    childrenUl.className = "tree-children" + (folder.collapsed ? " collapsed" : "");

    folder.children.forEach(childNode => {
      childrenUl.appendChild(createRevitTreeNode(childNode, modelInfo.id));
    });
    folderLi.appendChild(childrenUl);

    // Toggle expand/collapse
    toggleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = childrenUl.classList.toggle('collapsed');
      toggleSpan.classList.toggle('collapsed', isCollapsed);
      toggleSpan.innerHTML = isCollapsed
        ? '<i class="fa-solid fa-chevron-right"></i>'
        : '<i class="fa-solid fa-chevron-down"></i>';
    });

    parentUl.appendChild(folderLi);
  });
}

// Create a single Revit tree node DOM element (recursive)
function createRevitTreeNode(nodeData, modelId) {
  const li = document.createElement("li");
  li.className = "tree-node";
  if (nodeData.elementId) {
    li.dataset.id = nodeData.elementId;
  }

  const content = document.createElement("div");
  content.className = "tree-node-content";
  if (nodeData.elementId) {
    content.dataset.id = nodeData.elementId;
  }

  const hasChildren = nodeData.children && nodeData.children.length > 0;

  // Toggle
  const toggleSpan = document.createElement("span");
  toggleSpan.className = "tree-toggle";
  if (hasChildren) {
    toggleSpan.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    toggleSpan.classList.add('collapsed');
  } else {
    toggleSpan.innerHTML = '';
  }
  content.appendChild(toggleSpan);

  // Checkbox for visibility (only if drawable or has drawable children)
  const hasDrawableDescendant = nodeData.drawable || (hasChildren && nodeData.children.some(function hasAny(c) {
    return c.drawable || (c.children && c.children.some(hasAny));
  }));
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "tree-checkbox";
  if (hasDrawableDescendant) {
    checkbox.checked = nodeData.drawable ? nodeData.drawable.visible : true;
  } else {
    checkbox.checked = true;
  }
  content.appendChild(checkbox);

  // Label
  const label = document.createElement("span");
  label.className = "tree-label";
  label.innerText = nodeData.name;
  content.appendChild(label);

  // Type badge (class)
  if (nodeData.elementClass) {
    const typeSpan = document.createElement("span");
    typeSpan.className = "tree-type";
    typeSpan.innerText = nodeData.elementClass;
    content.appendChild(typeSpan);
  }

  li.appendChild(content);

  // Build children
  let childrenUl = null;
  if (hasChildren) {
    childrenUl = document.createElement("ul");
    childrenUl.className = "tree-children collapsed";

    const sortedChildren = [...nodeData.children].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    sortedChildren.forEach(childData => {
      childrenUl.appendChild(createRevitTreeNode(childData, modelId));
    });
    li.appendChild(childrenUl);
  }

  // Toggle expand/collapse
  if (hasChildren) {
    toggleSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = childrenUl.classList.toggle('collapsed');
      toggleSpan.classList.toggle('collapsed', isCollapsed);
      toggleSpan.innerHTML = isCollapsed
        ? '<i class="fa-solid fa-chevron-right"></i>'
        : '<i class="fa-solid fa-chevron-down"></i>';
    });
  }

  // Checkbox visibility toggle
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    const visible = checkbox.checked;

    const collectDrawableIds = (nd) => {
      let ids = [];
      if (nd.drawable) ids.push(nd.elementId);
      if (nd.children) nd.children.forEach(c => { ids = ids.concat(collectDrawableIds(c)); });
      return ids;
    };

    const leafIds = collectDrawableIds(nodeData);
    if (leafIds.length > 0) {
      viewer.scene.setObjectsVisible(leafIds, visible);
      updateStatus(`${visible ? "Shown" : "Hidden"} ${leafIds.length} elements.`);
    }

    if (childrenUl) {
      childrenUl.querySelectorAll('.tree-checkbox').forEach(cb => { cb.checked = visible; });
    }
    syncTreeCheckboxes();
  });

  // Click to select + fly-to
  content.addEventListener('click', (e) => {
    if (e.target.closest('.tree-checkbox') || e.target.closest('.tree-toggle')) return;

    if (nodeData.drawable) {
      handleObjectSelected(nodeData.drawable);
      viewer.cameraFlight.flyTo(nodeData.drawable);
    } else if (hasChildren) {
      // Select all drawable children and fly to bounding box
      const collectDrawableIds = (nd) => {
        let ids = [];
        if (nd.drawable) ids.push(nd.elementId);
        if (nd.children) nd.children.forEach(c => { ids = ids.concat(collectDrawableIds(c)); });
        return ids;
      };
      const leafIds = collectDrawableIds(nodeData);
      if (leafIds.length > 0) {
        viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
        viewer.scene.setObjectsSelected(leafIds, true);
        updateSelectionUI();
        const aabb = viewer.scene.getAABB(leafIds);
        viewer.cameraFlight.flyTo(aabb);
      }
    }
  });

  return li;
}

function syncTreeSelection() {
  document.querySelectorAll('.tree-node-content.selected').forEach(el => {
    el.classList.remove('selected');
  });

  const selectedIds = viewer.scene.selectedObjectIds;
  selectedIds.forEach(id => {
    const nodeContent = document.querySelector(`.tree-node-content[data-id="${id}"]`);
    if (nodeContent) {
      nodeContent.classList.add('selected');
      
      let parentLi = nodeContent.closest('.tree-node').parentElement.closest('.tree-node');
      while (parentLi) {
        const parentUl = parentLi.querySelector('.tree-children');
        const parentToggle = parentLi.querySelector('.tree-toggle');
        if (parentUl && parentUl.classList.contains('collapsed')) {
          parentUl.classList.remove('collapsed');
          if (parentToggle) {
            parentToggle.classList.remove('collapsed');
            parentToggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
          }
        }
        parentLi = parentLi.parentElement.closest('.tree-node');
      }
      
      nodeContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

function syncTreeCheckboxes() {
  document.querySelectorAll('.tree-node').forEach(li => {
    if (li.dataset.modelId) {
      const modelId = li.dataset.modelId;
      const checkbox = li.querySelector('.model-checkbox');
      if (checkbox) {
        const childCheckboxes = li.querySelectorAll('.tree-children .tree-checkbox');
        if (childCheckboxes.length > 0) {
          checkbox.checked = Array.from(childCheckboxes).some(cb => cb.checked);
        }
      }
      return;
    }

    const id = li.dataset.id;
    const checkbox = li.querySelector('.tree-checkbox');
    if (checkbox) {
      const entity = viewer.scene.objects[id];
      if (entity) {
        checkbox.checked = entity.visible;
      } else {
        const hasVisibleDescendants = (nodeId) => {
          const itemLi = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
          if (!itemLi) return false;
          const childCheckboxes = itemLi.querySelectorAll('.tree-children .tree-checkbox');
          if (childCheckboxes.length === 0) {
            const ent = viewer.scene.objects[nodeId];
            return ent ? ent.visible : false;
          }
          return Array.from(childCheckboxes).some(cb => cb.checked);
        };
        checkbox.checked = hasVisibleDescendants(id);
      }
    }
  });
}

// --- EPSG Coordinate Translation helper using Proj4 ---
function convertToLatLon(easting, northing, epsg) {
  let lat = northing;
  let lon = easting;

  if (epsg) {
    const digitsMatch = epsg.match(/\d+/);
    if (digitsMatch) {
      const code = parseInt(digitsMatch[0]);
      if (code !== 4326) {
        let projDef = "";
        if (code >= 32601 && code <= 32660) {
          const zone = code - 32600;
          projDef = `+proj=utm +zone=${zone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        } else if (code >= 32701 && code <= 32760) {
          const zone = code - 32700;
          projDef = `+proj=utm +zone=${zone} +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        }

        if (projDef) {
          try {
            const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";
            const result = proj4(projDef, wgs84, [easting, northing]);
            lat = result[1];
            lon = result[0];
          } catch (err) {
            console.error("Proj4 conversion failed:", err);
          }
        } else {
          console.warn(`Unsupported EPSG code: ${epsg}, defaulting to raw values.`);
        }
      }
    }
  }

  // Auto-detect swapped Latitude/Longitude coordinates (e.g. putting Latitude in Easting and Longitude in Northing)
  if ((lat > 90 || lat < -90) && (lon >= -90 && lon <= 90)) {
    console.log("Auto-detected swapped Latitude and Longitude coordinates. Swapping them.");
    const temp = lat;
    lat = lon;
    lon = temp;
  }

  return { lat, lon };
}

let terrainElevation = 0;
let lastSampledCoords = { lat: null, lon: null };

function updateTerrainElevation(lat, lon) {
  if (!cesiumViewer || !cesiumViewer._terrainLoaded || !cesiumViewer.terrainProvider) {
    terrainElevation = 0;
    return;
  }
  if (lastSampledCoords.lat === lat && lastSampledCoords.lon === lon) return;
  lastSampledCoords = { lat, lon };

  const pos = Cesium.Cartographic.fromDegrees(lon, lat);
  Cesium.sampleTerrainMostDetailed(cesiumViewer.terrainProvider, [pos]).then((results) => {
    if (results && results[0] && results[0].height !== undefined) {
      terrainElevation = results[0].height;
      console.log("Updated terrain elevation for location:", terrainElevation);
      if (isCesiumActive) {
        syncCameras();
      }
    }
  }).catch((err) => {
    console.error("Failed to sample terrain elevation:", err);
  });
}

// --- Real-time synchronization loop ---
function syncCameras() {
  if (!isCesiumActive || !cesiumViewer || !activeGeoreference) return;

  const easting = activeGeoreference.easting || 0;
  const northing = activeGeoreference.northing || 0;
  const trueNorthAngle = activeGeoreference.trueNorth || 0;
  const epsg = activeGeoreference.epsg || "";

  // Convert coordinate to WGS84 latitude/longitude
  const coords = convertToLatLon(easting, northing, epsg);
  const lat = coords.lat;
  const lon = coords.lon;

  // Trigger async terrain height sampling
  updateTerrainElevation(lat, lon);

  const localOffset = activeGeoreference.verticalDatum ? parseFloat(activeGeoreference.verticalDatum) || 0 : 0;
  const height = terrainElevation + localOffset;

  // 1. Get local reference frame centered at WGS84 coordinate
  const centerCartographic = Cesium.Cartographic.fromDegrees(lon, lat, height);
  const centerCartesian = Cesium.Ellipsoid.WGS84.cartographicToCartesian(centerCartographic);
  const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(centerCartesian);

  // 2. Fetch xeokit camera configuration
  const eye = viewer.camera.eye;
  const look = viewer.camera.look;
  const up = viewer.camera.up;

  // True North rotation angle (clockwise rotation around Y axis)
  const alpha = trueNorthAngle * Math.PI / 180;
  const rotateY = (x, z) => {
    const cos = Math.cos(alpha);
    const sin = Math.sin(alpha);
    return {
      x: x * cos + z * sin,
      z: -x * sin + z * cos
    };
  };

  const eyeRot = rotateY(eye[0], eye[2]);
  const lookRot = rotateY(look[0], look[2]);
  const upRot = rotateY(up[0], up[2]);

  // xeokit Y is Up, X is East, positive Z is South
  const eyeENU = new Cesium.Cartesian3(eyeRot.x, -eyeRot.z, eye[1]);
  const lookENU = new Cesium.Cartesian3(lookRot.x, -lookRot.z, look[1]);
  const upENU = new Cesium.Cartesian3(upRot.x, -upRot.z, up[1]);

  // Translate local offsets into ECEF cartesian space
  const eyeECEF = Cesium.Matrix4.multiplyByPoint(localFrame, eyeENU, new Cesium.Cartesian3());
  const lookECEF = Cesium.Matrix4.multiplyByPoint(localFrame, lookENU, new Cesium.Cartesian3());
  const upECEF = Cesium.Matrix4.multiplyByPointAsVector(localFrame, upENU, new Cesium.Cartesian3());

  // Compute camera viewing vectors
  const directionECEF = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(lookECEF, eyeECEF, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const upNormalizedECEF = Cesium.Cartesian3.normalize(upECEF, new Cesium.Cartesian3());

  // Synchronize Cesium's viewport camera
  cesiumViewer.camera.setView({
    destination: eyeECEF,
    orientation: {
      direction: directionECEF,
      up: upNormalizedECEF
    }
  });
}

// Helper to initialize or recreate Cesium viewer depending on token changes
function initCesiumViewer(tokenVal) {
  // Recreate viewer if token changed or viewer doesn't exist
  if (cesiumViewer && cesiumViewer._loadedToken !== tokenVal) {
    cesiumViewer.destroy();
    cesiumViewer = null;
    if (cesiumTickUnsubscribe) {
      viewer.scene.off(cesiumTickUnsubscribe);
      cesiumTickUnsubscribe = null;
    }
  }

  if (!cesiumViewer) {
    if (tokenVal) {
      Cesium.Ion.defaultAccessToken = tokenVal;
    }

    cesiumViewer = new Cesium.Viewer('cesiumContainer', {
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      // Load Esri World Imagery (Satellite) as the base layer
      baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        credit: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }))
    });
    
    cesiumViewer._loadedToken = tokenVal;
    cesiumViewer._terrainLoaded = false;
    cesiumViewer._osmBuildingsLoaded = false;
  }

  // Load terrain and buildings if token is active
  if (tokenVal) {
    if (!cesiumViewer._terrainLoaded) {
      Cesium.createWorldTerrainAsync().then((terrainProvider) => {
        if (cesiumViewer) {
          cesiumViewer.terrainProvider = terrainProvider;
          cesiumViewer._terrainLoaded = true;
          updateStatus("Cesium 3D World Terrain loaded successfully.");
        }
      }).catch((err) => {
        console.error("Failed to load 3D terrain:", err);
      });
    }

    if (!cesiumViewer._osmBuildingsLoaded) {
      Cesium.createOsmBuildingsAsync().then((osmBuildingsTileset) => {
        if (cesiumViewer) {
          cesiumViewer.scene.primitives.add(osmBuildingsTileset);
          // Style buildings with a beautiful semi-translucent dark slate color that fits our dark theme
          osmBuildingsTileset.style = new Cesium.Cesium3DTileStyle({
            color: {
              conditions: [
                ["true", "color('rgba(38, 50, 72, 0.75)')"]
              ]
            }
          });
          cesiumViewer._osmBuildingsLoaded = true;
        }
      }).catch((err) => {
        console.error("Failed to load OSM Buildings:", err);
      });
    }
  }
}

// Toggle Cesium globe streaming
btnToggleCesium.addEventListener('click', () => {
  if (loadedModels.length === 0) return;

  // Validate georeference inputs are populated
  const hasCoordinates = activeGeoreference && 
                        activeGeoreference.easting !== null && 
                        activeGeoreference.northing !== null;

  if (!hasCoordinates) {
    updateStatus("Please configure georeference coordinates first.", true);
    return;
  }

  isCesiumActive = !isCesiumActive;

  if (isCesiumActive) {
    // Show container
    cesiumContainer.style.display = "block";

    const tokenVal = geoCesiumToken.value.trim();
    initCesiumViewer(tokenVal);

    // Bind tick synchronization listener
    if (!cesiumTickUnsubscribe) {
      cesiumTickUnsubscribe = viewer.scene.on("tick", syncCameras);
    }

    // Trigger immediate synchronization
    syncCameras();

    btnToggleCesium.innerHTML = '<i class="fa-solid fa-earth-americas"></i> Deactivate Cesium Globe';
    btnToggleCesium.className = 'btn btn-danger btn-full';
    
    if (tokenVal) {
      updateStatus("Cesium 3D Terrain & Buildings active (using Ion token).");
    } else {
      updateStatus("Cesium satellite map active. Input a Cesium Ion Token to load 3D terrain & buildings.");
    }
  } else {
    // Hide container
    cesiumContainer.style.display = "none";

    // Unbind tick listener
    if (cesiumTickUnsubscribe) {
      viewer.scene.off(cesiumTickUnsubscribe);
      cesiumTickUnsubscribe = null;
    }

    btnToggleCesium.innerHTML = '<i class="fa-solid fa-earth-americas"></i> Activate Cesium Globe';
    btnToggleCesium.className = 'btn btn-secondary btn-full';
    updateStatus("Cesium globe background streaming deactivated.");
  }
});

// --- Interactive Measurement System ---
let hover3DPos = null;
let hoverSnapped = false;

function initMeasurementSystem() {
  // Setup plugins
  distanceMeasurements = new DistanceMeasurementsPlugin(viewer);
  distanceControl = new DistanceMeasurementsMouseControl(distanceMeasurements, {
    pointerLens: new PointerLens(viewer),
    snapping: true
  });

  angleMeasurements = new AngleMeasurementsPlugin(viewer);
  angleControl = new AngleMeasurementsMouseControl(angleMeasurements, {
    pointerLens: new PointerLens(viewer),
    snapping: true
  });

  // Hide pointer lenses initially
  if (distanceControl.pointerLens) distanceControl.pointerLens.visible = false;
  if (angleControl.pointerLens) angleControl.pointerLens.visible = false;

  // Bind HTML UI Buttons
  const btnDist = document.getElementById("btnMeasureDistance");
  const btnMultiline = document.getElementById("btnMeasureMultiline");
  const btnAngle = document.getElementById("btnMeasureAngle");
  const btnArea = document.getElementById("btnMeasureArea");
  const btnSpot = document.getElementById("btnSpotElevation");
  const btnClear = document.getElementById("btnClearMeasurements");
  const chkSnap = document.getElementById("chkMeasurementSnap");

  if (btnDist) btnDist.addEventListener("click", () => setMeasurementMode("distance"));
  if (btnMultiline) btnMultiline.addEventListener("click", () => setMeasurementMode("multiline"));
  if (btnAngle) btnAngle.addEventListener("click", () => setMeasurementMode("angle"));
  if (btnArea) btnArea.addEventListener("click", () => setMeasurementMode("area"));
  if (btnSpot) btnSpot.addEventListener("click", () => setMeasurementMode("spotelev"));
  if (btnClear) btnClear.addEventListener("click", clearAllMeasurements);

  if (chkSnap) {
    chkSnap.addEventListener("change", () => {
      const snap = chkSnap.checked;
      distanceControl.snapping = snap;
      angleControl.snapping = snap;
    });
  }

  // Bind mouse events on the canvas
  const canvas = viewer.scene.canvas.canvas;

  canvas.addEventListener("mousemove", (e) => {
    if (activeMeasurementMode !== "area" && activeMeasurementMode !== "spotelev" && activeMeasurementMode !== "multiline") {
      updateSnapPreview(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const canvasPos = [e.clientX - rect.left, e.clientY - rect.top];

    const snapEnabled = chkSnap ? chkSnap.checked : true;
    const pickResult = viewer.scene.pick({
      canvasPos: canvasPos,
      pickSurface: true,
      snapToVertex: snapEnabled,
      snapToEdge: snapEnabled,
      snapRadius: 15
    });

    if (pickResult) {
      hover3DPos = pickResult.worldPos;
      hoverSnapped = pickResult.snapped;
      updateSnapPreview(pickResult);

    } else {
      hover3DPos = null;
      hoverSnapped = false;
      updateSnapPreview(null);
    }

    if (activeMeasurementMode === "area" && areaPoints.length > 0) {
      updateAreaOverlay();
    } else if (activeMeasurementMode === "multiline" && multilinePoints.length > 0) {
      updateMultilineOverlay();
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // Left click only
    if (activeMeasurementMode !== "area" && activeMeasurementMode !== "spotelev" && activeMeasurementMode !== "multiline") return;

    if (!hover3DPos) return;

    if (activeMeasurementMode === "spotelev") {
      placeSpotElevation(hover3DPos);
    } else if (activeMeasurementMode === "area") {
      // Close polygon if clicking near starting point
      if (areaPoints.length >= 3) {
        const p0Canvas = viewer.camera.projectWorldPos(areaPoints[0]);
        if (p0Canvas) {
          const rect = canvas.getBoundingClientRect();
          const clickCanvasPos = [e.clientX - rect.left, e.clientY - rect.top];
          const dist = Math.hypot(clickCanvasPos[0] - p0Canvas[0], clickCanvasPos[1] - p0Canvas[1]);
          if (dist < 15) {
            finalizeAreaDrawing();
            return;
          }
        }
      }
      addAreaPoint(hover3DPos);
    } else if (activeMeasurementMode === "multiline") {
      // Finalize multiline if clicking near start point
      if (multilinePoints.length >= 2) {
        const p0Canvas = viewer.camera.projectWorldPos(multilinePoints[0]);
        if (p0Canvas) {
          const rect = canvas.getBoundingClientRect();
          const clickCanvasPos = [e.clientX - rect.left, e.clientY - rect.top];
          const dist = Math.hypot(clickCanvasPos[0] - p0Canvas[0], clickCanvasPos[1] - p0Canvas[1]);
          if (dist < 15) {
            finalizeMultilineDrawing();
            return;
          }
        }
      }
      addMultilinePoint(hover3DPos);
    }
  });

  canvas.addEventListener("dblclick", (e) => {
    if (activeMeasurementMode === "area" && areaPoints.length > 2) {
      // Pop the duplicate points added by click events during double click
      areaPoints.pop();
      areaPoints.pop();
      finalizeAreaDrawing();
    } else if (activeMeasurementMode === "multiline" && multilinePoints.length > 1) {
      multilinePoints.pop();
      multilinePoints.pop();
      finalizeMultilineDrawing();
    }
  });

  // Camera dirty/render frame sync updates
  viewer.scene.on("tick", () => {
    if (activeMeasurementMode === "area") {
      updateAreaOverlay();
    } else if (activeMeasurementMode === "multiline") {
      updateMultilineOverlay();
    }
    updateFinalizedAreaProjections();
    updateSpotElevationProjections();
    updateFinalizedMultilineProjections();
  });
}

function setMeasurementMode(mode) {
  if (activeMeasurementMode === mode) {
    mode = null;
  }

  // Deactivate current active plugins
  if (activeMeasurementMode === "distance") {
    distanceControl.deactivate();
  } else if (activeMeasurementMode === "angle") {
    angleControl.deactivate();
  }

  areaPoints = [];
  multilinePoints = [];
  updateAreaOverlay();
  updateMultilineOverlay();
  updateSnapPreview(null);

  activeMeasurementMode = mode;

  const buttons = {
    distance: document.getElementById("btnMeasureDistance"),
    multiline: document.getElementById("btnMeasureMultiline"),
    angle: document.getElementById("btnMeasureAngle"),
    area: document.getElementById("btnMeasureArea"),
    spotelev: document.getElementById("btnSpotElevation")
  };

  Object.keys(buttons).forEach(k => {
    if (buttons[k]) {
      if (k === mode) {
        buttons[k].classList.add("active");
      } else {
        buttons[k].classList.remove("active");
      }
    }
  });

  if (mode === "distance") {
    const snap = document.getElementById("chkMeasurementSnap").checked;
    distanceControl.snapping = snap;
    distanceControl.activate();
  } else if (mode === "angle") {
    const snap = document.getElementById("chkMeasurementSnap").checked;
    angleControl.snapping = snap;
    angleControl.activate();
  }

  const canvas = viewer.scene.canvas.canvas;
  if (mode === "area" || mode === "spotelev" || mode === "multiline") {
    canvas.style.cursor = "crosshair";
  } else {
    canvas.style.cursor = "default";
  }

  updateStatus(mode ? `Measurement mode: ${mode.toUpperCase()} active.` : "Measurement mode cleared.");
}

function projectPosition(worldPos) {
  const viewMat = viewer.camera.viewMatrix;
  const x = worldPos[0], y = worldPos[1], z = worldPos[2];
  const viewZ = x * viewMat[2] + y * viewMat[6] + z * viewMat[10] + viewMat[14];
  if (viewZ >= 0) return null; // Behind camera

  const canvasPos = viewer.camera.projectWorldPos(worldPos);
  if (!canvasPos) return null;
  return { x: canvasPos[0], y: canvasPos[1] };
}

function updateSnapPreview(pickResult) {
  const overlay = document.getElementById("measurementOverlay");
  let snapCircle = document.getElementById("activeSnapCircle");

  if (!pickResult || !activeMeasurementMode || (activeMeasurementMode !== "area" && activeMeasurementMode !== "spotelev" && activeMeasurementMode !== "multiline")) {
    if (snapCircle) snapCircle.remove();
    return;
  }

  const projected = projectPosition(pickResult.worldPos);
  if (!projected) {
    if (snapCircle) snapCircle.remove();
    return;
  }

  if (!snapCircle) {
    snapCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    snapCircle.setAttribute("id", "activeSnapCircle");
    overlay.appendChild(snapCircle);
  }

  snapCircle.setAttribute("cx", projected.x);
  snapCircle.setAttribute("cy", projected.y);

  if (pickResult.snapped) {
    snapCircle.setAttribute("r", 6);
    snapCircle.setAttribute("fill", "#10b981");
    snapCircle.setAttribute("stroke", "#ffffff");
    snapCircle.setAttribute("stroke-width", 1.5);
    snapCircle.setAttribute("style", "filter: drop-shadow(0 0 4px #10b981);");
  } else {
    snapCircle.setAttribute("r", 4);
    snapCircle.setAttribute("fill", "#06b6d4");
    snapCircle.setAttribute("stroke", "#ffffff");
    snapCircle.setAttribute("stroke-width", 1.5);
    snapCircle.setAttribute("style", "filter: drop-shadow(0 0 3px #06b6d4);");
  }
}

function addAreaPoint(pos) {
  areaPoints.push([...pos]);
  updateAreaOverlay();
}

function updateAreaOverlay() {
  const overlay = document.getElementById("measurementOverlay");
  let activeGroup = document.getElementById("activeAreaGroup");

  if (activeGroup) {
    activeGroup.innerHTML = "";
  } else {
    activeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    activeGroup.setAttribute("id", "activeAreaGroup");
    overlay.appendChild(activeGroup);
  }

  if (activeMeasurementMode !== "area" || areaPoints.length === 0) {
    return;
  }

  const pointsToDraw = [...areaPoints];
  if (hover3DPos) {
    pointsToDraw.push(hover3DPos);
  }

  const projected = pointsToDraw.map(p => projectPosition(p)).filter(p => p !== null);

  if (projected.length > 1) {
    for (let i = 0; i < projected.length - 1; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", projected[i].x);
      line.setAttribute("y1", projected[i].y);
      line.setAttribute("x2", projected[i+1].x);
      line.setAttribute("y2", projected[i+1].y);

      if (hover3DPos && i === projected.length - 2) {
        line.setAttribute("class", "area-svg-line");
      } else {
        line.setAttribute("class", "area-svg-line-solid");
      }
      activeGroup.appendChild(line);
    }
  }

  projected.forEach((p, idx) => {
    if (hover3DPos && idx === projected.length - 1) return;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", 5);
    circle.setAttribute("class", "area-svg-vertex");
    activeGroup.appendChild(circle);
  });
}

function calculateArea3D(vertices) {
  if (vertices.length < 3) return 0;

  const p0 = vertices[0];
  const p1 = vertices[1];
  const p2 = vertices[2];

  const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

  const N = [
    v1[1]*v2[2] - v1[2]*v2[1],
    v1[2]*v2[0] - v1[0]*v2[2],
    v1[0]*v2[1] - v1[1]*v2[0]
  ];

  const len = Math.hypot(N[0], N[1], N[2]);
  if (len === 0) return 0;
  N[0] /= len;
  N[1] /= len;
  N[2] /= len;

  let U = [];
  if (Math.abs(N[2]) < 0.9) {
    U = [N[1], -N[0], 0];
  } else {
    U = [0, N[2], -N[1]];
  }
  const lenU = Math.hypot(U[0], U[1], U[2]);
  U[0] /= lenU;
  U[1] /= lenU;
  U[2] /= lenU;

  const V = [
    N[1]*U[2] - N[2]*U[1],
    N[2]*U[0] - N[0]*U[2],
    N[0]*U[1] - N[1]*U[0]
  ];

  const pts2d = vertices.map(p => {
    return {
      x: p[0]*U[0] + p[1]*U[1] + p[2]*U[2],
      y: p[0]*V[0] + p[1]*V[1] + p[2]*V[2]
    };
  });

  let sum = 0;
  const n = pts2d.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += pts2d[i].x * pts2d[j].y - pts2d[j].x * pts2d[i].y;
  }
  return Math.abs(sum) / 2;
}

function finalizeAreaDrawing() {
  if (areaPoints.length < 3) {
    areaPoints = [];
    updateAreaOverlay();
    return;
  }

  const areaValue = calculateArea3D(areaPoints);

  const overlay = document.getElementById("measurementOverlay");
  const svgGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgGroup.setAttribute("class", "finalized-area-group");

  const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  pathElement.setAttribute("class", "area-svg-polygon");
  svgGroup.appendChild(pathElement);

  const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textElement.setAttribute("class", "area-svg-text");
  svgGroup.appendChild(textElement);

  const vertexElements = [];
  areaPoints.forEach(() => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", 4);
    circle.setAttribute("class", "area-svg-vertex");
    svgGroup.appendChild(circle);
    vertexElements.push(circle);
  });

  overlay.appendChild(svgGroup);

  finalizedAreas.push({
    vertices: [...areaPoints],
    areaValue: areaValue,
    svgGroup: svgGroup,
    pathElement: pathElement,
    textElement: textElement,
    vertexElements: vertexElements
  });

  const finalVal = areaValue;
  areaPoints = [];
  updateAreaOverlay();
  updateFinalizedAreaProjections();

  updateStatus(`Area closed. Calculated Area: ${finalVal.toFixed(2)} m²`);
}

function updateFinalizedAreaProjections() {
  finalizedAreas.forEach(area => {
    const projected = area.vertices.map(v => projectPosition(v));
    const allVisible = projected.every(p => p !== null);

    if (!allVisible) {
      area.svgGroup.style.display = "none";
      return;
    }

    area.svgGroup.style.display = "block";

    const pointsStr = projected.map(p => `${p.x},${p.y}`).join(" ");
    area.pathElement.setAttribute("points", pointsStr);

    projected.forEach((p, idx) => {
      if (area.vertexElements[idx]) {
        area.vertexElements[idx].setAttribute("cx", p.x);
        area.vertexElements[idx].setAttribute("cy", p.y);
      }
    });

    let centX = 0;
    let centY = 0;
    projected.forEach(p => {
      centX += p.x;
      centY += p.y;
    });
    centX /= projected.length;
    centY /= projected.length;

    area.textElement.setAttribute("x", centX);
    area.textElement.setAttribute("y", centY);
    area.textElement.textContent = `${area.areaValue.toFixed(2)} m²`;
  });
}

function addMultilinePoint(pos) {
  multilinePoints.push([...pos]);
  updateMultilineOverlay();
}

function updateMultilineOverlay() {
  const overlay = document.getElementById("measurementOverlay");
  let activeGroup = document.getElementById("activeMultilineGroup");

  if (activeGroup) {
    activeGroup.innerHTML = "";
  } else {
    activeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    activeGroup.setAttribute("id", "activeMultilineGroup");
    overlay.appendChild(activeGroup);
  }

  if (activeMeasurementMode !== "multiline" || multilinePoints.length === 0) {
    return;
  }

  const pointsToDraw = [...multilinePoints];
  if (hover3DPos) {
    pointsToDraw.push(hover3DPos);
  }

  const projected = pointsToDraw.map(p => projectPosition(p)).filter(p => p !== null);

  if (projected.length > 1) {
    for (let i = 0; i < projected.length - 1; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", projected[i].x);
      line.setAttribute("y1", projected[i].y);
      line.setAttribute("x2", projected[i+1].x);
      line.setAttribute("y2", projected[i+1].y);

      if (hover3DPos && i === projected.length - 2) {
        line.setAttribute("class", "area-svg-line");
      } else {
        line.setAttribute("class", "multiline-svg-line");
      }
      activeGroup.appendChild(line);

      const p1_3d = pointsToDraw[i];
      const p2_3d = pointsToDraw[i+1];
      const segmentDist = Math.hypot(p2_3d[0] - p1_3d[0], p2_3d[1] - p1_3d[1], p2_3d[2] - p1_3d[2]);

      const midX = (projected[i].x + projected[i+1].x) / 2;
      const midY = (projected[i].y + projected[i+1].y) / 2;

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", midX);
      text.setAttribute("y", midY);
      text.setAttribute("class", "multiline-svg-text-segment");
      text.textContent = `${segmentDist.toFixed(2)}m`;
      activeGroup.appendChild(text);
    }
  }

  if (projected.length > 0 && multilinePoints.length > 0) {
    let runningTotal = 0;
    for (let i = 0; i < multilinePoints.length - 1; i++) {
      const p1 = multilinePoints[i];
      const p2 = multilinePoints[i+1];
      runningTotal += Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    }

    const lastProj = projected[multilinePoints.length - 1];
    if (lastProj) {
      const textTotal = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textTotal.setAttribute("x", lastProj.x);
      textTotal.setAttribute("y", lastProj.y - 18);
      textTotal.setAttribute("class", "multiline-svg-text-total");
      textTotal.textContent = `Total: ${runningTotal.toFixed(2)} m`;
      activeGroup.appendChild(textTotal);
    }
  }

  projected.forEach((p, idx) => {
    if (hover3DPos && idx === projected.length - 1) return;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", 5);
    circle.setAttribute("class", "area-svg-vertex");
    activeGroup.appendChild(circle);
  });
}

function finalizeMultilineDrawing() {
  if (multilinePoints.length < 2) {
    multilinePoints = [];
    updateMultilineOverlay();
    return;
  }

  let totalDistance = 0;
  const segments = [];
  for (let i = 0; i < multilinePoints.length - 1; i++) {
    const p1 = multilinePoints[i];
    const p2 = multilinePoints[i+1];
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    totalDistance += d;
    segments.push(d);
  }

  const overlay = document.getElementById("measurementOverlay");
  const svgGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgGroup.setAttribute("class", "finalized-multiline-group");

  const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathElement.setAttribute("class", "multiline-svg-line");
  pathElement.setAttribute("fill", "none");
  svgGroup.appendChild(pathElement);

  const segmentTextElements = [];
  for (let i = 0; i < multilinePoints.length - 1; i++) {
    const textSegment = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textSegment.setAttribute("class", "multiline-svg-text-segment");
    svgGroup.appendChild(textSegment);
    segmentTextElements.push(textSegment);
  }

  const totalTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
  totalTextElement.setAttribute("class", "multiline-svg-text-total");
  svgGroup.appendChild(totalTextElement);

  const vertexElements = [];
  multilinePoints.forEach(() => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", 4);
    circle.setAttribute("class", "area-svg-vertex");
    svgGroup.appendChild(circle);
    vertexElements.push(circle);
  });

  overlay.appendChild(svgGroup);

  finalizedMultilines.push({
    vertices: [...multilinePoints],
    segments: segments,
    totalDistance: totalDistance,
    svgGroup: svgGroup,
    pathElement: pathElement,
    segmentTextElements: segmentTextElements,
    totalTextElement: totalTextElement,
    vertexElements: vertexElements
  });

  const finalVal = totalDistance;
  multilinePoints = [];
  updateMultilineOverlay();
  updateFinalizedMultilineProjections();

  updateStatus(`Multiline closed. Total Distance: ${finalVal.toFixed(2)} m`);
}

function updateFinalizedMultilineProjections() {
  finalizedMultilines.forEach(ml => {
    const projected = ml.vertices.map(v => projectPosition(v));
    const allVisible = projected.every(p => p !== null);

    if (!allVisible) {
      ml.svgGroup.style.display = "none";
      return;
    }

    ml.svgGroup.style.display = "block";

    let dStr = "";
    projected.forEach((p, idx) => {
      if (idx === 0) {
        dStr += `M ${p.x} ${p.y}`;
      } else {
        dStr += ` L ${p.x} ${p.y}`;
      }
    });
    ml.pathElement.setAttribute("d", dStr);

    projected.forEach((p, idx) => {
      if (ml.vertexElements[idx]) {
        ml.vertexElements[idx].setAttribute("cx", p.x);
        ml.vertexElements[idx].setAttribute("cy", p.y);
      }
    });

    for (let i = 0; i < projected.length - 1; i++) {
      if (ml.segmentTextElements[i]) {
        const midX = (projected[i].x + projected[i+1].x) / 2;
        const midY = (projected[i].y + projected[i+1].y) / 2;
        ml.segmentTextElements[i].setAttribute("x", midX);
        ml.segmentTextElements[i].setAttribute("y", midY);
        ml.segmentTextElements[i].textContent = `${ml.segments[i].toFixed(2)}m`;
      }
    }

    const lastProj = projected[projected.length - 1];
    if (lastProj && ml.totalTextElement) {
      ml.totalTextElement.setAttribute("x", lastProj.x);
      ml.totalTextElement.setAttribute("y", lastProj.y - 18);
      ml.totalTextElement.textContent = `Total: ${ml.totalDistance.toFixed(2)} m`;
    }
  });
}

function placeSpotElevation(worldPos) {
  const container = document.getElementById("elevationOverlay");

  const labelNode = document.createElement("div");
  labelNode.className = "spot-elevation-marker";

  const dotNode = document.createElement("div");
  dotNode.className = "spot-elevation-dot";
  labelNode.appendChild(dotNode);

  const tagNode = document.createElement("div");
  tagNode.className = "spot-elevation-tag";

  const localY = worldPos[1];
  let datumOffset = 0;
  const geoVerticalDatumEl = document.getElementById("geoVerticalDatum");
  if (geoVerticalDatumEl && geoVerticalDatumEl.value) {
    const val = parseFloat(geoVerticalDatumEl.value);
    if (!isNaN(val)) {
      datumOffset = val;
    }
  }

  const displayElev = localY + datumOffset;
  tagNode.textContent = `EL: ${displayElev.toFixed(3)} m`;
  labelNode.appendChild(tagNode);
  container.appendChild(labelNode);

  spotElevations.push({
    worldPos: [...worldPos],
    element: labelNode,
    textNode: tagNode,
    localY: localY
  });

  updateSpotElevationProjections();
  updateStatus(`Spot elevation placed: ${displayElev.toFixed(3)} m`);
}

function updateSpotElevationProjections() {
  let datumOffset = 0;
  const geoVerticalDatumEl = document.getElementById("geoVerticalDatum");
  if (geoVerticalDatumEl && geoVerticalDatumEl.value) {
    const val = parseFloat(geoVerticalDatumEl.value);
    if (!isNaN(val)) {
      datumOffset = val;
    }
  }

  spotElevations.forEach(se => {
    const projected = projectPosition(se.worldPos);
    if (!projected) {
      se.element.style.display = "none";
      return;
    }

    se.element.style.display = "flex";
    se.element.style.left = `${projected.x}px`;
    se.element.style.top = `${projected.y}px`;

    const displayElev = se.localY + datumOffset;
    se.textNode.textContent = `EL: ${displayElev.toFixed(3)} m`;
  });
}

function clearAllMeasurements() {
  console.log("Debug: clearAllMeasurements called.");
  if (distanceMeasurements) distanceMeasurements.clear();
  if (angleMeasurements) angleMeasurements.clear();

  finalizedAreas.forEach(area => {
    if (area.svgGroup) area.svgGroup.remove();
  });
  finalizedAreas = [];
  areaPoints = [];
  updateAreaOverlay();

  finalizedMultilines.forEach(ml => {
    if (ml.svgGroup) ml.svgGroup.remove();
  });
  finalizedMultilines = [];
  multilinePoints = [];
  updateMultilineOverlay();

  spotElevations.forEach(se => {
    if (se.element) se.element.remove();
  });
  spotElevations = [];

  updateSnapPreview(null);

  if (activeMeasurementMode) {
    setMeasurementMode(null);
  }

  updateStatus("All measurements and spot elevations cleared.");
}

// --- Collapsible Side Panels ---
function initCollapsiblePanels() {
  document.querySelectorAll('.panel-section').forEach(section => {
    // Skip if already processed or has no h3 header
    if (section.querySelector('.panel-header') || section.id === 'noSelectionPrompt') return;
    const title = section.querySelector('h3');
    if (!title) return;

    // Create header container
    const header = document.createElement('div');
    header.className = 'panel-header';

    // Move title into header
    title.parentNode.insertBefore(header, title);
    header.appendChild(title);

    // Create toggle chevron icon
    const toggleIcon = document.createElement('i');
    toggleIcon.className = 'fa-solid fa-chevron-down toggle-icon';
    header.appendChild(toggleIcon);

    // Create content wrapper
    const content = document.createElement('div');
    content.className = 'panel-content';

    // Move all remaining elements into content wrapper
    const children = Array.from(section.childNodes);
    children.forEach(child => {
      if (child !== header) {
        content.appendChild(child);
      }
    });
    
    // Clean up empty text nodes and append content wrapper
    section.innerHTML = '';
    section.appendChild(header);
    section.appendChild(content);

    // Decide initial state
    const titleText = title.textContent.trim().toLowerCase();
    const shouldStartExpanded = 
      titleText.includes('load model') || 
      titleText.includes('rvt to xkt') || 
      titleText.includes('model tree') || 
      titleText.includes('ifc diff');

    if (!shouldStartExpanded) {
      header.classList.add('collapsed');
      content.classList.add('collapsed');
    }

    // Bind click toggle action
    header.addEventListener('click', () => {
      const isCollapsed = header.classList.toggle('collapsed');
      content.classList.toggle('collapsed', isCollapsed);
    });
  });
}

// --- Initialize App ---
function startApp() {
  initCollapsiblePanels();
  initViewer();
  setupIfcOpenShellTools();
  updateStatus("BIM Viewer initialized. Ready for user files.");
}

// --- IfcOpenShell Python Tools Integration ---
function setupIfcOpenShellTools() {
  console.log("[IfcOpenShell Tools] Initializing frontend tools...");

  // 1. Tab switching logic
  const tabButtons = document.querySelectorAll('.sidebar-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.style.display = 'none');

      btn.classList.add('active');
      const activePane = document.getElementById(targetTab);
      if (activePane) {
        activePane.style.display = 'block';
      }
    });
  });

  // 2. IFC Diff Tool
  const btnRunDiff = document.getElementById('btnRunDiff');
  const diffOldModelSelect = document.getElementById('diffOldModelSelect');
  const diffNewModelSelect = document.getElementById('diffNewModelSelect');
  const diffResults = document.getElementById('diffResults');
  const diffAddedVal = document.getElementById('diffAddedVal');
  const diffDeletedVal = document.getElementById('diffDeletedVal');
  const diffChangedVal = document.getElementById('diffChangedVal');
  const btnHighlightDiff = document.getElementById('btnHighlightDiff');
  const btnClearDiff = document.getElementById('btnClearDiff');
  const diffList = document.getElementById('diffList');

  let latestDiffResult = null;

  btnRunDiff.addEventListener('click', async () => {
    const oldModel = loadedModels.find(m => m.id === diffOldModelSelect.value);
    const newModel = loadedModels.find(m => m.id === diffNewModelSelect.value);

    if (!oldModel || !newModel) {
      alert("Please select both old and new IFC models.");
      return;
    }

    const oldFile = oldModel.file;
    const newFile = newModel.file;

    showLoader("Running IFC Diff", "Comparing IFC models on the server. This may take a moment...", 20);
    const formData = new FormData();
    formData.append('oldFile', oldFile);
    formData.append('newFile', newFile);

    try {
      const response = await fetch('/api/python/ifcdiff', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Diff failed on backend');
      }

      const result = await response.json();
      latestDiffResult = result;

      // Update UI counts
      diffAddedVal.innerText = result.added ? result.added.length : 0;
      diffDeletedVal.innerText = result.deleted ? result.deleted.length : 0;
      diffChangedVal.innerText = result.changed ? result.changed.length : 0;

      // Clear list and render elements
      diffList.innerHTML = "";
      
      const renderItem = (guid, typeClass, label) => {
        const li = document.createElement('li');
        li.className = `diff-list-item ${typeClass}`;
        li.innerHTML = `<span class="el-id">${guid}</span> <span class="badge ${typeClass}" style="font-size:9px; padding:2px 4px; border-radius:3px;">${label}</span>`;
        li.addEventListener('click', () => {
          // Clear current selection
          viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
          viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
          
          const obj = viewer.scene.objects[guid];
          if (obj) {
            obj.selected = true;
            obj.highlighted = true;
            viewer.cameraFlight.flyTo(obj);
          } else {
            updateStatus(`Element ${guid} not found in currently loaded view.`, true);
          }
        });
        diffList.appendChild(li);
      };

      if (result.added) result.added.forEach(guid => renderItem(guid, 'added', 'Added'));
      if (result.changed) result.changed.forEach(guid => renderItem(guid, 'changed', 'Changed'));
      if (result.deleted) result.deleted.forEach(guid => renderItem(guid, 'deleted', 'Deleted'));

      diffResults.style.display = 'block';
      hideLoader();
      updateStatus("IFC Diff completed successfully.");
    } catch (err) {
      hideLoader();
      updateStatus(`Diff failed: ${err.message}`, true);
      alert(`Error running diff: ${err.message}`);
    }
  });

  btnHighlightDiff.addEventListener('click', () => {
    if (!latestDiffResult) return;

    // Reset current colorization & XRay
    const allIds = viewer.scene.objectIds;
    viewer.scene.setObjectsXRayed(allIds, true);

    // Colorize Added -> Green
    if (latestDiffResult.added) {
      latestDiffResult.added.forEach(guid => {
        const obj = viewer.scene.objects[guid];
        if (obj) {
          obj.xrayed = false;
          obj.colorize = [0.0, 0.8, 0.0];
        }
      });
    }

    // Colorize Changed -> Yellow
    if (latestDiffResult.changed) {
      latestDiffResult.changed.forEach(guid => {
        const obj = viewer.scene.objects[guid];
        if (obj) {
          obj.xrayed = false;
          obj.colorize = [0.8, 0.8, 0.0];
        }
      });
    }

    updateStatus("Diff highlighted: Green = Added, Yellow = Changed. Other elements X-Rayed.");
  });

  btnClearDiff.addEventListener('click', () => {
    const allIds = viewer.scene.objectIds;
    viewer.scene.setObjectsXRayed(allIds, false);
    allIds.forEach(id => {
      const obj = viewer.scene.objects[id];
      if (obj) obj.colorize = null;
    });
    updateStatus("Visual diff highlights cleared.");
  });

  // 3. BCF Reader Tool
  const btnRunBcfReader = document.getElementById('btnRunBcfReader');
  const bcfFileInput = document.getElementById('bcfFileInput');
  const bcfResults = document.getElementById('bcfResults');
  const bcfTopicsList = document.getElementById('bcfTopicsList');

  btnRunBcfReader.addEventListener('click', async () => {
    const file = bcfFileInput.files[0];
    if (!file) {
      alert("Please select a .bcf file.");
      return;
    }

    showLoader("Reading BCF", "Uploading BCF archive and parsing issues...", 20);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/python/bcf-reader', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'BCF read failed on backend');
      }

      const result = await response.json();
      bcfTopicsList.innerHTML = "";

      if (!result.topics || result.topics.length === 0) {
        bcfTopicsList.innerHTML = `<div style="font-size:11px; color:var(--text-muted); text-align:center;">No topics found in this BCF file.</div>`;
      } else {
        result.topics.forEach(topic => {
          const card = document.createElement('div');
          card.className = "bcf-topic-card";
          
          let snapshotHtml = "";
          if (topic.snapshot) {
            snapshotHtml = `
              <div class="bcf-topic-img-container" style="margin-top: 8px;">
                <img src="/uploads/bcf_snapshots/${topic.snapshot}" class="bcf-topic-img" alt="Snapshot">
              </div>
            `;
          }

          let commentsHtml = "";
          if (topic.comments && topic.comments.length > 0) {
            commentsHtml = `
              <div class="bcf-comments-list" style="margin-top: 8px;">
                <div style="font-size:9px; font-weight:bold; color:var(--text-muted); margin-bottom:4px;">Comments:</div>
                ${topic.comments.map(c => `
                  <div class="bcf-comment-item">
                    <div class="bcf-comment-author">${c.author}</div>
                    <div class="bcf-comment-text">${c.text}</div>
                    <div class="bcf-comment-date">${c.date ? new Date(c.date).toLocaleString() : ''}</div>
                  </div>
                `).join('')}
              </div>
            `;
          }

          card.innerHTML = `
            <div class="bcf-topic-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
              <span class="bcf-topic-title" style="font-weight:600; font-size:12px;">${topic.title}</span>
              <span class="bcf-topic-status open" style="font-size:9px; padding:2px 6px; border-radius:4px; text-transform:uppercase;">${topic.status}</span>
            </div>
            ${topic.description ? `<p class="bcf-topic-desc" style="font-size:11px; color:var(--text-muted); margin-top:4px;">${topic.description}</p>` : ''}
            ${snapshotHtml}
            ${commentsHtml}
          `;

          card.addEventListener('click', () => {
            document.querySelectorAll('.bcf-topic-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            const vp = topic.viewpoint;
            if (vp && vp.eye && vp.dir && vp.up) {
              const eye = vp.eye;
              const dir = vp.dir;
              const up = vp.up;
              
              viewer.cameraFlight.flyTo({
                eye: [eye.x, eye.y, eye.z],
                look: [eye.x + dir.x * 10, eye.y + dir.y * 10, eye.z + dir.z * 10],
                up: [up.x, up.y, up.z],
                duration: 1.5
              });
            }

            if (vp && vp.components && vp.components.length > 0) {
              const allIds = viewer.scene.objectIds;
              viewer.scene.setObjectsXRayed(allIds, true);
              viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
              viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);

              vp.components.forEach(guid => {
                const obj = viewer.scene.objects[guid];
                if (obj) {
                  obj.xrayed = false;
                  obj.selected = true;
                  obj.highlighted = true;
                }
              });
              updateStatus(`Showing issue viewpoint. Highlighted ${vp.components.length} components.`);
            } else {
              updateStatus(`Showing viewpoint for issue: "${topic.title}"`);
            }
          });

          bcfTopicsList.appendChild(card);
        });
      }

      bcfResults.style.display = 'block';
      hideLoader();
      updateStatus(`Successfully read BCF with ${result.topics ? result.topics.length : 0} topics.`);
    } catch (err) {
      hideLoader();
      updateStatus(`BCF Read failed: ${err.message}`, true);
      alert(`Error reading BCF: ${err.message}`);
    }
  });

  // 4. IFC Clash Tool
  const btnRunClash = document.getElementById('btnRunClash');
  const clashModelASelect = document.getElementById('clashModelASelect');
  const clashModelBSelect = document.getElementById('clashModelBSelect');
  const clashToleranceInput = document.getElementById('clashToleranceInput');
  const clashResults = document.getElementById('clashResults');
  const clashCountTitle = document.getElementById('clashCountTitle');
  const btnDownloadClashBcf = document.getElementById('btnDownloadClashBcf');
  const btnClearClashes = document.getElementById('btnClearClashes');
  const clashList = document.getElementById('clashList');

  let latestClashes = [];

  btnRunClash.addEventListener('click', async () => {
    const modelA = loadedModels.find(m => m.id === clashModelASelect.value);
    const modelB = loadedModels.find(m => m.id === clashModelBSelect.value);
    const tolerance = clashToleranceInput.value || 0.0;

    if (!modelA) {
      alert("Please select Model A IFC model.");
      return;
    }

    const fileA = modelA.file;
    const fileB = modelB ? modelB.file : null;

    showLoader("IFC Clash Detection", "Detecting geometric collisions. This may take some time...", 15);
    const formData = new FormData();
    formData.append('fileA', fileA);
    if (fileB) {
      formData.append('fileB', fileB);
    }
    formData.append('tolerance', tolerance);

    try {
      const response = await fetch('/api/python/ifcclash', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Clash detection failed');
      }

      const result = await response.json();
      latestClashes = result.clashes || [];

      clashCountTitle.innerText = `${latestClashes.length} Clashes Found`;
      clashList.innerHTML = "";

      if (latestClashes.length === 0) {
        clashList.innerHTML = `<li style="color:var(--text-muted); text-align:center;">No clashes detected.</li>`;
        btnDownloadClashBcf.removeAttribute('href');
        btnDownloadClashBcf.style.pointerEvents = 'none';
        btnDownloadClashBcf.style.opacity = '0.5';
      } else {
        btnDownloadClashBcf.style.pointerEvents = 'auto';
        btnDownloadClashBcf.style.opacity = '1';
        btnDownloadClashBcf.href = result.downloadUrl;

        latestClashes.forEach((c, idx) => {
          const li = document.createElement('li');
          li.className = "clash-list-item";
          li.innerHTML = `
            <div>
              <span style="font-weight:bold; color:var(--danger);">Clash #${idx+1}</span><br>
              A: <span class="el-id">${c.a_guid}</span> (${c.a_class})<br>
              B: <span class="el-id">${c.b_guid}</span> (${c.b_class})
            </div>
          `;

          li.addEventListener('click', () => {
            const allIds = viewer.scene.objectIds;
            allIds.forEach(id => {
              const obj = viewer.scene.objects[id];
              if (obj) obj.colorize = null;
            });
            viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
            viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);

            const ids = [c.a_guid, c.b_guid];
            viewer.scene.setObjectsXRayed(allIds, true);
            ids.forEach(guid => {
              const obj = viewer.scene.objects[guid];
              if (obj) {
                obj.xrayed = false;
                obj.selected = true;
                obj.highlighted = true;
                obj.colorize = [1.0, 0.0, 0.0];
              }
            });

            if (c.point && c.point.length === 3 && (c.point[0] !== 0 || c.point[1] !== 0 || c.point[2] !== 0)) {
              viewer.cameraFlight.flyTo({
                look: c.point,
                fit: true,
                duration: 1.5
              });
            } else {
              const firstObj = viewer.scene.objects[c.a_guid];
              if (firstObj) {
                viewer.cameraFlight.flyTo(firstObj);
              }
            }
            updateStatus(`Viewing clash: ${c.a_class} vs ${c.b_class}`);
          });

          clashList.appendChild(li);
        });
      }

      clashResults.style.display = 'block';
      hideLoader();
      updateStatus(`Clash detection completed: ${latestClashes.length} issues found.`);
    } catch (err) {
      hideLoader();
      updateStatus(`Clash failed: ${err.message}`, true);
      alert(`Error running clash detection: ${err.message}`);
    }
  });

  btnClearClashes.addEventListener('click', () => {
    const allIds = viewer.scene.objectIds;
    viewer.scene.setObjectsXRayed(allIds, false);
    allIds.forEach(id => {
      const obj = viewer.scene.objects[id];
      if (obj) obj.colorize = null;
    });
    viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
    viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
    updateStatus("Clash display reset.");
  });

  // 5. IFC Convert Tool
  const btnRunConvert = document.getElementById('btnRunConvert');
  const convertModelSelect = document.getElementById('convertModelSelect');
  const convertFormatSelect = document.getElementById('convertFormatSelect');

  btnRunConvert.addEventListener('click', async () => {
    const model = loadedModels.find(m => m.id === convertModelSelect.value);
    const format = convertFormatSelect.value;

    if (!model) {
      alert("Please select an IFC model for conversion.");
      return;
    }

    const file = model.file;

    showLoader("Converting IFC", `Converting IFC model to .${format} format on backend...`, 30);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);

    try {
      const response = await fetch('/api/python/ifcconvert', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Conversion failed on the backend.');
      }

      updateLoaderProgress(80, "Downloading converted file...");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const origBase = file.name.substring(0, file.name.lastIndexOf('.'));
      a.download = `${origBase}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      hideLoader();
      updateStatus(`Model converted to .${format} and downloaded successfully.`);
    } catch (err) {
      hideLoader();
      updateStatus(`Conversion failed: ${err.message}`, true);
      alert(`Error converting model: ${err.message}`);
    }
  });

  // 6. IFC CSV Export Tool
  setupIfcCsvTool();

  // 7. RVT to IFC Converter Tool
  setupRvtConverter();
}

// --- RVT to IFC Converter Tool ---
function setupRvtConverter() {
  const btnConvertRvt = document.getElementById('btnConvertRvt');
  const rvtFileInput = document.getElementById('rvtFileInput');
  const xdesApiUrlInput = document.getElementById('xdesApiUrl');
  const xdesClientIdInput = document.getElementById('xdesClientId');
  const xdesClientSecretInput = document.getElementById('xdesClientSecret');

  if (!btnConvertRvt) return;

  // Restore saved settings from localStorage
  if (localStorage.getItem('xdes_api_url')) {
    xdesApiUrlInput.value = localStorage.getItem('xdes_api_url');
  }
  if (localStorage.getItem('xdes_client_id')) {
    xdesClientIdInput.value = localStorage.getItem('xdes_client_id');
  }
  if (localStorage.getItem('xdes_client_secret')) {
    xdesClientSecretInput.value = localStorage.getItem('xdes_client_secret');
  }

  btnConvertRvt.addEventListener('click', async () => {
    const file = rvtFileInput.files[0];
    if (!file) {
      alert("Please select a Revit (.rvt) file to convert.");
      return;
    }

    const apiUrl = xdesApiUrlInput.value.trim();
    const clientId = xdesClientIdInput.value.trim();
    const clientSecret = xdesClientSecretInput.value.trim();

    if (!clientId || !clientSecret) {
      alert("Please enter both your Client ID and Client Secret.");
      return;
    }

    // Save configuration settings
    localStorage.setItem('xdes_api_url', apiUrl);
    localStorage.setItem('xdes_client_id', clientId);
    localStorage.setItem('xdes_client_secret', clientSecret);

    showLoader("Converting RVT to XKT", "Uploading file & initiating Data Engine job...", 10);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('apiUrl', apiUrl);
    formData.append('clientId', clientId);
    formData.append('clientSecret', clientSecret);

    try {
      const response = await fetch('/api/convert-rvt', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        const msg = errData.details ? `${errData.error}: ${errData.details}` : (errData.error || 'Conversion failed');
        throw new Error(msg);
      }

      updateLoaderProgress(80, "Downloading converted model data...");
      const data = await response.json();

      updateLoaderProgress(90, "Decoding XKT model...");
      // Decode base64 XKT to ArrayBuffer
      const binaryStr = atob(data.xkt);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const xktArrayBuffer = bytes.buffer;

      const modelId = "model-" + Date.now();

      // Store Revit metadata if available
      if (data.metadata) {
        console.log(`[RVT] Metadata keys: ${Object.keys(data.metadata).join(', ')}`);
        
        if (data.metadata.Elements) {
          // xeoRvt native format — store for custom tree & properties
          revitMetadataMap[modelId] = data.metadata;
          console.log(`[RVT] Stored xeoRvt metadata for model ${modelId}: ${data.metadata.Elements.length} elements`);
        } else if (data.metadata.metaObjects) {
          // xeokit-convert MetaModel format — store for custom tree adaptation
          revitMetadataMap[modelId] = data.metadata;
          console.log(`[RVT] Stored xeokit MetaModel metadata for model ${modelId}: ${data.metadata.metaObjects.length} metaObjects`);
        }
      }

      // Cache for download
      convertedXktBuffer = xktArrayBuffer;
      convertedXktName = data.filename || file.name.replace(/\.rvt$/i, '.xkt');
      btnDownloadXkt.disabled = false;

      updateLoaderProgress(95, "Loading converted XKT model into viewer...");
      
      // Build loader options
      const loadOptions = {
        id: modelId,
        xkt: xktArrayBuffer,
        edges: true,
        dtxEnabled: true
      };
      
      // If we have xeokit MetaModel metadata, load it alongside the XKT
      if (data.metadata && data.metadata.metaObjects) {
        // Create a Blob URL for the metadata JSON so we can pass it as metaModelSrc
        const metaBlob = new Blob([JSON.stringify(data.metadata)], { type: 'application/json' });
        const metaUrl = URL.createObjectURL(metaBlob);
        loadOptions.metaModelSrc = metaUrl;
        console.log(`[RVT] Loading XKT with MetaModel metadata`);
      }

      activeModel = xktLoader.load(loadOptions);

      const xktFilename = data.filename || file.name.replace(/\.rvt$/i, '.xkt');
      setupModelLoadedListener(modelId, { name: xktFilename });
      hideLoader();
      updateStatus(`Revit model converted and loaded successfully.`);
    } catch (err) {
      hideLoader();
      updateStatus(`RVT Conversion failed: ${err.message}`, true);
      alert(`Error converting Revit model:\n${err.message}`);
    }
  });
}

// --- IFC CSV Export Tool ---
function setupIfcCsvTool() {
  const csvModelSelect = document.getElementById('csvModelSelect');
  const csvIfcClassFilter = document.getElementById('csvIfcClassFilter');
  const csvParamRows = document.getElementById('csvParamRows');
  const csvParamSelect0 = document.getElementById('csvParamSelect0');
  const csvBtnAdd0 = document.getElementById('csvBtnAdd0');
  const csvSelectedCols = document.getElementById('csvSelectedCols');
  const csvColChips = document.getElementById('csvColChips');
  const csvPreviewCount = document.getElementById('csvPreviewCount');
  const btnExportIfcCsv = document.getElementById('btnExportIfcCsv');
  const csvColName = document.getElementById('csvColName');
  const csvColType = document.getElementById('csvColType');
  const csvColId = document.getElementById('csvColId');

  // Track selected property columns in order
  let selectedColumns = []; // array of property name strings
  let allPropertyNames = []; // master list of all property names from model
  let dynamicRowCount = 0; // counter for unique IDs of added rows

  // Helper: get all property names from the selected model (or all models)
  function gatherPropertyNames(modelId) {
    const names = new Set();
    if (!viewer || !viewer.metaScene) return [];
    const metaObjects = viewer.metaScene.metaObjects;
    for (const metaObj of Object.values(metaObjects)) {
      // Filter by model if specified
      if (modelId && metaObj.metaModel && metaObj.metaModel.id !== modelId) continue;
      if (metaObj.propertySets) {
        for (const pset of metaObj.propertySets) {
          if (pset.properties) {
            for (const prop of pset.properties) {
              if (prop.name && prop.name.trim()) {
                names.add(prop.name.trim());
              }
            }
          }
        }
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  // Helper: get all IFC classes from the selected model
  function gatherIfcClasses(modelId) {
    const classes = new Set();
    if (!viewer || !viewer.metaScene) return [];
    const metaObjects = viewer.metaScene.metaObjects;
    for (const metaObj of Object.values(metaObjects)) {
      if (modelId && metaObj.metaModel && metaObj.metaModel.id !== modelId) continue;
      if (metaObj.type && metaObj.type.trim()) {
        classes.add(metaObj.type.trim());
      }
    }
    return Array.from(classes).sort((a, b) => a.localeCompare(b));
  }

  // Populate a <select> dropdown with property names
  function populateParamSelect(selectEl) {
    const currentVal = selectEl.value;
    selectEl.innerHTML = '<option value="">-- Select Property --</option>';
    allPropertyNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
    // Restore previous selection if still valid
    if (currentVal && allPropertyNames.includes(currentVal)) {
      selectEl.value = currentVal;
    }
  }

  // Refresh all selects when model changes
  function refreshCsvUi() {
    const modelId = csvModelSelect.value || null;
    allPropertyNames = gatherPropertyNames(modelId);

    // Populate first select
    populateParamSelect(csvParamSelect0);

    // Populate all dynamic selects
    csvParamRows.querySelectorAll('.csv-param-select').forEach(sel => {
      populateParamSelect(sel);
    });

    // Populate IFC class filter
    const classes = gatherIfcClasses(modelId);
    csvIfcClassFilter.innerHTML = '<option value="">-- All Classes --</option>';
    classes.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      csvIfcClassFilter.appendChild(opt);
    });

    // Recount preview
    updatePreviewCount();
  }

  // Update the column chips display
  function renderChips() {
    csvColChips.innerHTML = '';
    selectedColumns.forEach((colName, idx) => {
      const chip = document.createElement('span');
      chip.className = 'csv-col-chip';

      const order = document.createElement('span');
      order.className = 'csv-col-chip-order';
      order.textContent = idx + 1;

      const label = document.createTextNode(colName);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'csv-col-chip-remove';
      removeBtn.title = 'Remove column';
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      removeBtn.addEventListener('click', () => {
        selectedColumns.splice(idx, 1);
        renderChips();
        updatePreviewCount();
      });

      chip.appendChild(order);
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      csvColChips.appendChild(chip);
    });

    if (selectedColumns.length > 0) {
      csvSelectedCols.style.display = 'block';
    } else {
      csvSelectedCols.style.display = 'none';
    }
  }

  // Count how many rows would be exported
  function updatePreviewCount() {
    if (!viewer || !viewer.metaScene) {
      csvPreviewCount.style.display = 'none';
      return;
    }
    const modelId = csvModelSelect.value || null;
    const classFilter = csvIfcClassFilter.value || null;
    let count = 0;
    const metaObjects = viewer.metaScene.metaObjects;
    for (const metaObj of Object.values(metaObjects)) {
      if (modelId && metaObj.metaModel && metaObj.metaModel.id !== modelId) continue;
      if (classFilter && metaObj.type !== classFilter) continue;
      // Skip non-leaf types like IfcProject, IfcSite, IfcBuilding
      if (!metaObj.type || ['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey'].includes(metaObj.type)) continue;
      count++;
    }
    csvPreviewCount.textContent = `${count} object${count !== 1 ? 's' : ''} will be exported`;
    csvPreviewCount.style.display = 'block';
  }

  // Add a new dynamic dropdown row after clicking "+"
  function addParamRow(selectedPropName) {
    if (!selectedPropName) return;

    // Prevent duplicates
    if (selectedColumns.includes(selectedPropName)) {
      // Flash the existing chip briefly
      const chips = csvColChips.querySelectorAll('.csv-col-chip');
      chips.forEach(chip => {
        const idx = selectedColumns.indexOf(selectedPropName);
        if (parseInt(chip.querySelector('.csv-col-chip-order').textContent) === idx + 1) {
          chip.style.border = '1px solid var(--accent)';
          setTimeout(() => { chip.style.border = ''; }, 800);
        }
      });
      return;
    }

    // Add to selected columns
    selectedColumns.push(selectedPropName);
    renderChips();
    updatePreviewCount();

    // Create a new dropdown row
    dynamicRowCount++;
    const rowId = `csvDynRow${dynamicRowCount}`;
    const selectId = `csvParamSelect${dynamicRowCount}`;

    const row = document.createElement('div');
    row.className = 'csv-param-row';
    row.id = rowId;

    const newSelect = document.createElement('select');
    newSelect.id = selectId;
    newSelect.className = 'form-input csv-param-select';
    populateParamSelect(newSelect);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn-csv-add';
    addBtn.title = 'Add this column';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    addBtn.addEventListener('click', () => {
      addParamRow(newSelect.value);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-csv-remove';
    removeBtn.title = 'Remove this row';
    removeBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
    removeBtn.addEventListener('click', () => {
      row.remove();
    });

    row.appendChild(newSelect);
    row.appendChild(addBtn);
    row.appendChild(removeBtn);
    csvParamRows.appendChild(row);
  }

  // Wire up the first (static) "+" button
  csvBtnAdd0.addEventListener('click', () => {
    addParamRow(csvParamSelect0.value);
  });

  // Refresh on model select change
  csvModelSelect.addEventListener('change', refreshCsvUi);
  csvIfcClassFilter.addEventListener('change', updatePreviewCount);

  // Listen for model load events to refresh CSV property/class dropdowns
  window.addEventListener('ifcModelsUpdated', () => {
    refreshCsvUi();
  });

  // CSV Generation and Download
  btnExportIfcCsv.addEventListener('click', () => {
    if (!viewer || !viewer.metaScene) {
      alert('No model loaded. Please load an IFC model first.');
      return;
    }

    const modelId = csvModelSelect.value || null;
    const classFilter = csvIfcClassFilter.value || null;

    // Determine what columns to include
    const includeBuiltinName = csvColName.checked;
    const includeBuiltinType = csvColType.checked;
    const includeBuiltinId = csvColId.checked;

    if (!includeBuiltinName && !includeBuiltinType && !includeBuiltinId && selectedColumns.length === 0) {
      alert('Please select at least one column to export.');
      return;
    }

    // Build CSV headers
    const headers = [];
    if (includeBuiltinName) headers.push('Name');
    if (includeBuiltinType) headers.push('IFC Class');
    if (includeBuiltinId) headers.push('GlobalId');
    selectedColumns.forEach(col => headers.push(col));

    // Build CSV rows
    const rows = [];
    const metaObjects = viewer.metaScene.metaObjects;

    for (const metaObj of Object.values(metaObjects)) {
      // Filter by model
      if (modelId && metaObj.metaModel && metaObj.metaModel.id !== modelId) continue;
      // Filter by class
      if (classFilter && metaObj.type !== classFilter) continue;
      // Skip project/site/building containers
      if (!metaObj.type || ['IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey'].includes(metaObj.type)) continue;

      // Build a flat map of all properties for this object
      const propMap = {};
      if (metaObj.propertySets) {
        for (const pset of metaObj.propertySets) {
          if (pset.properties) {
            for (const prop of pset.properties) {
              if (prop.name) {
                propMap[prop.name.trim()] = prop.value !== undefined && prop.value !== null ? String(prop.value) : '';
              }
            }
          }
        }
      }

      const row = [];
      if (includeBuiltinName) row.push(metaObj.name || '');
      if (includeBuiltinType) row.push(metaObj.type || '');
      if (includeBuiltinId) row.push(metaObj.id || '');
      selectedColumns.forEach(colName => {
        row.push(propMap[colName] !== undefined ? propMap[colName] : '');
      });

      rows.push(row);
    }

    if (rows.length === 0) {
      alert('No objects found matching the current filter criteria.');
      return;
    }

    // Escape CSV cell values
    const escapeCell = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCell).join(','),
      ...rows.map(row => row.map(escapeCell).join(','))
    ].join('\r\n');

    // Trigger download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const modelInfo = loadedModels.find(m => m.id === modelId);
    const baseName = modelInfo ? modelInfo.fileName.replace(/\.[^.]+$/, '') : 'ifc_export';
    const classLabel = classFilter ? `_${classFilter}` : '';
    a.download = `${baseName}${classLabel}_export.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    updateStatus(`CSV exported: ${rows.length} objects, ${headers.length} columns.`);
  });
} // end setupIfcCsvTool

if (document.readyState === "complete" || document.readyState === "interactive") {
  startApp();
} else {
  document.addEventListener('DOMContentLoaded', startApp);
}
