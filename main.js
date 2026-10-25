import { 
  Viewer, 
  XKTLoaderPlugin, 
  WebIFCLoaderPlugin, 
  IFCOpenShellLoaderPlugin, 
  LASLoaderPlugin,
  GLTFLoaderPlugin,
  OBJLoaderPlugin,
  Node,
  NavCubePlugin, 
  SectionPlanesPlugin, 
  DistanceMeasurementsPlugin,
  DistanceMeasurementsMouseControl,
  AngleMeasurementsPlugin,
  AngleMeasurementsMouseControl,
  PointerLens,
  math,
  AmbientLight,
  DirLight,
  Mesh,
  VBOGeometry,
  PhongMaterial,
  buildSphereGeometry
} from "./lib/xeokit/xeokit-sdk.min.es.js";

import * as WebIFC from "https://cdn.jsdelivr.net/npm/web-ifc@0.0.51/web-ifc-api.js";
import { setupAiAgent } from "./ai-agent.js";

// --- Global UI State ---
let viewer;
let xktLoader;
let lasLoader = null;
let gltfLoader = null;
let objLoader = null;
let pendingGeoreference = null;
let pendingMtlFile = null;
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
const btnLoadCompanionMtl = document.getElementById('btnLoadCompanionMtl');
const companionMtlInput = document.getElementById('companionMtlInput');
let lastLoadedObjData = null;
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

// --- Sun Position state ---
let activeSunLight = null;
let activeSkyLight = null;
let activeAmbientLight = null;
let savedDefaultLights = null;
let sunHelperSphere = null;
let sunHelperLine = null;
let savedContainerBackground = "";

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

// Sun Position UI elements
const chkEnableSunPosition = document.getElementById('chkEnableSunPosition');
const sunParamsContainer = document.getElementById('sunParamsContainer');
const sunDateTime = document.getElementById('sunDateTime');
const sunSkyColor = document.getElementById('sunSkyColor');
const sunGroundColor = document.getElementById('sunGroundColor');

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
  objLoader = new OBJLoaderPlugin(viewer);
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
  
  const IfcAPI = new WebIFC.IfcAPI();
  IfcAPI.SetWasmPath("https://cdn.jsdelivr.net/npm/web-ifc@0.0.51/");
  await IfcAPI.Init();
  
  webIfcLoader = new WebIFCLoaderPlugin(viewer, {
    WebIFC,
    IfcAPI
  });
  
  webIfcInitialized = true;
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
  } else if (fileExt === 'obj') {
    showLoader("Loading OBJ Model", "Reading OBJ file into memory...", 15);
    let mtlToUse = pendingMtlFile;
    if (!mtlToUse && fileInput && fileInput.files) {
      mtlToUse = Array.from(fileInput.files).find(f => f.name.toLowerCase().endsWith('.mtl')) || null;
    }
    pendingMtlFile = null;

    try {
      const objReader = new FileReader();
      objReader.onload = async (e) => {
        const objText = e.target.result;
        updateLoaderProgress(40, "Checking companion materials...");

        let mtlText = null;

        // 1. From companion MTL file object if selected or dropped together
        if (mtlToUse) {
          try {
            mtlText = await mtlToUse.text();
            updateStatus(`Loaded companion materials from ${mtlToUse.name}`);
          } catch (err) {
            console.warn("Could not read companion mtl file:", err);
          }
        }

        // 2. Auto-load from local disk in Electron / desktop (via preload webUtils.getPathForFile)
        const realFilePath = (window.electronAPI && typeof window.electronAPI.getPathForFile === 'function')
          ? window.electronAPI.getPathForFile(file)
          : (file.path || null);

        if (!mtlText && realFilePath) {
          const dir = realFilePath.replace(/[/\\][^/\\]+$/, '');
          const mtllibMatch = objText.match(/^mtllib\s+([^\r\n]+)/m);
          const candidateMtls = [];
          if (mtllibMatch) candidateMtls.push(`${dir}/${mtllibMatch[1].trim()}`);
          candidateMtls.push(realFilePath.replace(/\.[^.]+$/, '.mtl'));

          for (const mtlPath of candidateMtls) {
            try {
              const res = await fetch(`/api/local-file?path=${encodeURIComponent(mtlPath)}`);
              if (res.ok) {
                mtlText = await res.text();
                updateStatus(`Auto-loaded companion materials from ${mtlPath.split(/[/\\]/).pop()}`);
                break;
              }
            } catch (err) {
              // Non-blocking
            }
          }
        }

        // 3. Fallback Shading: if no MTL loaded, generate shaded Phong materials for all usemtl
        const mtllibMatch = objText.match(/^mtllib\s+([^\r\n]+)/m);
        const refMtlName = mtllibMatch ? mtllibMatch[1].trim() : null;

        let effectiveMtlText = mtlText;
        if (!effectiveMtlText) {
          const useMtls = Array.from(new Set(Array.from(objText.matchAll(/^usemtl\s+([^\r\n]+)/gm)).map(m => m[1].trim())));
          if (useMtls.length > 0) {
            effectiveMtlText = useMtls.map((m, idx) => {
              const base = 0.55 + ((idx % 7) * 0.05);
              return `newmtl ${m}\nKa 0.25 0.25 0.25\nKd ${base.toFixed(2)} ${base.toFixed(2)} ${base.toFixed(2)}\nKs 0.15 0.15 0.15\nNs 25.0\nd 1.0\n`;
            }).join('\n');
          }
        }

        // Cache for dynamic .mtl application
        lastLoadedObjData = { file, objText, modelId, hasMtl: !!mtlText };

        // Update UI companion MTL button
        if (btnLoadCompanionMtl) {
          if (!mtlText && refMtlName) {
            btnLoadCompanionMtl.style.display = "inline-flex";
            btnLoadCompanionMtl.title = `Companion material "${refMtlName}" missing. Click to select .mtl file`;
            updateStatus(`Note: "${refMtlName}" not found. (Click ".MTL" button in ribbon or drop .mtl to apply materials)`);
          } else {
            btnLoadCompanionMtl.style.display = "none";
          }
        }

        updateLoaderProgress(70, "Rendering 3D model...");

        // 4. Fast, native xeokit OBJ loader (< 500ms, direct scene graph parse)
        try {
          activeModel = new Node(viewer.scene, {
            id: modelId,
            isModel: true
          });
          activeModel.once("destroyed", () => {
            if (viewer.metaScene) {
              viewer.metaScene.destroyMetaModel(modelId);
            }
          });
          setupModelLoadedListener(modelId, file);
          objLoader._sceneGraphLoader.parse(activeModel, objText, effectiveMtlText || null, "");
        } catch (parseErr) {
          hideLoader();
          updateStatus(`Failed to parse OBJ model: ${parseErr.message}`, true);
        }
      };
      objReader.onerror = (err) => {
        hideLoader();
        updateStatus(`Failed to read OBJ file: ${err.message}`, true);
      };
      objReader.readAsText(file);
    } catch (err) {
      hideLoader();
      updateStatus(`Failed to load OBJ model: ${err.message}`, true);
    }
  } else if (fileExt === 'dae') {
    showLoader("Loading Collada DAE", "Reading DAE file into memory...", 10);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          updateLoaderProgress(30, "Parsing Collada DAE structure...");
          const daeText = e.target.result;

          const [{ ColladaLoader }, { GLTFExporter }] = await Promise.all([
            import('https://esm.sh/three@0.160.0/examples/jsm/loaders/ColladaLoader.js'),
            import('https://esm.sh/three@0.160.0/examples/jsm/exporters/GLTFExporter.js')
          ]);

          const loader = new ColladaLoader();
          const collada = loader.parse(daeText, "");

          updateLoaderProgress(60, "Converting Collada to glTF representation...");
          const exporter = new GLTFExporter();
          exporter.parse(
            collada.scene,
            (glbBuffer) => {
              updateLoaderProgress(85, "Rendering 3D model...");
              try {
                const blob = new Blob([glbBuffer], { type: "model/gltf-binary" });
                const blobUrl = URL.createObjectURL(blob);
                activeModel = gltfLoader.load({
                  id: modelId,
                  src: blobUrl + "#" + file.name.replace(/\.dae$/i, ".glb")
                });
                setupModelLoadedListener(modelId, file);
              } catch (loadErr) {
                hideLoader();
                updateStatus(`Failed to display converted DAE model: ${loadErr.message}`, true);
              }
            },
            (error) => {
              hideLoader();
              updateStatus(`Failed to export Collada to glTF: ${error.message || error}`, true);
            },
            { binary: true }
          );
        } catch (parseErr) {
          hideLoader();
          updateStatus(`Failed to parse DAE file: ${parseErr.message}`, true);
        }
      };
      reader.onerror = (err) => {
        hideLoader();
        updateStatus(`Failed to read DAE file: ${err.message}`, true);
      };
      reader.readAsText(file);
    } catch (err) {
      hideLoader();
      updateStatus(`Failed to load DAE model: ${err.message}`, true);
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

function getEntityDimensions(entity) {
  if (!entity) return { dx: 0, dy: 0, dz: 0, volume: 0, area: 0, label: "3D Mesh" };

  const dist = (a, b) => Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);

  // 1. Try finding explicit OBB on entity, meshes, or geometry
  let rawObb = entity.obb;
  if (!rawObb && entity.meshes && entity.meshes.length > 0) {
    for (const m of entity.meshes) {
      if (m.obb && m.obb.length >= 24) { rawObb = m.obb; break; }
      if (m._geometry && m._geometry.obb && m._geometry.obb.length >= 24) { rawObb = m._geometry.obb; break; }
      if (m.geometry && m.geometry.obb && m.geometry.obb.length >= 24) { rawObb = m.geometry.obb; break; }
    }
  }
  if (!rawObb && entity.mesh) {
    if (entity.mesh.obb && entity.mesh.obb.length >= 24) rawObb = entity.mesh.obb;
    else if (entity.mesh._geometry && entity.mesh._geometry.obb) rawObb = entity.mesh._geometry.obb;
    else if (entity.mesh.geometry && entity.mesh.geometry.obb) rawObb = entity.mesh.geometry.obb;
  }

  if (rawObb && rawObb.length >= 24) {
    const stride = rawObb.length >= 32 ? 4 : 3;
    const p0 = [rawObb[0], rawObb[1], rawObb[2]];
    const p1 = [rawObb[stride], rawObb[stride+1], rawObb[stride+2]];
    const p3 = [rawObb[stride*3], rawObb[stride*3+1], rawObb[stride*3+2]];
    const p4 = [rawObb[stride*4], rawObb[stride*4+1], rawObb[stride*4+2]];

    let d1 = dist(p0, p1);
    let d2 = dist(p0, p3);
    let d3 = dist(p0, p4);

    if (d1 > 0.001 && d2 > 0.001 && d3 > 0.001) {
      const volume = d1 * d2 * d3;
      const area = 2 * (d1 * d2 + d2 * d3 + d3 * d1);
      return { dx: d1, dy: d2, dz: d3, volume, area, label: "Oriented Box" };
    }
  }

  // 2. Check metadata properties if available on viewer.metaScene
  if (entity.id && viewer && viewer.metaScene) {
    const metaObj = viewer.metaScene.metaObjects[entity.id];
    if (metaObj && metaObj.propertySets) {
      let metaVol = null;
      let metaW = null, metaL = null, metaH = null;

      metaObj.propertySets.forEach(pset => {
        if (!pset.properties) return;
        pset.properties.forEach(p => {
          if (!p.name || p.value === undefined || p.value === null) return;
          const nameLower = String(p.name).toLowerCase();
          const valNum = parseFloat(p.value);
          if (isNaN(valNum) || valNum <= 0) return;

          if (nameLower === "volume" || nameLower.includes("netvolume") || nameLower.includes("grossvolume")) {
            metaVol = valNum;
          } else if (nameLower.includes("width") || nameLower.includes("overallwidth")) {
            metaW = valNum;
          } else if (nameLower.includes("length") || nameLower.includes("overalllength")) {
            metaL = valNum;
          } else if (nameLower.includes("height") || nameLower.includes("thickness") || nameLower.includes("depth")) {
            metaH = valNum;
          }
        });
      });

      if (metaVol && metaVol > 0) {
        const dx = metaW || Math.sqrt(metaVol / (metaH || 1.30));
        const dz = metaL || dx;
        const dy = metaH || (metaVol / (dx * dz));
        const area = 2 * (dx * dy + dy * dz + dz * dx);
        return { dx, dy, dz, volume: metaVol, area, label: "Oriented Box (IFC Metadata)" };
      }
    }
  }

  // 3. Fallback to entity.aabb with rotation correction check
  if (entity.aabb) {
    const aabb = entity.aabb;
    const gdx = Math.abs(aabb[3] - aabb[0]);
    const gdy = Math.abs(aabb[4] - aabb[1]);
    const gdz = Math.abs(aabb[5] - aabb[2]);

    let dx = gdx;
    let dy = gdy;
    let dz = gdz;
    let isRotated = false;

    // Check if XZ plane footprint is rotated (~35deg rotation factor is ~1.234)
    if (Math.abs(gdx - gdz) < 0.20 && gdx > 1.3 * dy) {
      const estL = gdx / 1.234;
      if (estL > 0.1) {
        dx = estL;
        dz = estL;
        isRotated = true;
      }
    }

    const volume = dx * dy * dz;
    const area = 2 * (dx * dy + dy * dz + dz * dx);
    return { dx, dy, dz, volume, area, label: isRotated ? "Oriented Box" : "Bounding Box" };
  }

  return { dx: 0, dy: 0, dz: 0, volume: 0, area: 0, label: "Unknown" };
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

      // Also append AABB dimensions if missing geometric values
      const entity = viewer.scene.objects[id];
      if (entity && entity.aabb) {
        const aabb = entity.aabb;
        const dx = Math.abs(aabb[3] - aabb[0]);
        const dy = Math.abs(aabb[4] - aabb[1]);
        const dz = Math.abs(aabb[5] - aabb[2]);
        const estimatedVolume = dx * dy * dz;
        const estimatedArea = Math.max(dx * dy, dy * dz, dz * dx);
        const estimatedLength = Math.max(dx, dy, dz);
        
        if (!props.some(p => p.name.toLowerCase().includes("volume"))) {
          props.push({ name: "Volume (Estimated)", value: estimatedVolume });
        }
        if (!props.some(p => p.name.toLowerCase().includes("area"))) {
          props.push({ name: "Area (Estimated)", value: estimatedArea });
        }
        if (!props.some(p => p.name.toLowerCase().includes("length"))) {
          props.push({ name: "Length (Estimated)", value: estimatedLength });
        }
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

      // Also append dimensions if missing geometric values
      const entity = viewer.scene.objects[id];
      const dims = getEntityDimensions(entity);
      if (dims.volume > 0) {
        if (!props.some(p => p.name.toLowerCase().includes("volume"))) {
          props.push({ name: "Volume (Estimated)", value: dims.volume });
        }
        if (!props.some(p => p.name.toLowerCase().includes("surface area") || p.name.toLowerCase().includes("area"))) {
          props.push({ name: "Surface Area (Estimated)", value: dims.area });
        }
        if (!props.some(p => p.name.toLowerCase().includes("length"))) {
          props.push({ name: "Length (Estimated)", value: Math.max(dims.dx, dims.dy, dims.dz) });
        }
      }

      return {
        name: metaObj.name || "Unnamed Object",
        type: ifcClass,
        category: category,
        props: props
      };
    }
  }

  // Fallback using standard Xeokit Entity 3D bounds when no metadata is parsed
  const entity = viewer.scene.objects[id];
  if (entity) {
    const rawType = entity.type || "IfcObject";
    let cleanType = rawType.startsWith("Ifc") ? rawType.substring(3) : rawType;
    let category = cleanType.replace(/([A-Z])/g, ' $1').trim();
    
    const props = [];
    if (entity.aabb) {
      const aabb = entity.aabb;
      const dx = Math.abs(aabb[3] - aabb[0]);
      const dy = Math.abs(aabb[4] - aabb[1]);
      const dz = Math.abs(aabb[5] - aabb[2]);
      const estimatedVolume = dx * dy * dz;
      const estimatedSurfaceArea = 2 * (dx * dy + dy * dz + dz * dx);
      const estimatedLength = Math.max(dx, dy, dz);
      
      props.push({ name: "Volume (Estimated)", value: estimatedVolume });
      props.push({ name: "Surface Area (Estimated)", value: estimatedSurfaceArea });
      props.push({ name: "Length (Estimated)", value: estimatedLength });
    }

    return {
      name: entity.id || `Object ${id}`,
      type: rawType,
      category: category || "Other",
      props: props
    };
  }

  return null;
}

function getDefaultUnitPrice(item) {
  const cat = (item.category || "").toLowerCase();
  if (cat.includes("door")) return 2500000;
  if (cat.includes("window")) return 1500000;
  return 500000;
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
    const objectCount = activeModel.numEntities !== undefined 
      ? activeModel.numEntities
      : (activeModel.children ? activeModel.children.length : Object.keys(viewer.scene.objects).length);
    updateStatus(`Model loaded successfully. Objects: ${objectCount}`);
    
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
      .filter(obj => (obj.model && obj.model.id === modelId) || (obj.id && obj.id.startsWith(modelId + '#')))
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

    });

    // Populate availableQuantities with both IFC metadata and 3D geometry calculations
    recalculateAvailableQuantities();
    
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

    // Save elements to SQLite DB
    const elementsList = [];
    modelObjectIds.forEach((id) => {
      const meta = getElementMetadata(id, modelId);
      if (!meta) return;

      const metaObj = viewer.metaScene.metaObjects[id];
      
      const getParamVal = (names) => {
        for (const p of meta.props) {
          if (!p.name) continue;
          const pNameLower = p.name.toLowerCase();
          if (names.some(n => pNameLower === n || pNameLower.includes(n))) {
            const valStr = String(p.value).trim();
            const matchNum = valStr.match(/^[+-]?\d+(\.\d+)?/);
            if (matchNum) {
              return parseFloat(matchNum[0]);
            }
          }
        }
        return 0;
      };

      const getMaterialVal = () => {
        for (const p of meta.props) {
          if (!p.name) continue;
          const pNameLower = p.name.toLowerCase();
          if (pNameLower.includes("material") || pNameLower === "mat") {
            return String(p.value).trim();
          }
        }
        return "";
      };

      let storey = "";
      let zone = "";
      if (metaObj) {
        let current = metaObj.parent;
        while (current) {
          if (current.type === "IfcBuildingStorey") {
            storey = current.name || current.id;
          }
          if (current.type === "IfcZone") {
            zone = current.name || current.id;
          }
          current = current.parent;
        }
      }

      const propertiesMap = {};
      meta.props.forEach(p => {
        if (p.name) propertiesMap[p.name] = p.value;
      });

      elementsList.push({
        id: id,
        globalId: metaObj ? metaObj.id : id,
        ifcType: meta.type || "IfcObject",
        name: meta.name || "",
        storey: storey,
        zone: zone,
        material: getMaterialVal(),
        volume: getParamVal(["volume", "vol", "netvolume", "grossvolume"]),
        area: getParamVal(["area", "netarea", "grossarea"]),
        surfaceArea: getParamVal(["surface area", "surfacearea", "surfarea"]) || getParamVal(["area", "netarea"]),
        length: getParamVal(["length", "len", "netlength", "grosslength", "perimeter"]),
        count: 1,
        properties: propertiesMap
      });
    });

    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: modelId, name: file.name })
    })
    .then(r => r.json())
    .then(() => {
      return fetch(`/api/projects/${modelId}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements: elementsList })
      });
    })
    .then(r => r.json())
    .then(data => {
      console.log(`[Database] Elements saved to backend SQLite db:`, data);
      window.selectedRegionId = window.selectedRegionId || 'R-JKT';
      triggerBOQGeneration(modelId, window.selectedRegionId);
      reloadResourceRatesDropdown();
    })
    .catch(err => {
      console.error('[Database] Failed to save elements to database:', err);
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

function recalculateAvailableQuantities() {
  const priceMap = {};
  availableQuantities.forEach((item) => {
    priceMap[item.id + "_" + item.quantityName] = item.unitPrice;
  });

  availableQuantities = [];

  let objectIdsToProcess = [];
  if (loadedModels.length > 0) {
    loadedModels.forEach((loadedModel) => {
      const modelId = loadedModel.id;
      const ids = Object.values(viewer.scene.objects)
        .filter(obj => obj.model && obj.model.id === modelId)
        .map(obj => obj.id);
      objectIdsToProcess.push(...ids);
    });
  }

  if (objectIdsToProcess.length === 0 && viewer && viewer.scene && viewer.scene.objects) {
    objectIdsToProcess = Object.keys(viewer.scene.objects);
  }

  objectIdsToProcess.forEach((id) => {
    const sceneObj = viewer.scene.objects[id];
    const modelId = sceneObj && sceneObj.model ? sceneObj.model.id : (activeModel ? activeModel.id : null);
    const meta = getElementMetadata(id, modelId);
    if (!meta) return;

      let qtoAdded = false;

      const tL = (meta.type || "").toLowerCase();
      const nL = (meta.name || "").toLowerCase();
      const cL = (meta.category || "").toLowerCase();

      const isFamilyInstance = (tL === "familyinstance" || cL === "familyinstance") && 
                               !(tL.includes("railing") || cL.includes("railing") || nL.includes("railing"));
      const isStair = tL.includes("stair") || cL.includes("stair") || nL.includes("stair");
      const isBeamOrColumn = tL.includes("beam") || tL.includes("column") || 
                             cL.includes("beam") || cL.includes("column");
      const isConcrete = isBeamOrColumn || tL.includes("slab") || 
                         tL.includes("footing") || tL.includes("foundation") || 
                         cL.includes("slab") || cL.includes("footing") || cL.includes("foundation") || 
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
          unit: "pcs",
          source: "ifc"
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
            unit: "risers",
            source: "ifc"
          });
          qtoAdded = true;
        }
      } else if (isBeamOrColumn) {
        const volMatch = getParamVal(["volume", "vol", "netvolume", "grossvolume"]);
        if (volMatch) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Volume",
            value: volMatch.numValue,
            unit: "m³",
            source: "ifc"
          });
        }
        const lenMatch = getParamVal(["length", "len", "netlength", "grosslength", "height"]);
        if (lenMatch) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Length",
            value: lenMatch.numValue,
            unit: "m",
            source: "ifc"
          });
        }
        const areaMatch = getParamVal(["surface area", "surfacearea", "surfarea", "outer surface area", "area", "netarea", "grossarea"]);
        if (areaMatch) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Surface Area",
            value: areaMatch.numValue,
            unit: "m²",
            source: "ifc"
          });
        }
        qtoAdded = true;
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
            unit: "m³",
            source: "ifc"
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
            unit: isRailing ? "mm" : "m",
            source: "ifc"
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
            unit: "m²",
            source: "ifc"
          });
          qtoAdded = true;
        }
      }

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
            unit: "m³",
            source: "ifc"
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
            unit: "m²",
            source: "ifc"
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
            unit: isRailing ? "mm" : "m",
            source: "ifc"
          });
          qtoAdded = true;
        }
      }

      if (!qtoAdded) {
        const isRailing = tL.includes("railing") || cL.includes("railing") || nL.includes("railing");
        availableQuantities.push({
          id: id,
          name: meta.name,
          ifcClass: meta.type,
          category: isRailing ? "Railings" : meta.category,
          quantityName: "Count",
          value: 1,
          unit: isRailing ? "pcs" : "No.s",
          source: "ifc"
        });
      }

      // Also append 3D Geometry Calculation items
      const sceneEntity = viewer.scene.objects[id];
      if (sceneEntity) {
        const dims = getEntityDimensions(sceneEntity);
        if (dims && dims.volume > 0) {
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Volume (3D Mesh)",
            value: dims.volume,
            unit: "m³",
            source: "geometry"
          });
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Surface Area (3D Mesh)",
            value: dims.area,
            unit: "m²",
            source: "geometry"
          });
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Width (W) (3D Mesh)",
            value: dims.dx,
            unit: "m",
            source: "geometry"
          });
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Height (H) (3D Mesh)",
            value: dims.dy,
            unit: "m",
            source: "geometry"
          });
          availableQuantities.push({
            id: id,
            name: meta.name,
            ifcClass: meta.type,
            category: meta.category,
            quantityName: "Length (L) (3D Mesh)",
            value: dims.dz,
            unit: "m",
            source: "geometry"
          });
        }
      }
    });

  availableQuantities.forEach((item) => {
    const cachedPrice = priceMap[item.id + "_" + item.quantityName];
    item.unitPrice = cachedPrice !== undefined ? cachedPrice : getDefaultUnitPrice(item);
    item.totalPrice = item.value * item.unitPrice;
  });

  if (qtoModal && window.getComputedStyle(qtoModal).display === 'flex') {
    renderQtoTable(qtoSearch.value);
  }
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

function appendQtoCardToProperties(elementId) {
  const container = document.getElementById('propertySetsContainer');
  if (!container) return;

  const entity = viewer.scene.objects[elementId];
  const meta = getElementMetadata(elementId, activeModel ? activeModel.id : null);
  const qtoItems = availableQuantities.filter(q => String(q.id) === String(elementId));

  // --- CARD 1: IFC Metadata QTO ---
  const ifcCard = document.createElement('div');
  ifcCard.className = "property-set-card";
  ifcCard.style.border = "1px solid #818cf8";
  ifcCard.style.marginBottom = "12px";
  ifcCard.style.overflow = "visible";

  const ifcHeader = document.createElement('div');
  ifcHeader.className = "property-set-header";
  ifcHeader.style.background = "rgba(99, 102, 241, 0.15)";
  ifcHeader.style.padding = "12px 14px";
  ifcHeader.innerHTML = `<strong style="color: #818cf8; font-size: 13px;"><i class="fa-solid fa-file-invoice"></i> QTO (IFC Metadata)</strong> <span style="color: #818cf8; font-weight: 700; font-size: 11px;">IFC PARAMETERS</span>`;
  ifcCard.appendChild(ifcHeader);

  const ifcList = document.createElement('div');
  ifcList.className = "property-list";
  ifcList.style.display = "flex";
  ifcList.style.flexDirection = "column";
  ifcList.style.padding = "12px 14px 16px 14px";
  ifcList.style.gap = "8px";

  const ifcProps = meta && meta.props ? meta.props.filter(p => !p.name.includes("(Estimated)")) : [];
  const ifcQtyProps = ifcProps.filter(p => {
    const n = p.name.toLowerCase();
    return n.includes("volume") || n.includes("area") || n.includes("length") || n.includes("perimeter") || n.includes("height");
  });

  if (ifcQtyProps.length > 0) {
    ifcQtyProps.forEach(p => {
      const row = document.createElement('div');
      row.className = "property-row";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.minHeight = "28px";

      const nameSpan = document.createElement('span');
      nameSpan.className = "property-name";
      nameSpan.style.color = "var(--text-muted)";
      nameSpan.style.fontSize = "12px";
      nameSpan.innerText = p.name;

      const valueSpan = document.createElement('span');
      valueSpan.className = "property-value";
      valueSpan.style.fontWeight = "700";
      valueSpan.style.color = "#818cf8";
      valueSpan.style.fontSize = "13px";
      valueSpan.innerText = p.value;

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      ifcList.appendChild(row);
    });
  } else if (qtoItems.length > 0) {
    qtoItems.forEach(q => {
      const row = document.createElement('div');
      row.className = "property-row";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.minHeight = "28px";

      const nameSpan = document.createElement('span');
      nameSpan.className = "property-name";
      nameSpan.style.color = "var(--text-muted)";
      nameSpan.style.fontSize = "12px";
      nameSpan.innerText = q.quantityName;

      const valueSpan = document.createElement('span');
      valueSpan.className = "property-value";
      valueSpan.style.fontWeight = "700";
      valueSpan.style.color = "#818cf8";
      valueSpan.style.fontSize = "13px";
      const valFormatted = typeof q.value === 'number' 
        ? q.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) 
        : q.value;
      valueSpan.innerText = `${valFormatted} ${q.unit || ''}`;

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      ifcList.appendChild(row);
    });
  } else {
    ifcList.innerHTML = `<p style="font-size: 11px; color: var(--text-muted); font-style: italic; margin: 0;">No explicit QTO property set exported in IFC file.</p>`;
  }

  ifcHeader.addEventListener('click', () => {
    ifcList.style.display = ifcList.style.display === 'none' ? 'flex' : 'none';
  });

  ifcCard.appendChild(ifcList);

  // --- CARD 2: 3D Geometry Calculation QTO ---
  let geoCard = null;
  if (entity) {
    const dims = getEntityDimensions(entity);
    if (dims.volume > 0) {
      geoCard = document.createElement('div');
      geoCard.className = "property-set-card";
      geoCard.style.border = "1px solid #06b6d4";
      geoCard.style.marginBottom = "14px";
      geoCard.style.overflow = "visible";

      const geoHeader = document.createElement('div');
      geoHeader.className = "property-set-header";
      geoHeader.style.background = "rgba(6, 182, 212, 0.15)";
      geoHeader.style.padding = "12px 14px";
      geoHeader.innerHTML = `<strong style="color: #06b6d4; font-size: 13px;"><i class="fa-solid fa-cube"></i> QTO (3D Geometry Calculation)</strong> <span style="color: #06b6d4; font-weight: 700; font-size: 11px;">${dims.label.toUpperCase()}</span>`;
      geoCard.appendChild(geoHeader);

      const geoList = document.createElement('div');
      geoList.className = "property-list";
      geoList.style.display = "flex";
      geoList.style.flexDirection = "column";
      geoList.style.padding = "12px 14px 16px 14px";
      geoList.style.gap = "8px";

      const geoRows = [
        { name: "Volume (3D Mesh)", val: `${dims.volume.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} m³` },
        { name: "Surface Area (3D Mesh)", val: `${dims.area.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} m²` },
        { name: "Width (W)", val: `${dims.dx.toFixed(2)} m` },
        { name: "Height (H)", val: `${dims.dy.toFixed(2)} m` },
        { name: "Length (L)", val: `${dims.dz.toFixed(2)} m` }
      ];

    geoRows.forEach(item => {
      const row = document.createElement('div');
      row.className = "property-row";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = "8px 0";
      row.style.minHeight = "28px";

      const nameSpan = document.createElement('span');
      nameSpan.className = "property-name";
      nameSpan.style.color = "var(--text-muted)";
      nameSpan.style.fontSize = "12px";
      nameSpan.innerText = item.name;

      const valueSpan = document.createElement('span');
      valueSpan.className = "property-value";
      valueSpan.style.fontWeight = "700";
      valueSpan.style.color = "#06b6d4";
      valueSpan.style.fontSize = "13px";
      valueSpan.innerText = item.val;

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      geoList.appendChild(row);
    });

    geoHeader.addEventListener('click', () => {
      geoList.style.display = geoList.style.display === 'none' ? 'flex' : 'none';
    });

    geoCard.appendChild(geoList);
    }
  }

  if (container.firstChild) {
    if (geoCard) container.insertBefore(geoCard, container.firstChild);
    container.insertBefore(ifcCard, container.firstChild);
  } else {
    container.appendChild(ifcCard);
    if (geoCard) container.appendChild(geoCard);
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
      
      const rightSidebar = document.getElementById('rightSidebar');
      if (rightSidebar && rightSidebar.classList.contains('hidden')) {
        rightSidebar.classList.remove('hidden');
        window.dispatchEvent(new Event('resize'));
      }
      
      // Fill basic properties
      propObjId.innerText = `ID: ${metaObj.id}`;
      
      propObjName.innerHTML = "";
      const nameText = document.createTextNode(metaObj.name || "Unnamed Object");
      propObjName.appendChild(nameText);
      
      const nameEditBtn = document.createElement('button');
      nameEditBtn.className = "btn-prop-action edit";
      nameEditBtn.style.opacity = "0.7";
      nameEditBtn.style.marginLeft = "8px";
      nameEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      nameEditBtn.title = "Edit object name";
      propObjName.appendChild(nameEditBtn);
      
      let isNameEditing = false;
      nameEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isNameEditing) {
          isNameEditing = true;
          const nameInput = document.createElement('input');
          nameInput.type = "text";
          nameInput.className = "property-edit-input";
          nameInput.value = metaObj.name || "";
          nameInput.style.textAlign = "left";
          nameInput.style.maxWidth = "200px";
          nameInput.style.fontSize = "14px";
          
          nameText.textContent = "";
          propObjName.insertBefore(nameInput, nameEditBtn);
          nameInput.focus();
          
          nameEditBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
          nameEditBtn.style.color = "var(--accent-color, #4CAF50)";
          
          const nameCancelBtn = document.createElement('button');
          nameCancelBtn.className = "btn-prop-action cancel";
          nameCancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
          nameCancelBtn.style.color = "#f44336";
          propObjName.appendChild(nameCancelBtn);
          
          const closeNameEdit = () => {
            if (nameInput.parentNode) propObjName.removeChild(nameInput);
            if (nameCancelBtn.parentNode) propObjName.removeChild(nameCancelBtn);
            nameText.textContent = metaObj.name || "Unnamed Object";
            nameEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            nameEditBtn.style.color = "";
            isNameEditing = false;
          };
          
          nameCancelBtn.addEventListener('click', (ce) => {
            ce.stopPropagation();
            closeNameEdit();
          });
          
          nameInput.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
              const newVal = nameInput.value;
              metaObj.name = newVal;
              closeNameEdit();
              recalculateAvailableQuantities();
              updateStatus(`Updated object name to "${newVal}"`);
            } else if (evt.key === 'Escape') {
              closeNameEdit();
            }
          });
        } else {
          const nameInput = propObjName.querySelector('.property-edit-input');
          const newVal = nameInput.value;
          metaObj.name = newVal;
          
          const nameCancelBtn = propObjName.querySelector('.cancel');
          if (nameInput.parentNode) propObjName.removeChild(nameInput);
          if (nameCancelBtn.parentNode) propObjName.removeChild(nameCancelBtn);
          nameText.textContent = newVal || "Unnamed Object";
          nameEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
          nameEditBtn.style.color = "";
          isNameEditing = false;
          
          recalculateAvailableQuantities();
          updateStatus(`Updated object name to "${newVal}"`);
        }
      });
      
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
              
              const nameSpan = document.createElement('span');
              nameSpan.className = "property-name";
              nameSpan.innerText = prop.name;
              
              const valueContainer = document.createElement('div');
              valueContainer.className = "property-value-container";
              
              const valueSpan = document.createElement('span');
              valueSpan.className = "property-value";
              valueSpan.innerText = prop.value;
              
              const editBtn = document.createElement('button');
              editBtn.className = "btn-prop-action edit";
              editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
              editBtn.title = "Edit property value";
              
              valueContainer.appendChild(valueSpan);
              valueContainer.appendChild(editBtn);
              row.appendChild(nameSpan);
              row.appendChild(valueContainer);
              list.appendChild(row);

              let isEditing = false;
              let input = null;
              let cancelBtn = null;

              editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isEditing) {
                  isEditing = true;
                  input = document.createElement('input');
                  input.type = "text";
                  input.className = "property-edit-input";
                  input.value = prop.value;
                  
                  valueSpan.style.display = "none";
                  valueContainer.insertBefore(input, editBtn);
                  input.focus();
                  
                  editBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                  editBtn.title = "Save";
                  editBtn.style.color = "var(--accent-color, #4CAF50)";
                  
                  cancelBtn = document.createElement('button');
                  cancelBtn.className = "btn-prop-action cancel";
                  cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                  cancelBtn.title = "Cancel";
                  cancelBtn.style.color = "#f44336";
                  valueContainer.appendChild(cancelBtn);
                  
                  const closeEdit = () => {
                    if (input && input.parentNode) valueContainer.removeChild(input);
                    if (cancelBtn && cancelBtn.parentNode) valueContainer.removeChild(cancelBtn);
                    valueSpan.style.display = "";
                    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                    editBtn.title = "Edit property value";
                    editBtn.style.color = "";
                    isEditing = false;
                  };

                  cancelBtn.addEventListener('click', (ce) => {
                    ce.stopPropagation();
                    closeEdit();
                  });

                  input.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') {
                      const newVal = input.value;
                      prop.value = newVal;
                      valueSpan.innerText = newVal;
                      closeEdit();
                      recalculateAvailableQuantities();
                      updateStatus(`Updated property "${prop.name}" to "${newVal}"`);
                    } else if (evt.key === 'Escape') {
                      closeEdit();
                    }
                  });
                } else {
                  const newVal = input.value;
                  prop.value = newVal;
                  valueSpan.innerText = newVal;
                  
                  if (input && input.parentNode) valueContainer.removeChild(input);
                  if (cancelBtn && cancelBtn.parentNode) valueContainer.removeChild(cancelBtn);
                  valueSpan.style.display = "";
                  editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                  editBtn.title = "Edit property value";
                  editBtn.style.color = "";
                  isEditing = false;
                  
                  recalculateAvailableQuantities();
                  updateStatus(`Updated property "${prop.name}" to "${newVal}"`);
                }
              });
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

      appendQtoCardToProperties(singleId);
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
        
        propObjName.innerHTML = "";
        const nameText = document.createTextNode(revitElement.Name || `[${revitElement.class} #${revitElement.Id}]`);
        propObjName.appendChild(nameText);
        
        const nameEditBtn = document.createElement('button');
        nameEditBtn.className = "btn-prop-action edit";
        nameEditBtn.style.opacity = "0.7";
        nameEditBtn.style.marginLeft = "8px";
        nameEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        nameEditBtn.title = "Edit Revit element name";
        propObjName.appendChild(nameEditBtn);
        
        let isNameEditing = false;
        nameEditBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!isNameEditing) {
            isNameEditing = true;
            const nameInput = document.createElement('input');
            nameInput.type = "text";
            nameInput.className = "property-edit-input";
            nameInput.value = revitElement.Name || "";
            nameInput.style.textAlign = "left";
            nameInput.style.maxWidth = "200px";
            nameInput.style.fontSize = "14px";
            
            nameText.textContent = "";
            propObjName.insertBefore(nameInput, nameEditBtn);
            nameInput.focus();
            
            nameEditBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            nameEditBtn.style.color = "var(--accent-color, #4CAF50)";
            
            const nameCancelBtn = document.createElement('button');
            nameCancelBtn.className = "btn-prop-action cancel";
            nameCancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            nameCancelBtn.style.color = "#f44336";
            propObjName.appendChild(nameCancelBtn);
            
            const closeNameEdit = () => {
              if (nameInput.parentNode) propObjName.removeChild(nameInput);
              if (nameCancelBtn.parentNode) propObjName.removeChild(nameCancelBtn);
              nameText.textContent = revitElement.Name || `[${revitElement.class} #${revitElement.Id}]`;
              nameEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
              nameEditBtn.style.color = "";
              isNameEditing = false;
            };
            
            nameCancelBtn.addEventListener('click', (ce) => {
              ce.stopPropagation();
              closeNameEdit();
            });
            
            nameInput.addEventListener('keydown', (evt) => {
              if (evt.key === 'Enter') {
                const newVal = nameInput.value;
                revitElement.Name = newVal;
                closeNameEdit();
                recalculateAvailableQuantities();
                updateStatus(`Updated Revit element name to "${newVal}"`);
              } else if (evt.key === 'Escape') {
                closeNameEdit();
              }
            });
          } else {
            const nameInput = propObjName.querySelector('.property-edit-input');
            const newVal = nameInput.value;
            revitElement.Name = newVal;
            
            const nameCancelBtn = propObjName.querySelector('.cancel');
            if (nameInput.parentNode) propObjName.removeChild(nameInput);
            if (nameCancelBtn.parentNode) propObjName.removeChild(nameCancelBtn);
            nameText.textContent = newVal || `[${revitElement.class} #${revitElement.Id}]`;
            nameEditBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            nameEditBtn.style.color = "";
            isNameEditing = false;
            
            recalculateAvailableQuantities();
            updateStatus(`Updated Revit element name to "${newVal}"`);
          }
        });
        
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
                
                const nameSpan = document.createElement('span');
                nameSpan.className = "property-name";
                nameSpan.innerText = param.Name;
                
                const valueContainer = document.createElement('div');
                valueContainer.className = "property-value-container";
                
                const valueSpan = document.createElement('span');
                valueSpan.className = "property-value";
                valueSpan.innerText = `${param.Value}${unitStr}`;
                
                const editBtn = document.createElement('button');
                editBtn.className = "btn-prop-action edit";
                editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                editBtn.title = "Edit Revit parameter value";
                
                valueContainer.appendChild(valueSpan);
                valueContainer.appendChild(editBtn);
                row.appendChild(nameSpan);
                row.appendChild(valueContainer);
                list.appendChild(row);

                let isEditing = false;
                let input = null;
                let cancelBtn = null;

                editBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  if (!isEditing) {
                    isEditing = true;
                    input = document.createElement('input');
                    input.type = "text";
                    input.className = "property-edit-input";
                    input.value = param.Value;
                    
                    valueSpan.style.display = "none";
                    valueContainer.insertBefore(input, editBtn);
                    input.focus();
                    
                    editBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    editBtn.title = "Save";
                    editBtn.style.color = "var(--accent-color, #4CAF50)";
                    
                    cancelBtn = document.createElement('button');
                    cancelBtn.className = "btn-prop-action cancel";
                    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                    cancelBtn.title = "Cancel";
                    cancelBtn.style.color = "#f44336";
                    valueContainer.appendChild(cancelBtn);
                    
                    const closeEdit = () => {
                      if (input && input.parentNode) valueContainer.removeChild(input);
                      if (cancelBtn && cancelBtn.parentNode) valueContainer.removeChild(cancelBtn);
                      valueSpan.style.display = "";
                      editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                      editBtn.title = "Edit Revit parameter value";
                      editBtn.style.color = "";
                      isEditing = false;
                    };

                    cancelBtn.addEventListener('click', (ce) => {
                      ce.stopPropagation();
                      closeEdit();
                    });

                    input.addEventListener('keydown', (evt) => {
                      if (evt.key === 'Enter') {
                        const newVal = input.value;
                        param.Value = newVal;
                        valueSpan.innerText = `${newVal}${unitStr}`;
                        closeEdit();
                        recalculateAvailableQuantities();
                        updateStatus(`Updated Revit parameter "${param.Name}" to "${newVal}"`);
                      } else if (evt.key === 'Escape') {
                        closeEdit();
                      }
                    });
                  } else {
                    const newVal = input.value;
                    param.Value = newVal;
                    valueSpan.innerText = `${newVal}${unitStr}`;
                    
                    if (input && input.parentNode) valueContainer.removeChild(input);
                    if (cancelBtn && cancelBtn.parentNode) valueContainer.removeChild(cancelBtn);
                    valueSpan.style.display = "";
                    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                    editBtn.title = "Edit Revit parameter value";
                    editBtn.style.color = "";
                    isEditing = false;
                    
                    recalculateAvailableQuantities();
                    updateStatus(`Updated Revit parameter "${param.Name}" to "${newVal}"`);
                  }
                });
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
        
        appendQtoCardToProperties(singleId);
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
    if (filterResultCount) filterResultCount.innerText = "";
    btnClearSearch.style.display = "none";
    return allObjectIds;
  }

  btnClearSearch.style.display = "block";
  const matchedIds = [];

  allObjectIds.forEach((id) => {
    const obj = viewer.scene.objects[id];
    const modelId = obj && obj.model ? obj.model.id : null;
    const meta = getElementMetadata(id, modelId);
    if (!meta) return;

    let isMatch = (meta.name && meta.name.toLowerCase().includes(query)) ||
                  (meta.type && meta.type.toLowerCase().includes(query)) ||
                  (meta.category && meta.category.toLowerCase().includes(query)) ||
                  String(id).toLowerCase().includes(query);

    if (!isMatch && meta.props) {
      for (const prop of meta.props) {
        if ((prop.name && prop.name.toLowerCase().includes(query)) ||
            (prop.value && String(prop.value).toLowerCase().includes(query))) {
          isMatch = true;
          break;
        }
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
    if (filterResultCount) filterResultCount.innerText = `Found ${matchedIds.length} matching objects`;
  } else {
    viewer.scene.setObjectsXRayed(allObjectIds, true);
    if (filterResultCount) filterResultCount.innerText = "No matching objects found";
  }

  return matchedIds;
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
  const mtlFile = files.find(f => f.name.toLowerCase().endsWith('.mtl'));
  const modelFile = files.find(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ext === 'ifc' || ext === 'xkt' || ext === 'las' || ext === 'laz' || ext === 'gltf' || ext === 'glb' || ext === 'obj' || ext === 'dae';
  });

  if (!modelFile) {
    if (mtlFile && lastLoadedObjData) {
      applyCompanionMtlFile(mtlFile);
      return;
    }
    updateStatus("No valid model file selected! Please select a .ifc, .xkt, .las, .laz, .gltf, .glb, .obj, or .dae file.", true);
    return;
  }

  if (mtlFile) {
    pendingMtlFile = mtlFile;
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
  } else if (fileExt === 'las' || fileExt === 'laz' || fileExt === 'gltf' || fileExt === 'glb' || fileExt === 'obj' || fileExt === 'dae') {
    // Disable IFC configs since it's point cloud/glTF/OBJ/DAE
    convertToXktOpt.disabled = true;
    document.querySelectorAll('input[name="ifcEngine"]').forEach(r => r.disabled = true);
    
    // Auto-trigger load
    loadModel(file, false);
  } else {
    updateStatus("Unsupported file type! Only .ifc, .xkt, .las, .laz, .gltf, .glb, .obj, and .dae files are supported.", true);
  }
}

// Re-trigger load if user toggles settings
convertToXktOpt.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    loadModel(fileInput.files[0], convertToXktOpt.checked);
  }
});

async function applyCompanionMtlFile(mtlFile) {
  if (!lastLoadedObjData) {
    updateStatus("No active OBJ model to apply materials to.", true);
    return;
  }
  try {
    showLoader("Applying Materials", `Reading ${mtlFile.name}...`, 30);
    const mtlText = await mtlFile.text();
    updateLoaderProgress(60, "Re-rendering model with materials...");

    if (activeModel) {
      activeModel.destroy();
      activeModel = null;
    }

    const { file, objText, modelId } = lastLoadedObjData;
    activeModel = new Node(viewer.scene, {
      id: modelId,
      isModel: true
    });
    activeModel.once("destroyed", () => {
      if (viewer.metaScene) {
        viewer.metaScene.destroyMetaModel(modelId);
      }
    });
    setupModelLoadedListener(modelId, file);
    objLoader._sceneGraphLoader.parse(activeModel, objText, mtlText, "");
    lastLoadedObjData.hasMtl = true;
    if (btnLoadCompanionMtl) {
      btnLoadCompanionMtl.style.display = "none";
    }
    updateStatus(`Applied companion materials from: ${mtlFile.name}`);
  } catch (err) {
    hideLoader();
    updateStatus(`Failed to apply companion materials: ${err.message}`, true);
  }
}

if (btnLoadCompanionMtl && companionMtlInput) {
  btnLoadCompanionMtl.addEventListener('click', () => {
    companionMtlInput.value = '';
    companionMtlInput.click();
  });
  companionMtlInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      applyCompanionMtlFile(e.target.files[0]);
    }
  });
}

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

// --- 5D BIM Cost Estimating, BOQ & AHSP Interface ---
window.selectedRegionId = 'R-JKT';
let activeBOQ = [];
let activeRules = [];
let activeResources = [];
let activeAHSP = [];
let qtoPieChart = null;
let qtoBarChart = null;
let boqPieChart = null;
let boqBarChart = null;

function formatIDR(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

// 1. Modal tab navigation controller
const modalTabBtns = document.querySelectorAll('#boqModal .modal-tab-btn');
const modalTabContents = document.querySelectorAll('#boqModal .modal-tab-content');

modalTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modalTabBtns.forEach(b => {
      b.classList.remove('active');
      b.style.background = 'none';
      b.style.color = 'var(--text-muted)';
    });
    modalTabContents.forEach(c => c.style.display = 'none');
    
    btn.classList.add('active');
    btn.style.background = 'rgba(255,255,255,0.08)';
    btn.style.color = 'var(--accent)';
    
    const tabId = btn.dataset.modalTab;
    const contentPane = document.getElementById(tabId);
    if (contentPane) {
      contentPane.style.display = 'flex';
    }
    
    // Trigger specific tab rendering
    if (tabId === 'boq-summary-tab') {
      renderBOQSummary();
    } else if (tabId === 'element-qto-tab') {
      renderElementQTO();
    } else if (tabId === 'rules-mapping-tab') {
      renderRulesMapping();
    } else if (tabId === 'ahsp-library-tab') {
      renderAhspLibrary();
    }
  });
});

// Render BOQ Summary Tab & Update Chart.js Dashboard
function renderBOQSummary() {
  const tbody = document.getElementById('boqTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!activeModel) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Please load a model first.</td></tr>`;
    return;
  }

  const boqSummaryText = document.getElementById('boqSummaryText');
  if (boqSummaryText) {
    const modelInfo = loadedModels.find(m => m.id === activeModel.id);
    const fileName = modelInfo ? modelInfo.fileName : (activeModel.id || 'Unknown');
    boqSummaryText.innerHTML = `Project Model: <strong>${fileName}</strong>`;
  }
  
  fetch(`/api/projects/${activeModel.id}/boq`)
    .then(r => r.json())
    .then(boq => {
      activeBOQ = boq;
      if (boq.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">No BOQ items generated. Adjust parameters and click open BOQ again.</td></tr>`;
        return;
      }
      
      let totalCost = 0;
      let laborCost = 0;
      let materialCost = 0;
      let equipmentCost = 0;

      tbody.innerHTML = boq.map(item => {
        totalCost += item.total_price;
        
        // Cost category splits heuristic
        if (item.category === 'Labor') laborCost += item.total_price;
        else if (item.category === 'Material') materialCost += item.total_price;
        else if (item.category === 'Equipment') equipmentCost += item.total_price;
        else {
          if (item.classification_code.startsWith('A.4.1.2')) {
            materialCost += item.total_price * 0.85;
            laborCost += item.total_price * 0.15;
          } else if (item.classification_code.startsWith('A.4.1.1')) {
            materialCost += item.total_price * 0.80;
            laborCost += item.total_price * 0.20;
          } else if (item.classification_code.startsWith('A.4.1.3')) {
            materialCost += item.total_price * 0.50;
            laborCost += item.total_price * 0.50;
          } else {
            laborCost += item.total_price * 0.70;
            equipmentCost += item.total_price * 0.30;
          }
        }

        const qName = item.quantity_name || (item.unit === 'm³' ? 'Volume' : (item.unit === 'm²' ? 'Area' : (item.unit === 'm' ? 'Length' : 'Count')));
        return `
          <tr data-code="${item.classification_code}">
            <td><strong style="color: var(--accent);">${item.classification_code}</strong></td>
            <td>${item.category}</td>
            <td style="font-size: 11px; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.source_title || 'General'}">${item.source_title || 'General'}</td>
            <td>${item.description}</td>
            <td><span style="font-weight: 500;">${qName}</span></td>
            <td style="text-align: right;"><strong style="color: var(--accent);">${item.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong> <span style="color: var(--text-muted); font-size: 11px;">${item.unit}</span></td>
            <td style="text-align: right; font-family: monospace;">${formatIDR(item.unit_price)}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 600; color: var(--accent);">${formatIDR(item.total_price)}</td>
            <td style="text-align: center;">
              <button class="btn btn-secondary" onclick="highlightBOQElements('${item.classification_code}')" style="padding: 2px 8px; font-size: 11px;">
                <i class="fa-solid fa-eye"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      document.getElementById('summaryTotalCost').innerText = formatIDR(totalCost);
      document.getElementById('summaryLaborCost').innerText = formatIDR(laborCost);
      document.getElementById('summaryMaterialCost').innerText = formatIDR(materialCost);
      document.getElementById('summaryEquipmentCost').innerText = formatIDR(equipmentCost);

      updateBOQCharts(boq);
    });
}

function updateBOQCharts(boq) {
  if (typeof Chart === 'undefined') return;

  const categoryTotals = {};
  boq.forEach((item) => {
    const category = item.category || "Other";
    if (!categoryTotals[category]) {
      categoryTotals[category] = 0;
    }
    categoryTotals[category] += item.total_price || 0;
  });

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  const backgroundColors = [
    'rgba(79, 70, 229, 0.75)',
    'rgba(6, 182, 212, 0.75)',
    'rgba(16, 185, 129, 0.75)',
    'rgba(239, 68, 68, 0.75)',
    'rgba(245, 158, 11, 0.75)',
    'rgba(139, 92, 246, 0.75)',
    'rgba(236, 72, 153, 0.75)'
  ];

  const borderColors = [
    '#4f46e5',
    '#06b6d4',
    '#10b981',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899'
  ];

  const pieCanvas = document.getElementById('boqPieChart');
  if (pieCanvas) {
    if (boqPieChart) {
      boqPieChart.data.labels = labels;
      boqPieChart.data.datasets[0].data = data;
      boqPieChart.update();
    } else {
      boqPieChart = new Chart(pieCanvas, {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: backgroundColors.slice(0, labels.length),
            borderColor: borderColors.slice(0, labels.length),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#f3f4f6', font: { family: 'Inter', size: 9 } }
            }
          }
        }
      });
    }
  }

  const barCanvas = document.getElementById('boqBarChart');
  if (barCanvas) {
    const sortedBOQ = [...boq].sort((a,b) => b.total_price - a.total_price).slice(0, 5);
    const barLabels = sortedBOQ.map(item => item.classification_code);
    const barData = sortedBOQ.map(item => item.total_price);

    if (boqBarChart) {
      boqBarChart.data.labels = barLabels;
      boqBarChart.data.datasets[0].data = barData;
      boqBarChart.update();
    } else {
      boqBarChart = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [{
            label: 'Total Cost (Rp)',
            data: barData,
            backgroundColor: 'rgba(6, 182, 212, 0.75)',
            borderColor: '#06b6d4',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9ca3af', font: { size: 8 } } },
            y: {
              ticks: {
                color: '#9ca3af',
                font: { size: 8 },
                callback: v => 'Rp ' + (v / 1e6).toFixed(1) + ' jt'
              }
            }
          }
        }
      });
    }
  }
}

// 5D Bidirectional Highlighter: BOQ -> 3D Elements
window.highlightBOQElements = function(classificationCode) {
  const item = activeBOQ.find(b => b.classification_code === classificationCode);
  if (!item || !item.elements) return;
  
  viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
  
  const guids = item.elements;
  const sceneIds = Object.values(viewer.scene.objects)
    .filter(obj => guids.includes(obj.id))
    .map(obj => obj.id);

  if (sceneIds.length > 0) {
    const allIds = viewer.scene.objectIds;
    viewer.scene.setObjectsVisible(allIds, true);
    viewer.scene.setObjectsXRayed(allIds, true);
    viewer.scene.setObjectsHighlighted(allIds, false);
    
    viewer.scene.setObjectsXRayed(sceneIds, false);
    viewer.scene.setObjectsHighlighted(sceneIds, true);
    viewer.cameraFlight.flyTo(sceneIds);
    updateStatus(`Isolated WBS ${classificationCode} elements.`);
  } else {
    updateStatus(`No active elements found in visual viewport for ${classificationCode}.`, true);
  }
};

// 5D Bidirectional Highlighter: 3D Element selection -> BOQ sheet highlighting
function highlightBOQRowsForElement(globalId) {
  const matchingWbs = activeBOQ.filter(b => b.elements && b.elements.includes(globalId)).map(b => b.classification_code);
  const rows = document.querySelectorAll('#boqTableBody tr');
  rows.forEach(row => {
    const code = row.dataset.code;
    if (matchingWbs.includes(code)) {
      row.style.background = 'rgba(6, 182, 212, 0.2)';
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      row.style.background = '';
    }
  });
}

// Zoom & highlight element on 3D canvas
window.zoomToElement = function(elementGuid) {
  if (!viewer) return;
  
  // Clear existing selections
  viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
  viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
  
  const obj = viewer.scene.objects[elementGuid];
  if (obj) {
    const allIds = viewer.scene.objectIds;
    viewer.scene.setObjectsVisible(allIds, true);
    viewer.scene.setObjectsXRayed(allIds, true);
    
    // Highlight and isolate this element
    viewer.scene.setObjectsXRayed([elementGuid], false);
    viewer.scene.setObjectsHighlighted([elementGuid], true);
    viewer.cameraFlight.flyTo([elementGuid]);
    updateStatus(`Highlighted element: ${obj.id}`);
    
    // Close the BOQ Modal panel so the user can see the 3D canvas
    const modal = document.getElementById('boqModal');
    if (modal) {
      modal.style.display = 'none';
    }
  } else {
    updateStatus(`Element ${elementGuid} not found in 3D viewport.`, true);
  }
};

// Element QTO and Overrides tab
function renderElementQTO() {
  const tbody = document.getElementById('elementQtoTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!activeModel) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 20px;">Please load a model first.</td></tr>`;
    return;
  }

  if (availableQuantities.length === 0 && typeof recalculateAvailableQuantities === 'function') {
    recalculateAvailableQuantities();
  }
  
  Promise.all([
    fetch(`/api/projects/${activeModel.id}/elements`).then(r => r.json()),
    fetch(`/api/projects/${activeModel.id}/overrides`).then(r => r.json()),
    fetch(`/api/classifications`).then(r => r.json()),
    fetch(`/api/projects/${activeModel.id}/classification-overrides`).then(r => r.json()),
    fetch(`/api/projects/${activeModel.id}/boq`).then(r => r.json()),
    fetch(`/api/rules`).then(r => r.json())
  ]).then(([elements, overrides, classifications, classOverrides, boqResponse, rules]) => {
    const overrideMap = {};
    overrides.forEach(o => {
      if (!overrideMap[o.element_id]) overrideMap[o.element_id] = {};
      overrideMap[o.element_id][o.quantity_name] = o.override_value;
    });

    const defaultRuleMap = {};
    if (Array.isArray(boqResponse)) {
      boqResponse.forEach(item => {
        if (item.elements && Array.isArray(item.elements)) {
          item.elements.forEach(guid => {
            defaultRuleMap[guid] = item.classification_code;
          });
        }
      });
    }

    const manualOverrideMap = {};
    if (Array.isArray(classOverrides)) {
      classOverrides.forEach(co => {
        manualOverrideMap[co.element_id] = co.classification_code;
      });
    }

    const filterText = document.getElementById('elementQtoSearch').value.toLowerCase().trim();

    // Extract unique IFC types configured in rules table
    const uniqueRuleIfcTypes = Array.from(new Set(rules.map(r => r.ifc_type))).sort();

    tbody.innerHTML = elements.filter(el => {
      return filterText === '' ||
        el.name.toLowerCase().includes(filterText) ||
        el.ifc_type.toLowerCase().includes(filterText) ||
        (el.ifc_type_override && el.ifc_type_override.toLowerCase().includes(filterText)) ||
        el.storey.toLowerCase().includes(filterText) ||
        el.material.toLowerCase().includes(filterText);
    }).map(el => {
      // Find matching quantity options from availableQuantities
      let opts = availableQuantities.filter(q => String(q.id) === String(el.global_id) || String(q.id) === String(el.id));
      if (opts.length === 0) {
        opts = [];
        if (el.volume) opts.push({ id: el.id, quantityName: 'Volume', value: el.volume, unit: 'm³', source: 'ifc' });
        if (el.area) opts.push({ id: el.id, quantityName: 'Area', value: el.area, unit: 'm²', source: 'ifc' });
        if (el.length) opts.push({ id: el.id, quantityName: 'Length', value: el.length, unit: 'm', source: 'ifc' });
        opts.push({ id: el.id, quantityName: 'Count', value: el.count || 1, unit: 'pcs', source: 'ifc' });

        const sceneEntity = viewer.scene && viewer.scene.objects ? (viewer.scene.objects[el.global_id] || viewer.scene.objects[el.id]) : null;
        if (sceneEntity && typeof getEntityDimensions === 'function') {
          const dims = getEntityDimensions(sceneEntity);
          if (dims && dims.volume > 0) {
            opts.push({ id: el.id, quantityName: 'Volume (3D Mesh)', value: dims.volume, unit: 'm³', source: 'geometry' });
            opts.push({ id: el.id, quantityName: 'Surface Area (3D Mesh)', value: dims.area, unit: 'm²', source: 'geometry' });
            opts.push({ id: el.id, quantityName: 'Width (W) (3D Mesh)', value: dims.dx, unit: 'm', source: 'geometry' });
            opts.push({ id: el.id, quantityName: 'Height (H) (3D Mesh)', value: dims.dy, unit: 'm', source: 'geometry' });
            opts.push({ id: el.id, quantityName: 'Length (L) (3D Mesh)', value: dims.dz, unit: 'm', source: 'geometry' });
          }
        }
      }

      let selIdx = elementSelectedQtyIndex[el.global_id];
      if (selIdx === undefined) selIdx = elementSelectedQtyIndex[el.id];
      if (selIdx === undefined || selIdx >= opts.length) selIdx = 0;

      const activeOpt = opts[selIdx];

      const ifcOpts = opts.map((opt, idx) => ({ opt, idx })).filter(o => o.opt.source !== 'geometry');
      const geoOpts = opts.map((opt, idx) => ({ opt, idx })).filter(o => o.opt.source === 'geometry');

      let qtySelectHtml = `<select class="qto-element-qty-select" data-el-id="${el.id}" data-global-id="${el.global_id}" style="width: 100%; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color);">`;
      if (ifcOpts.length > 0) {
        qtySelectHtml += `<optgroup label="IFC Metadata">`;
        ifcOpts.forEach(o => {
          const valStr = typeof o.opt.value === 'number' ? o.opt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : o.opt.value;
          qtySelectHtml += `<option value="${o.idx}" ${o.idx === selIdx ? 'selected' : ''}>${o.opt.quantityName} (${valStr} ${o.opt.unit || ''})</option>`;
        });
        qtySelectHtml += `</optgroup>`;
      }
      if (geoOpts.length > 0) {
        qtySelectHtml += `<optgroup label="3D Geometry Calculation">`;
        geoOpts.forEach(o => {
          const valStr = typeof o.opt.value === 'number' ? o.opt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : o.opt.value;
          qtySelectHtml += `<option value="${o.idx}" ${o.idx === selIdx ? 'selected' : ''}>${o.opt.quantityName} (${valStr} ${o.opt.unit || ''})</option>`;
        });
        qtySelectHtml += `</optgroup>`;
      }
      qtySelectHtml += `</select>`;

      const valDisplay = activeOpt ? (typeof activeOpt.value === 'number' ? activeOpt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : activeOpt.value) : '-';
      const unitDisplay = activeOpt && activeOpt.unit ? activeOpt.unit : '';
      const valHtml = `<strong style="color: var(--accent);">${valDisplay}</strong> <span style="color: var(--text-muted); font-size: 11px;">${unitDisplay}</span>`;

      // Generate IFC Correction dropdown
      let ifcCorrectionHtml = `<select class="qto-ifc-override-select" data-el-id="${el.id}" style="width: 100%; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color);">`;
      ifcCorrectionHtml += `<option value="" ${!el.ifc_type_override ? 'selected' : ''}>-- No Correction --</option>`;
      uniqueRuleIfcTypes.forEach(t => {
        ifcCorrectionHtml += `<option value="${t}" ${el.ifc_type_override === t ? 'selected' : ''}>${t}</option>`;
      });
      ifcCorrectionHtml += `</select>`;

      // Get active IFC type (either overridden/corrected or actual)
      const activeIfcType = (el.ifc_type_override || el.ifc_type).toLowerCase();

      // Get rules matching this active IFC type
      const matchedRules = rules.filter(r => r.ifc_type.toLowerCase() === activeIfcType || r.ifc_type.toLowerCase() === 'all');

      // Generate classification override dropdown
      let selectHtml = `<select class="qto-class-select" data-el-id="${el.id}" style="width: 100%; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color);">`;
      
      const defaultCode = defaultRuleMap[el.global_id];
      const defaultLabel = defaultCode 
        ? `Default Rule: ${defaultCode}` 
        : `-- No Classification Override --`;
      
      selectHtml += `<option value="" ${!manualOverrideMap[el.id] ? 'selected' : ''}>${defaultLabel}</option>`;
      
      matchedRules.forEach(r => {
        const isManualSelected = manualOverrideMap[el.id] === r.classification_code;
        selectHtml += `<option value="${r.classification_code}" ${isManualSelected ? 'selected' : ''}>${r.rule_name} (${r.classification_code})</option>`;
      });

      // Keep manual override option if it doesn't match current matched rules
      const activeOverride = manualOverrideMap[el.id];
      if (activeOverride && !matchedRules.some(r => r.classification_code === activeOverride)) {
        const cls = classifications.find(c => c.code === activeOverride);
        const label = cls ? `${cls.code} - ${cls.description}` : activeOverride;
        selectHtml += `<option value="${activeOverride}" selected>${label} (Manual Override)</option>`;
      }
      
      selectHtml += `</select>`;

      return `
        <tr>
          <td><a href="#" onclick="zoomToElement('${el.global_id}'); return false;" style="color: var(--accent); text-decoration: underline; cursor: pointer; font-weight: 600;">${el.name || 'Unnamed'}</a></td>
          <td><span style="font-size: 11px; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px;">${el.ifc_type}</span></td>
          <td>${ifcCorrectionHtml}</td>
          <td>${el.storey || '-'}</td>
          <td><span style="color: var(--text-muted);">${el.material || '-'}</span></td>
          <td style="min-width: 180px;">${qtySelectHtml}</td>
          <td style="text-align: right;">${valHtml}</td>
          <td style="text-align: right;">${el.count}</td>
          <td>${selectHtml}</td>
          <td style="text-align: center;">
            <button class="btn btn-secondary" onclick="openOverrideDialog('${el.id}', '${el.name || el.ifc_type}')" style="padding: 2px 8px; font-size: 11px;">
              Override
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Setup Quantity Name dropdown change events
    tbody.querySelectorAll('.qto-element-qty-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const elId = e.target.dataset.elId;
        const globalId = e.target.dataset.globalId;
        const selectedIdx = parseInt(e.target.value, 10);

        if (globalId) elementSelectedQtyIndex[globalId] = selectedIdx;
        if (elId) elementSelectedQtyIndex[elId] = selectedIdx;

        let opts = availableQuantities.filter(q => String(q.id) === String(globalId) || String(q.id) === String(elId));
        if (opts.length === 0) {
          const el = elements.find(item => String(item.id) === String(elId));
          if (el) {
            opts = [];
            if (el.volume) opts.push({ id: el.id, quantityName: 'Volume', value: el.volume, unit: 'm³', source: 'ifc' });
            if (el.area) opts.push({ id: el.id, quantityName: 'Area', value: el.area, unit: 'm²', source: 'ifc' });
            if (el.length) opts.push({ id: el.id, quantityName: 'Length', value: el.length, unit: 'm', source: 'ifc' });
            opts.push({ id: el.id, quantityName: 'Count', value: el.count || 1, unit: 'pcs', source: 'ifc' });
          }
        }

        const activeOpt = opts[selectedIdx];
        if (activeOpt) {
          fetch(`/api/projects/${activeModel.id}/overrides`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              element_id: elId,
              quantity_name: activeOpt.quantityName,
              override_value: activeOpt.value,
              reason: 'Selected quantity in Element QTO Table'
            })
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              updateStatus(`Selected quantity "${activeOpt.quantityName}" for total price calculation.`);
              if (typeof triggerBOQGeneration === 'function') {
                triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
              }
              renderElementQTO();
            }
          });
        }
      });
    });

    // Setup select change events
    tbody.querySelectorAll('.qto-class-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const elId = e.target.dataset.elId;
        const code = e.target.value;
        
        fetch(`/api/projects/${activeModel.id}/elements/${elId}/classification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classificationCode: code })
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            updateStatus("Manual classification assigned successfully.");
            if (typeof triggerBOQGeneration === 'function') {
              triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
            }
            renderElementQTO();
          }
        });
      });
    });

    // Setup IFC correction dropdown change events
    tbody.querySelectorAll('.qto-ifc-override-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const elId = e.target.dataset.elId;
        const correctedType = e.target.value;
        
        fetch(`/api/projects/${activeModel.id}/elements/${elId}/ifc-type-override`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ifcTypeOverride: correctedType })
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            updateStatus("IFC correction applied successfully.");
            if (typeof triggerBOQGeneration === 'function') {
              triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
            }
            renderElementQTO();
          }
        });
      });
    });
  });
}

window.openOverrideDialog = function(elementId, elementName) {
  const qtyName = prompt(`Enter quantity parameter to override (volume, area, surface_area, length, count):`, "volume");
  if (!qtyName) return;
  
  const valStr = prompt(`Enter manual override value for ${elementName} (${qtyName}):`);
  if (valStr === null || valStr.trim() === '') return;
  const val = parseFloat(valStr);
  if (isNaN(val)) {
    alert("Invalid numerical input.");
    return;
  }
  
  const reason = prompt("Enter justification for this override:");
  if (reason === null) return;
  
  fetch(`/api/projects/${activeModel.id}/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      element_id: elementId,
      quantity_name: qtyName,
      override_value: val,
      reason: reason || 'Estimate override',
      updated_by: 'Senior Dev'
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      updateStatus(`Override updated for ${elementName}.`);
      renderElementQTO();
      triggerBOQGeneration(activeModel.id, window.selectedRegionId);
    }
  });
};

// Mappings & Rules Tab
function renderRulesMapping() {
  const tbody = document.getElementById('rulesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Populate classifications/analyses select dynamically
  fetch(`/api/ahsp?regionId=${window.selectedRegionId || 'R-JKT'}`)
    .then(r => r.json())
    .then(analyses => {
      updateRuleClassCodeSelect(analyses);
    });
  
  fetch('/api/rules')
    .then(r => r.json())
    .then(rules => {
      activeRules = rules;
      tbody.innerHTML = rules.map(r => `
        <tr>
          <td><strong>${r.rule_name}</strong></td>
          <td>${r.ifc_type}</td>
          <td>${r.material_filter || '<span style="color: var(--text-muted); font-size: 11px;">Any</span>'}</td>
          <td><strong style="color: var(--accent);" title="${r.classification_desc || ''}">${r.analysis_code && r.analysis_code !== r.classification_display_code ? `${r.analysis_code} (${r.classification_display_code})` : (r.classification_display_code || r.classification_code)}</strong></td>
          <td><code>${r.quantity_expression}</code></td>
          <td style="text-align: center;">${r.priority}</td>
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-close" onclick="deleteRule('${r.id}')" style="padding: 2px 6px; font-size: 10px;"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `).join('');
    });
}

window.deleteRule = function(id) {
  if (!confirm("Delete this rule mapping?")) return;
  fetch(`/api/rules/${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        updateStatus("Mapping rule removed.");
        renderRulesMapping();
        if (activeModel) triggerBOQGeneration(activeModel.id, window.selectedRegionId);
      }
    });
};

const btnSaveRule = document.getElementById('btnSaveRule');
if (btnSaveRule) {
  btnSaveRule.addEventListener('click', () => {
    const rule_name = document.getElementById('ruleNameInput').value;
    const ifc_type = document.getElementById('ruleIfcTypeInput').value;
    const material_filter = document.getElementById('ruleMaterialInput').value;
    const classification_code = document.getElementById('ruleClassCodeSelect').value;
    const quantity_expression = document.getElementById('ruleFormulaInput').value;
    const priority = parseInt(document.getElementById('rulePriorityInput').value) || 10;
    
    if (!rule_name || !ifc_type || !classification_code || !quantity_expression) {
      alert("Please complete rule configuration fields.");
      return;
    }
    
    fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_name, ifc_type, material_filter, classification_code, quantity_expression, priority })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        updateStatus(`Rule registered: "${rule_name}"`);
        renderRulesMapping();
        if (activeModel) triggerBOQGeneration(activeModel.id, window.selectedRegionId);
      }
    });
  });
}

// AHSP Standard Library Tab
let hasCatalogFilterListener = false;
function renderAhspLibrary() {
  const tbody = document.getElementById('ahspTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const filterSelect = document.getElementById('ahspCatalogFilter');
  if (filterSelect && !hasCatalogFilterListener) {
    filterSelect.addEventListener('change', () => {
      filterAhspLibraryTable();
    });
    hasCatalogFilterListener = true;
  }
  
  fetch(`/api/ahsp?regionId=${window.selectedRegionId}`)
    .then(r => r.json())
    .then(analyses => {
      activeAHSP = analyses;
      
      // Update catalog dropdown
      if (filterSelect) {
        const uniqueCatalogs = Array.from(new Set(analyses.map(a => a.source_title || 'General'))).sort();
        const prevVal = filterSelect.value;
        filterSelect.innerHTML = '<option value="">-- All Catalogs --</option>';
        uniqueCatalogs.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat;
          opt.textContent = cat;
          filterSelect.appendChild(opt);
        });
        if (uniqueCatalogs.includes(prevVal)) {
          filterSelect.value = prevVal;
        } else {
          filterSelect.value = '';
        }
      }

      filterAhspLibraryTable();
    });
}

function filterAhspLibraryTable() {
  const tbody = document.getElementById('ahspTableBody');
  if (!tbody) return;
  
  const filterSelect = document.getElementById('ahspCatalogFilter');
  const selectedCatalog = filterSelect ? filterSelect.value : '';
  
  let filtered = activeAHSP || [];
  if (selectedCatalog) {
    filtered = filtered.filter(a => (a.source_title || 'General') === selectedCatalog);
  }
  
  tbody.innerHTML = filtered.map(a => `
    <tr style="cursor: pointer;" onclick="showAHSPDetails('${a.code}')">
      <td><strong style="color: var(--accent);">${a.code}</strong></td>
      <td>${a.classification_code}</td>
      <td style="font-size: 11px; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${a.source_title || 'General'}">${a.source_title || 'General'}</td>
      <td>${a.description}</td>
    </tr>
  `).join('');

  updateRuleClassCodeSelect(filtered);
}

function updateRuleClassCodeSelect(filteredAnalyses) {
  const select = document.getElementById('ruleClassCodeSelect');
  if (!select) return;
  const prevVal = select.value;
  select.innerHTML = '';
  
  filteredAnalyses.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.code;
    opt.textContent = a.classification_code !== a.code 
      ? `${a.code} (${a.classification_code}) - ${a.description}` 
      : `${a.code} - ${a.description}`;
    select.appendChild(opt);
  });
  
  select.value = prevVal;
  if (!select.value && select.options.length > 0) {
    select.selectedIndex = 0;
  }
}

window.showAHSPDetails = function(code) {
  const ana = activeAHSP.find(a => a.code === code);
  if (!ana) return;
  
  window.activeAnalysisCode = code;
  document.getElementById('ahspDetailsHeader').innerText = `Breakdown for ${ana.code}`;
  
  const addForm = document.getElementById('addAhspDetailForm');
  if (addForm) addForm.style.display = 'flex';
  
  const resourceSelect = document.getElementById('newDetailResourceSelect');
  if (resourceSelect) {
    fetch(`/api/resource-prices?regionId=${window.selectedRegionId || 'R-JKT'}`)
      .then(r => r.json())
      .then(prices => {
        resourceSelect.innerHTML = prices.map(p => `
          <option value="${p.resource_id}">${p.resource_id} - ${p.description} (${p.unit})</option>
        `).join('');
      });
  }

  const tbody = document.getElementById('ahspDetailsTableBody');
  tbody.innerHTML = '';
  
  let totalCost = 0;
  tbody.innerHTML = ana.details.map(d => {
    const rowCost = d.coefficient * d.waste_factor * d.price;
    totalCost += rowCost;
    return `
      <tr data-detail-id="${d.id}">
        <td><strong>${d.resource_id}</strong></td>
        <td>${d.category}</td>
        <td>${d.description}</td>
        <td>${d.unit}</td>
        <td>
          <input type="number" step="any" class="dt-coef-input" data-detail-id="${d.id}" value="${d.coefficient}" style="width: 70px; padding: 2px; text-align: right; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color); font-size: 11px;">
        </td>
        <td>
          <input type="number" step="any" class="dt-waste-input" data-detail-id="${d.id}" value="${d.waste_factor || 1.0}" style="width: 60px; padding: 2px; text-align: right; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-color); font-size: 11px;">
        </td>
        <td style="text-align: right; font-family: monospace;">${formatIDR(d.price)}</td>
        <td style="text-align: right; font-family: monospace; color: var(--accent);">${formatIDR(rowCost)}</td>
        <td style="text-align: center;">
          <button class="btn btn-secondary danger" onclick="deleteAhspDetail('${d.id}')" style="padding: 2px 6px; font-size: 10px;"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
  
  const finalUnitPrice = totalCost * (1.0 + (ana.overhead_factor || 0.10));
  
  document.getElementById('ahspDetailsTable').style.display = 'table';
  document.getElementById('ahspDetailsSummary').style.display = 'block';
  document.getElementById('ahspCalculatedUnitPrice').innerText = `Derived Unit Price: ${formatIDR(finalUnitPrice)} / unit`;
  
  tbody.querySelectorAll('.dt-coef-input, .dt-waste-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const detailId = e.target.dataset.detailId;
      const row = tbody.querySelector(`tr[data-detail-id="${detailId}"]`);
      const coef = parseFloat(row.querySelector('.dt-coef-input').value) || 0;
      const waste = parseFloat(row.querySelector('.dt-waste-input').value) || 1.0;
      
      fetch('/api/ahsp-details/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: detailId, coefficient: coef, waste_factor: waste })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          updateStatus("Detail breakdown coefficient updated.");
          refreshAhspData();
        }
      });
    });
  });
};

function refreshAhspData() {
  fetch(`/api/ahsp?regionId=${window.selectedRegionId}`)
    .then(r => r.json())
    .then(analyses => {
      activeAHSP = analyses;
      filterAhspLibraryTable();
      if (window.activeAnalysisCode) {
        window.showAHSPDetails(window.activeAnalysisCode);
      }
      if (activeModel) {
        triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
      }
    });
}

window.deleteAhspDetail = function(detailId) {
  if (!confirm("Are you sure you want to delete this resource from the analysis breakdown?")) return;
  fetch(`/api/ahsp-details/${detailId}/delete`, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        updateStatus("Detail item deleted.");
        refreshAhspData();
      }
    });
};

// Wire up the add breakdown detail listener
setTimeout(() => {
  const btnAddAhspDetail = document.getElementById('btnAddAhspDetail');
  if (btnAddAhspDetail) {
    btnAddAhspDetail.addEventListener('click', () => {
      const ahsp_code = window.activeAnalysisCode;
      const resource_id = document.getElementById('newDetailResourceSelect').value;
      const coefficient = parseFloat(document.getElementById('newDetailCoefficient').value);
      const waste_factor = parseFloat(document.getElementById('newDetailWaste').value) || 1.0;
      
      if (!ahsp_code) {
        alert("Please select an analysis first.");
        return;
      }
      if (!resource_id || isNaN(coefficient)) {
        alert("Please select a resource and specify coefficient.");
        return;
      }
      
      fetch('/api/ahsp-details/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ahsp_code, resource_id, coefficient, waste_factor })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          updateStatus("Added new resource detail to analysis.");
          document.getElementById('newDetailCoefficient').value = '';
          document.getElementById('newDetailWaste').value = '1.0';
          refreshAhspData();
        }
      });
    });
  }
}, 500);

// Sidebar cost configurations

const boqRegionSelect = document.getElementById('boqRegionSelect');
if (boqRegionSelect) {
  boqRegionSelect.addEventListener('change', (e) => {
    window.selectedRegionId = e.target.value;
    reloadResourceRatesDropdown();
    if (activeModel) {
      triggerBOQGeneration(activeModel.id, window.selectedRegionId);
    }
  });
}

function reloadResourceRatesDropdown() {
  const select = document.getElementById('rateResourceSelect');
  if (!select) return;
  fetch(`/api/resource-prices?regionId=${window.selectedRegionId}`)
    .then(r => r.json())
    .then(prices => {
      select.innerHTML = prices.map(p => `
        <option value="${p.resource_id}" data-price="${p.price}">${p.description} (${p.unit}) - ${formatIDR(p.price)}</option>
      `).join('');
      updateResourcePriceInput();
    });
}

function updateResourcePriceInput() {
  const select = document.getElementById('rateResourceSelect');
  const priceInput = document.getElementById('rateResourcePrice');
  if (select && priceInput) {
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt) {
      priceInput.value = selectedOpt.dataset.price || 0;
    }
  }
}

const rateResourceSelect = document.getElementById('rateResourceSelect');
if (rateResourceSelect) {
  rateResourceSelect.addEventListener('change', updateResourcePriceInput);
}

const btnUpdateResourceRate = document.getElementById('btnUpdateResourceRate');
if (btnUpdateResourceRate) {
  btnUpdateResourceRate.addEventListener('click', () => {
    const resId = document.getElementById('rateResourceSelect').value;
    const price = parseFloat(document.getElementById('rateResourcePrice').value);
    
    if (!resId || isNaN(price)) {
      alert("Select resource and define valid price.");
      return;
    }
    
    fetch('/api/resource-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: resId, region_id: window.selectedRegionId, price })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        updateStatus("Resource price adjusted.");
        reloadResourceRatesDropdown();
        if (activeModel) {
          triggerBOQGeneration(activeModel.id, window.selectedRegionId);
        }
      }
    });
  });
}

function triggerBOQGeneration(projectId, regionId) {
  fetch(`/api/projects/${projectId}/boq/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regionId })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      activeBOQ = data.boq;
      if (document.getElementById('boqModal').style.display === 'flex') {
        const activeTab = document.querySelector('#boqModal .modal-tab-btn.active').dataset.modalTab;
        if (activeTab === 'boq-summary-tab') renderBOQSummary();
      }
      refreshOverridesSidebar();
    }
  });
}

function refreshOverridesSidebar() {
  if (!activeModel) return;
  fetch(`/api/projects/${activeModel.id}/overrides`)
    .then(r => r.json())
    .then(overrides => {
      const list = document.getElementById('overridesList');
      if (overrides.length === 0) {
        list.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin: 10px 0;">No active overrides.</p>`;
        return;
      }
      list.innerHTML = overrides.map(o => `
        <div style="border-bottom: 1px solid var(--border-color); padding: 6px 0; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: var(--accent);">${o.element_name || o.ifc_type}</strong><br>
            <span style="color: var(--text-muted);">${o.quantity_name}: ${o.calculated_value} -> <strong>${o.override_value}</strong></span>
          </div>
          <button class="btn btn-secondary btn-close" onclick="deleteOverride('${o.id}')" style="padding: 2px 6px; font-size: 10px;"><i class="fa-solid fa-trash"></i></button>
        </div>
      `).join('');
    });
}

window.deleteOverride = function(overrideId) {
  if (!confirm("Delete this manual quantity override?")) return;
  fetch(`/api/projects/${activeModel.id}/overrides/${overrideId}`, { method: 'DELETE' })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        updateStatus("Quantity override deleted.");
        refreshOverridesSidebar();
        triggerBOQGeneration(activeModel.id, window.selectedRegionId);
        if (document.getElementById('boqModal').style.display === 'flex') {
          const activeTab = document.querySelector('#boqModal .modal-tab-btn.active').dataset.modalTab;
          if (activeTab === 'element-qto-tab') renderElementQTO();
        }
      }
    });
};

const elementQtoSearch = document.getElementById('elementQtoSearch');
if (elementQtoSearch) {
  elementQtoSearch.addEventListener('input', renderElementQTO);
}

// Modify object selection UI to highlight matching rows in BOQ
const originalUpdateSelectionUI = updateSelectionUI;
updateSelectionUI = function() {
  originalUpdateSelectionUI();
  const selectedIds = viewer.scene.selectedObjectIds;
  if (selectedIds.length === 1 && activeBOQ.length > 0) {
    const metaObj = viewer.metaScene.metaObjects[selectedIds[0]];
    if (metaObj) {
      highlightBOQRowsForElement(metaObj.id);
    }
  }
};

// Clean up category strings for display/grouping
function getCleanCategory(item) {
  let cat = item.category || item.ifcClass || "Other";
  if (cat.startsWith("Ifc")) {
    cat = cat.substring(3);
  }
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// Update or initialize Pie and Bar charts using Chart.js for QTO
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
    'rgba(79, 70, 229, 0.75)',
    'rgba(6, 182, 212, 0.75)',
    'rgba(16, 185, 129, 0.75)',
    'rgba(239, 68, 68, 0.75)',
    'rgba(245, 158, 11, 0.75)',
    'rgba(139, 92, 246, 0.75)',
    'rgba(236, 72, 153, 0.75)'
  ];
  
  const borderColors = [
    '#4f46e5',
    '#06b6d4',
    '#10b981',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899'
  ];
  
  const pieCanvas = document.getElementById('qtoPieChart');
  if (pieCanvas) {
    if (qtoPieChart) {
      qtoPieChart.data.labels = labels;
      qtoPieChart.data.datasets[0].data = data;
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
              labels: { color: '#f3f4f6', font: { family: 'Inter', size: 10 } }
            }
          }
        }
      });
    }
  }
  
  const barCanvas = document.getElementById('qtoBarChart');
  if (barCanvas) {
    if (qtoBarChart) {
      qtoBarChart.data.labels = labels;
      qtoBarChart.data.datasets[0].data = data;
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
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9ca3af', font: { size: 9 } } },
            y: {
              ticks: {
                color: '#9ca3af',
                font: { size: 9 },
                callback: function(value) {
                  if (value >= 1e6) return 'Rp ' + (value / 1e6).toFixed(1) + ' jt';
                  if (value >= 1e3) return 'Rp ' + (value / 1e3).toFixed(0) + ' rb';
                  return 'Rp ' + value;
                }
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
                  (item.ifcClass || "").toLowerCase().includes(query) || 
                  (item.category || "").toLowerCase().includes(query) || 
                  (item.quantityName || "").toLowerCase().includes(query) || 
                  (item.name || "").toLowerCase().includes(query);
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

const elementSelectedQtyIndex = {};

function renderQtoTable(filterText = "") {
  qtoTableBody.innerHTML = "";
  const query = filterText.toLowerCase().trim();

  // Group available quantities by element ID
  const groupedByElement = {};
  availableQuantities.forEach((item) => {
    if (!groupedByElement[item.id]) {
      groupedByElement[item.id] = {
        id: item.id,
        name: item.name,
        ifcClass: item.ifcClass,
        category: item.category,
        options: []
      };
    }
    groupedByElement[item.id].options.push(item);
  });

  const renderRows = (boqElementPriceMap = {}) => {
    Object.values(groupedByElement).forEach((elem) => {
      const match = query === "" || 
                    (elem.ifcClass || "").toLowerCase().includes(query) || 
                    (elem.category || "").toLowerCase().includes(query) || 
                    (elem.name || "").toLowerCase().includes(query) ||
                    elem.options.some(opt => (opt.quantityName || "").toLowerCase().includes(query));
      
      if (match) {
        let selIdx = elementSelectedQtyIndex[elem.id];
        if (selIdx === undefined || selIdx >= elem.options.length) {
          selIdx = 0;
        }

        const activeOpt = elem.options[selIdx];
        const metaObj = viewer.metaScene ? viewer.metaScene.metaObjects[elem.id] : null;
        const globalId = metaObj ? metaObj.id : elem.id;
        const boqPrice = boqElementPriceMap[globalId];
        if (boqPrice !== undefined) {
          activeOpt.unitPrice = boqPrice;
          activeOpt.totalPrice = activeOpt.value * boqPrice;
        }

        const ifcOpts = elem.options.map((opt, idx) => ({ opt, idx })).filter(o => o.opt.source !== 'geometry');
        const geoOpts = elem.options.map((opt, idx) => ({ opt, idx })).filter(o => o.opt.source === 'geometry');

        let selectHtml = `<select class="qto-qty-select form-input form-input-sm" data-id="${elem.id}" style="padding: 4px 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; width: 100%;">`;

        if (ifcOpts.length > 0) {
          selectHtml += `<optgroup label="IFC Metadata">`;
          ifcOpts.forEach(o => {
            const valStr = typeof o.opt.value === 'number' ? o.opt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : o.opt.value;
            selectHtml += `<option value="${o.idx}" ${o.idx === selIdx ? 'selected' : ''}>${o.opt.quantityName} (${valStr} ${o.opt.unit})</option>`;
          });
          selectHtml += `</optgroup>`;
        }

        if (geoOpts.length > 0) {
          selectHtml += `<optgroup label="3D Geometry Calculation">`;
          geoOpts.forEach(o => {
            const valStr = typeof o.opt.value === 'number' ? o.opt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : o.opt.value;
            selectHtml += `<option value="${o.idx}" ${o.idx === selIdx ? 'selected' : ''}>${o.opt.quantityName} (${valStr} ${o.opt.unit})</option>`;
          });
          selectHtml += `</optgroup>`;
        }

        selectHtml += `</select>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${elem.ifcClass || ""}</td>
          <td>${elem.category || ""}</td>
          <td><span class="qto-object-link" data-id="${elem.id}" style="color: var(--accent); text-decoration: underline; cursor: pointer; font-weight: 500;">${elem.name || ""}</span></td>
          <td style="min-width: 210px;">${selectHtml}</td>
          <td><strong class="qto-val-display" data-id="${elem.id}">${typeof activeOpt.value === 'number' ? activeOpt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : activeOpt.value}</strong></td>
          <td><span class="qto-unit-display" data-id="${elem.id}">${activeOpt.unit || ""}</span></td>
        `;
        qtoTableBody.appendChild(tr);
      }
    });
    updateQtoSummaryAndCharts();
  };

  renderRows({});

  if (activeModel) {
    fetch(`/api/projects/${activeModel.id}/boq`)
      .then(r => r.json())
      .then(boqResponse => {
        const boqElementPriceMap = {};
        if (Array.isArray(boqResponse)) {
          boqResponse.forEach(boqItem => {
            if (boqItem.elements && Array.isArray(boqItem.elements)) {
              boqItem.elements.forEach(guid => {
                boqElementPriceMap[guid] = boqItem.unit_price;
              });
            }
          });
        }
        renderRows(boqElementPriceMap);
      })
      .catch(err => {
        console.error("[QTO] Failed to fetch linked BOQ prices:", err);
      });
  }
}

// Click listener to fly to object from QTO table links
qtoTableBody.addEventListener('click', (e) => {
  const link = e.target.closest('.qto-object-link');
  if (link) {
    e.preventDefault();
    const objectId = link.dataset.id;
    if (objectId) {
      qtoModal.style.display = 'none';
      updateStatus(`Zooming to object #${objectId} from QTO.`);
      
      viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
      
      const entity = viewer.scene.objects[objectId];
      if (entity) {
        entity.selected = true;
        entity.highlighted = true;
        handleObjectSelected(entity);
        viewer.cameraFlight.flyTo(entity);
      }
    }
  }
});

// Listener for quantity dropdown changes per row
qtoTableBody.addEventListener('change', (e) => {
  if (e.target.classList.contains('qto-qty-select')) {
    const elemId = e.target.dataset.id;
    const selectedIdx = parseInt(e.target.value, 10);
    elementSelectedQtyIndex[elemId] = selectedIdx;

    const opts = availableQuantities.filter(q => String(q.id) === String(elemId));
    if (opts[selectedIdx]) {
      const activeOpt = opts[selectedIdx];
      const row = e.target.closest('tr');
      if (row) {
        const valSpan = row.querySelector('.qto-val-display');
        const unitSpan = row.querySelector('.qto-unit-display');
        if (valSpan) {
          valSpan.innerText = typeof activeOpt.value === 'number' 
            ? activeOpt.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 }) 
            : activeOpt.value;
        }
        if (unitSpan) {
          unitSpan.innerText = activeOpt.unit || "";
        }
      }
    }
    updateQtoSummaryAndCharts();
  }
});

if (btnOpenQto) {
  btnOpenQto.addEventListener('click', () => {
    const q = qtoSearch ? qtoSearch.value : "";
    renderQtoTable(q);
    if (qtoModal) qtoModal.style.display = 'flex';
    updateStatus("Opened Quantity Take-Off modal.");
  });
}

if (btnCloseQto) {
  btnCloseQto.addEventListener('click', () => {
    if (qtoModal) qtoModal.style.display = 'none';
    updateStatus("Closed Quantity Take-Off modal.");
  });
}

if (qtoModal) {
  qtoModal.addEventListener('click', (e) => {
    if (e.target === qtoModal) {
      qtoModal.style.display = 'none';
      updateStatus("Closed Quantity Take-Off modal.");
    }
  });
}

if (qtoSearch) {
  qtoSearch.addEventListener('input', (e) => {
    renderQtoTable(e.target.value);
  });
}

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

// --- Separate 5D BOQ Modal triggers ---
const boqModal = document.getElementById('boqModal');
const btnCloseBoq = document.getElementById('btnCloseBoq');

if (btnOpenBoqModal) {
  btnOpenBoqModal.addEventListener('click', () => {
    if (!activeModel) {
      alert("Please load a BIM model first.");
      return;
    }
    triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
    boqModal.style.display = 'flex';
    document.querySelector('#boqModal .modal-tab-btn[data-modal-tab="boq-summary-tab"]').click();
  });
}

if (btnCloseBoq) {
  btnCloseBoq.addEventListener('click', () => {
    boqModal.style.display = 'none';
    updateStatus("Closed 5D cost estimate modal.");
  });
}

if (boqModal) {
  boqModal.addEventListener('click', (e) => {
    if (e.target === boqModal) {
      boqModal.style.display = 'none';
      updateStatus("Closed 5D cost estimate modal.");
    }
  });
}


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
  if (!treeContainer) return;
  treeContainer.innerHTML = "";

  if (loadedModels.length === 0 || !viewer || !viewer.metaScene) {
    if (modelTreeSection) modelTreeSection.style.display = "none";
    return;
  }

  if (modelTreeSection) modelTreeSection.style.display = "block";
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
  buildFilterSelectionList();
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

// --- Solar Position Astronomical Calculation (Meeus Algorithms) ---
const PI = Math.PI;
const rad = PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;

function toJulian(date) { return date.valueOf() / 86400000 - 0.5 + J1970; }
function toDays(date)   { return toJulian(date) - J2000; }
function rightAscension(l, b) { return Math.atan2(Math.sin(l) * Math.cos(rad * 23.4397) - Math.tan(b) * Math.sin(rad * 23.4397), Math.cos(l)); }
function declination(l, b)    { return Math.asin(Math.sin(b) * Math.cos(rad * 23.4397) + Math.cos(b) * Math.sin(rad * 23.4397) * Math.sin(l)); }
function azimuth(H, phi, dec)  { return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); }
function altitude(H, phi, dec) { return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)); }
function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + PI;
}

function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return {
    dec: declination(L, 0),
    ra: rightAscension(L, 0)
  };
}

function getSunPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  
  let az = azimuth(H, phi, c.dec);
  // Normalize azimuth so 0 = North, rotating clockwise
  az = (az + PI) % (2 * PI);
  if (az < 0) az += 2 * PI;

  return {
    altitude: altitude(H, phi, c.dec),
    azimuth: az
  };
}

// --- Lights Backup, Restore and Sun Position Lighting logic ---
function backupDefaultLights() {
  if (savedDefaultLights && savedDefaultLights.length > 0) return;
  savedDefaultLights = [];
  Object.values(viewer.scene.lights).forEach((light) => {
    const config = {
      id: light.id,
      isDir: !!light.dir,
      color: [...light.color],
      intensity: light.intensity
    };
    if (config.isDir) {
      config.dir = [...light.dir];
      config.space = light.space || "view";
    }
    savedDefaultLights.push(config);
  });
  console.log("[Solar Position] Backed up default viewer lights:", savedDefaultLights);
}

function restoreDefaultLights() {
  if (!savedDefaultLights || savedDefaultLights.length === 0) return;
  
  clearSunPositionLights();
  restoreSkyBackground();

  savedDefaultLights.forEach((config) => {
    if (config.isDir) {
      new DirLight(viewer.scene, {
        id: config.id,
        dir: config.dir,
        color: config.color,
        intensity: config.intensity,
        space: config.space
      });
    } else {
      new AmbientLight(viewer.scene, {
        id: config.id,
        color: config.color,
        intensity: config.intensity
      });
    }
  });
  console.log("[Solar Position] Restored default lights.");
}

function clearDefaultLights() {
  Object.values(viewer.scene.lights).forEach((light) => {
    if (light.id !== "sun-position-direct" && light.id !== "sun-position-sky" && light.id !== "sun-position-ambient") {
      light.destroy();
    }
  });
}

function clearSunPositionLights() {
  if (activeSunLight) {
    activeSunLight.destroy();
    activeSunLight = null;
  }
  if (activeSkyLight) {
    activeSkyLight.destroy();
    activeSkyLight = null;
  }
  if (activeAmbientLight) {
    activeAmbientLight.destroy();
    activeAmbientLight = null;
  }
  if (sunHelperSphere) {
    sunHelperSphere.destroy();
    sunHelperSphere = null;
  }
  if (sunHelperLine) {
    sunHelperLine.destroy();
    sunHelperLine = null;
  }
  // Safe cleanup for IDs
  ["sun-position-direct", "sun-position-sky", "sun-position-ambient", "sun-helper-sphere", "sun-helper-line"].forEach(id => {
    if (viewer.scene.lights[id]) viewer.scene.lights[id].destroy();
    if (viewer.scene.objects[id]) viewer.scene.objects[id].destroy();
  });
}

function hexToRgbNormalized(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function applySkyBackground(skyColorHex, altitude) {
  const container = document.querySelector('.viewer-container');
  if (!container) return;
  
  if (savedContainerBackground === "") {
    savedContainerBackground = container.style.backgroundImage || container.style.background || "none";
  }

  if (altitude > 0) {
    container.style.background = `linear-gradient(to bottom, ${skyColorHex} 0%, #f0f4f8 100%)`;
  } else {
    container.style.background = `linear-gradient(to bottom, #070b19 0%, #1a2238 100%)`;
  }
}

function restoreSkyBackground() {
  const container = document.querySelector('.viewer-container');
  if (!container || savedContainerBackground === "") return;
  container.style.background = savedContainerBackground;
  savedContainerBackground = "";
}

function updateSunPositionLight() {
  if (!chkEnableSunPosition || !chkEnableSunPosition.checked) {
    return;
  }

  backupDefaultLights();
  clearDefaultLights();

  const dtVal = sunDateTime ? sunDateTime.value : "";
  const date = dtVal ? new Date(dtVal) : new Date();

  const easting = parseFloat(geoEasting.value) || 0;
  const northing = parseFloat(geoNorthing.value) || 0;
  const epsg = geoEPSG.value || '';
  
  let lat = 51.5074;
  let lon = -0.1278;

  if (easting && northing) {
    const latLon = convertToLatLon(easting, northing, epsg);
    lat = latLon.lat;
    lon = latLon.lon;
  }

  const sunPos = getSunPosition(date, lat, lon);
  const altDeg = sunPos.altitude * 180 / PI;
  const azDeg = sunPos.azimuth * 180 / PI;

  console.log(`[Solar Position] Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}, Time: ${date.toLocaleString()}`);
  console.log(`[Solar Position] Altitude: ${altDeg.toFixed(2)}°, Azimuth: ${azDeg.toFixed(2)}°`);

  // Calculate direction vector pointing from the sun to target
  const cosAlt = Math.cos(sunPos.altitude);
  const sunXRel = Math.sin(sunPos.azimuth) * cosAlt;
  const sunYRel = Math.sin(sunPos.altitude);
  const sunZRel = -Math.cos(sunPos.azimuth) * cosAlt;
  const dir = [-sunXRel, -sunYRel, -sunZRel];

  const skyColorHex = sunSkyColor ? sunSkyColor.value : "#d0e0ff";
  const skyColor = hexToRgbNormalized(skyColorHex);
  const groundColor = hexToRgbNormalized(sunGroundColor ? sunGroundColor.value : "#3a3530");

  clearSunPositionLights();

  // 1. Ground Light (Ambient)
  activeAmbientLight = new AmbientLight(viewer.scene, {
    id: "sun-position-ambient",
    color: groundColor,
    intensity: 0.3
  });

  // 2. Sky Light (Dir pointing straight down representing sky ambient dome)
  activeSkyLight = new DirLight(viewer.scene, {
    id: "sun-position-sky",
    dir: [0, -1, 0],
    color: skyColor,
    intensity: 0.4,
    space: "world"
  });

  // 3. Sun Light (Dir pointing from the sun position)
  const sunIntensity = sunPos.altitude > 0 ? 0.95 * Math.sin(sunPos.altitude) : 0.0;
  const sunColor = [1.0, 0.98, 0.93]; // warm direct sunlight

  activeSunLight = new DirLight(viewer.scene, {
    id: "sun-position-direct",
    dir: dir,
    color: sunColor,
    intensity: sunIntensity,
    space: "world"
  });

  // 4. Update Sky Background Gradient to match Three.js example
  applySkyBackground(skyColorHex, sunPos.altitude);

  // 5. Render 3D Sun direction helper
  const aabb = viewer.scene.aabb;
  const diag = math.aabbDiag(aabb) || 100;
  const sunDistance = diag * 0.9;
  const center = [(aabb[0] + aabb[3]) / 2, (aabb[1] + aabb[4]) / 2, (aabb[2] + aabb[5]) / 2];

  const sunX = center[0] + sunDistance * sunXRel;
  const sunY = center[1] + sunDistance * sunYRel;
  const sunZ = center[2] + sunDistance * sunZRel;

  // Only show sun helper if the sun is above the horizon
  const showHelper = sunPos.altitude > 0;
  if (showHelper) {
    const radius = diag * 0.02;

    // Emissive yellow material for the sun sphere
    const sunMaterial = new PhongMaterial(viewer.scene, {
      emissive: [1.0, 0.95, 0.2],
      diffuse: [0, 0, 0],
      specular: [0, 0, 0]
    });

    sunHelperSphere = new Mesh(viewer.scene, {
      id: "sun-helper-sphere",
      geometry: new VBOGeometry(viewer.scene, buildSphereGeometry({
        radius: radius,
        lod: 2
      })),
      material: sunMaterial,
      position: [sunX, sunY, sunZ],
      pickable: false,
      collidable: false
    });

    // Thin line pointing from the sun to the model center
    sunHelperLine = new Mesh(viewer.scene, {
      id: "sun-helper-line",
      geometry: new VBOGeometry(viewer.scene, {
        primitive: "lines",
        positions: [
          sunX, sunY, sunZ,
          center[0], center[1], center[2]
        ],
        indices: [0, 1]
      }),
      material: new PhongMaterial(viewer.scene, {
        emissive: [1.0, 0.85, 0.0],
        diffuse: [0, 0, 0],
        specular: [0, 0, 0],
        lineWidth: 2
      }),
      pickable: false,
      collidable: false
    });
  }

  updateStatus(`Solar Position: Altitude = ${altDeg.toFixed(1)}°, Azimuth = ${azDeg.toFixed(1)}°`);
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
      titleText.includes('ifc diff') ||
      titleText.includes('filter') ||
      titleText.includes('quantity') ||
      titleText.includes('visibility') ||
      titleText.includes('georeferencing') ||
      titleText.includes('options') ||
      titleText.includes('clash') ||
      titleText.includes('cost estimating') ||
      titleText.includes('rate editor') ||
      titleText.includes('overrides');

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

// --- Theme Toggle Setup (#FCF0DA Day Mode / #425B9A Night Mode) ---
function setupThemeToggle() {
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (!btnThemeToggle) return;

  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> Night Mode';
  } else {
    document.body.classList.remove('light-theme');
    btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> Day Mode';
  }

  btnThemeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    if (isLight) {
      localStorage.setItem('theme', 'light');
      btnThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i> Night Mode';
    } else {
      localStorage.setItem('theme', 'dark');
      btnThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i> Day Mode';
    }
  });
}

// --- Left Sidebar (AI Agent) Toggle ---
function setupAiSidebarToggle() {
  const btnToggle = document.getElementById('btnToggleAiSidebar');
  const aiSidebar = document.getElementById('aiAgentSidebar');
  const btnOpen = document.getElementById('btnOpenAiSidebar');

  if (!aiSidebar) return;

  function toggleAiSidebar(show) {
    const isHidden = (show !== undefined) ? !show : !aiSidebar.classList.contains('hidden');
    aiSidebar.classList.toggle('hidden', isHidden);
    window.dispatchEvent(new Event('resize'));
  }

  if (btnToggle) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAiSidebar(false);
    });
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      toggleAiSidebar(aiSidebar.classList.contains('hidden'));
    });
  }
}

// --- Right Sidebar Toggle ---
function setupRightSidebarToggle() {
  const rightSidebar = document.getElementById('rightSidebar');
  const btnOpen = document.getElementById('btnOpenRightSidebar');
  const closeBtns = document.querySelectorAll('.btn-close-right-sidebar');

  if (!rightSidebar) return;

  function toggleRightSidebar(show) {
    const isHidden = (show !== undefined) ? !show : !rightSidebar.classList.contains('hidden');
    rightSidebar.classList.toggle('hidden', isHidden);
    window.dispatchEvent(new Event('resize'));
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      toggleRightSidebar(rightSidebar.classList.contains('hidden'));
    });
  }

  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRightSidebar(false);
    });
  });
}

// --- Stretchable Horizontal Sidebar Resizers ---
function setupSidebarResizers() {
  const leftSidebar = document.getElementById('aiAgentSidebar');
  const leftResizer = document.getElementById('leftSidebarResizer');
  const rightSidebar = document.getElementById('rightSidebar');
  const rightResizer = document.getElementById('rightSidebarResizer');

  // Drag to stretch Left Sidebar
  if (leftSidebar && leftResizer) {
    let isDraggingLeft = false;
    leftResizer.addEventListener('mousedown', (e) => {
      isDraggingLeft = true;
      leftResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingLeft) return;
      const newWidth = Math.max(200, Math.min(window.innerWidth * 0.6, e.clientX));
      leftSidebar.style.width = `${newWidth}px`;
      window.dispatchEvent(new Event('resize'));
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingLeft) {
        isDraggingLeft = false;
        leftResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Drag to stretch Right Sidebar
  if (rightSidebar && rightResizer) {
    let isDraggingRight = false;
    rightResizer.addEventListener('mousedown', (e) => {
      isDraggingRight = true;
      rightResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingRight) return;
      const newWidth = Math.max(220, Math.min(window.innerWidth * 0.6, window.innerWidth - e.clientX));
      rightSidebar.style.width = `${newWidth}px`;
      window.dispatchEvent(new Event('resize'));
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingRight) {
        isDraggingRight = false;
        rightResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Connect dock edge toggle for 4D panel
  const btnOpen4d = document.getElementById('btnOpen4dPanel');
  const ifc4dPanel = document.getElementById('ifc4dPanel');
  if (btnOpen4d && ifc4dPanel) {
    btnOpen4d.addEventListener('click', () => {
      ifc4dPanel.classList.remove('hidden');
      ifc4dPanel.classList.remove('collapsed');
      window.dispatchEvent(new Event('resize'));
    });
  }
}

// --- Ribbon Bar Collapse, Hide & Stretch Controls ---
function setupRibbonControls() {
  const ribbonBar = document.querySelector('.ribbon-bar');
  const ribbonContent = document.querySelector('.ribbon-content');
  const btnToggleCollapse = document.getElementById('btnToggleRibbonCollapse');
  const btnHide = document.getElementById('btnHideRibbon');
  const btnOpen = document.getElementById('btnOpenRibbon');
  const ribbonResizer = document.getElementById('ribbonResizer');
  const ribbonTabs = document.querySelectorAll('.ribbon-tab');

  if (!ribbonBar) return;

  function toggleRibbonCollapse() {
    const isCollapsed = ribbonBar.classList.toggle('collapsed');
    if (btnToggleCollapse) {
      btnToggleCollapse.innerHTML = isCollapsed
        ? '<i class="fa-solid fa-chevron-down"></i>'
        : '<i class="fa-solid fa-chevron-up"></i>';
      btnToggleCollapse.title = isCollapsed ? 'Expand Ribbon Toolbar' : 'Collapse Ribbon Toolbar';
    }
    window.dispatchEvent(new Event('resize'));
  }

  if (btnToggleCollapse) {
    btnToggleCollapse.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRibbonCollapse();
    });
  }

  // Double click tab to collapse/expand (Office / Revit standard)
  ribbonTabs.forEach(tab => {
    tab.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleRibbonCollapse();
    });
  });

  if (btnHide) {
    btnHide.addEventListener('click', (e) => {
      e.stopPropagation();
      ribbonBar.classList.add('hidden');
      if (btnOpen) btnOpen.classList.add('visible');
      window.dispatchEvent(new Event('resize'));
    });
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      ribbonBar.classList.remove('hidden');
      btnOpen.classList.remove('visible');
      window.dispatchEvent(new Event('resize'));
    });
  }

  // Stretch / resize ribbon height
  if (ribbonResizer && ribbonContent) {
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    ribbonResizer.addEventListener('mousedown', (e) => {
      isDragging = true;
      startY = e.clientY;
      startHeight = ribbonContent.offsetHeight;
      ribbonResizer.classList.add('dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dy = e.clientY - startY;
      const newHeight = Math.max(50, Math.min(380, startHeight + dy));
      ribbonContent.style.height = `${newHeight}px`;
      ribbonContent.style.minHeight = `${newHeight}px`;
      window.dispatchEvent(new Event('resize'));
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        ribbonResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.dispatchEvent(new Event('resize'));
      }
    });
  }
}

// --- Right Sidebar Revit-Style Bottom Tabs Setup ---
function setupRightSidebarTabs() {
  const tabBtns = document.querySelectorAll('.right-tab-btn');
  const tabPanes = document.querySelectorAll('.right-tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.rightTab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });

      btn.classList.add('active');
      const pane = document.getElementById(target);
      if (pane) {
        pane.classList.add('active');
        pane.style.display = 'flex';
        if (target === 'right-tab-filter') {
          buildFilterSelectionList();
        }
      }
    });
  });
}

// --- Filter Selection Auto IFC Class & File Model Harvester & Highlight ---
let currentFilterSubTab = 'class';

function initFilterSubTabs() {
  const container = document.getElementById('filterSubTabs');
  if (!container) return;
  const btns = container.querySelectorAll('.filter-subtab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilterSubTab = btn.dataset.subtab || 'class';

      const searchInput = document.getElementById('filterClassSearch');
      if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = currentFilterSubTab === 'class'
          ? 'Search IFC Class (e.g. IfcWall)...'
          : 'Search File Model (e.g. model.ifc)...';
      }
      buildFilterSelectionList();
    });
  });

  const filterClassSearch = document.getElementById('filterClassSearch');
  if (filterClassSearch) {
    filterClassSearch.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const listContainer = document.getElementById('filterSelectionList');
      if (listContainer) filterListByQuery(listContainer, q);
    });
  }
}

function filterListByQuery(container, query) {
  const items = container.querySelectorAll('.ifc-class-item');
  items.forEach(item => {
    const text = (item.dataset.filterKey || item.dataset.ifcType || '').toLowerCase();
    item.style.display = text.includes(query) ? 'flex' : 'none';
  });
}

function buildFilterSelectionList() {
  const container = document.getElementById('filterSelectionList');
  if (!container) return;
  container.innerHTML = "";

  if (loadedModels.length === 0 || !viewer || !viewer.metaScene) {
    container.innerHTML = `<div class="no-selection-prompt"><i class="fa-solid fa-filter"></i><p>No model loaded to filter.</p></div>`;
    return;
  }

  if (currentFilterSubTab === 'model') {
    buildFilterModelList(container);
  } else {
    buildFilterClassList(container);
  }

  const searchInput = document.getElementById('filterClassSearch');
  if (searchInput && searchInput.value) {
    filterListByQuery(container, searchInput.value.toLowerCase().trim());
  }
}

function buildFilterClassList(container) {
  const classCounts = {};
  const metaObjs = viewer.metaScene.metaObjects || {};

  Object.values(metaObjs).forEach(meta => {
    if (meta && meta.type) {
      classCounts[meta.type] = (classCounts[meta.type] || 0) + 1;
    }
  });

  const types = Object.keys(classCounts).sort();

  if (types.length === 0) {
    container.innerHTML = `<div class="no-selection-prompt"><i class="fa-solid fa-info-circle"></i><p>No IFC classes found in model metadata.</p></div>`;
    return;
  }

  const listUl = document.createElement('div');
  listUl.className = 'ifc-class-list';

  types.forEach(type => {
    const item = document.createElement('div');
    item.className = 'ifc-class-item';
    item.dataset.ifcType = type;
    item.dataset.filterKey = type;
    item.innerHTML = `
      <div class="ifc-class-info">
        <i class="fa-solid fa-cube class-icon"></i>
        <span class="class-name">${type}</span>
      </div>
      <div class="ifc-class-right">
        <span class="class-count">${classCounts[type]}</span>
        <button class="class-vis-btn" title="Toggle visibility of ${type}">
          <i class="fa-solid fa-eye"></i>
        </button>
      </div>
    `;

    const visBtn = item.querySelector('.class-vis-btn');
    const visIcon = visBtn.querySelector('i');

    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ids = viewer.metaScene.getObjectIDsByType(type);
      if (!ids || ids.length === 0) return;

      const sampleObj = viewer.scene.objects[ids[0]];
      const currentlyVisible = sampleObj ? sampleObj.visible : true;
      const nextVisible = !currentlyVisible;

      viewer.scene.setObjectsVisible(ids, nextVisible);

      if (nextVisible) {
        visIcon.className = 'fa-solid fa-eye';
        visBtn.classList.remove('hidden-state');
        visBtn.title = `Hide ${type}`;
      } else {
        visIcon.className = 'fa-solid fa-eye-slash';
        visBtn.classList.add('hidden-state');
        visBtn.title = `Show ${type}`;
      }

      updateStatus(`${nextVisible ? 'Shown' : 'Hidden'} ${ids.length} objects of class ${type}`);
    });

    item.addEventListener('click', () => {
      container.querySelectorAll('.ifc-class-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');

      const ids = viewer.metaScene.getObjectIDsByType(type);
      if (!ids || ids.length === 0) return;

      viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);

      viewer.scene.setObjectsSelected(ids, true);
      viewer.scene.setObjectsHighlighted(ids, true);

      const aabb = viewer.scene.getAABB(ids);
      if (aabb) {
        viewer.cameraFlight.flyTo(aabb);
      }

      updateStatus(`Selected and highlighted ${ids.length} objects of class ${type}`);
    });

    listUl.appendChild(item);
  });

  container.appendChild(listUl);
}

function buildFilterModelList(container) {
  if (loadedModels.length === 0) {
    container.innerHTML = `<div class="no-selection-prompt"><i class="fa-solid fa-info-circle"></i><p>No file models loaded.</p></div>`;
    return;
  }

  const listUl = document.createElement('div');
  listUl.className = 'ifc-class-list';

  loadedModels.forEach(m => {
    const modelId = m.id;
    const fileName = m.fileName || `Model (${modelId})`;
    const modelObj = m.model;
    const metaModel = m.metaModel;

    let ids = [];
    if (modelObj && modelObj.objectIds && modelObj.objectIds.length > 0) {
      ids = modelObj.objectIds;
    } else if (metaModel && metaModel.metaObjects) {
      ids = Object.keys(metaModel.metaObjects);
    }

    const count = ids.length;

    const item = document.createElement('div');
    item.className = 'ifc-class-item';
    item.dataset.filterKey = fileName;
    item.innerHTML = `
      <div class="ifc-class-info">
        <i class="fa-solid fa-file-contract class-icon"></i>
        <span class="class-name">${fileName}</span>
      </div>
      <div class="ifc-class-right">
        <span class="class-count">${count}</span>
        <button class="class-vis-btn" title="Toggle visibility of ${fileName}">
          <i class="fa-solid fa-eye"></i>
        </button>
      </div>
    `;

    const visBtn = item.querySelector('.class-vis-btn');
    const visIcon = visBtn.querySelector('i');

    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let currentlyVisible = true;
      if (modelObj && typeof modelObj.visible !== 'undefined') {
        currentlyVisible = modelObj.visible;
      } else if (ids.length > 0 && viewer.scene.objects[ids[0]]) {
        currentlyVisible = viewer.scene.objects[ids[0]].visible;
      }

      const nextVisible = !currentlyVisible;
      if (modelObj && typeof modelObj.visible !== 'undefined') {
        modelObj.visible = nextVisible;
      }
      if (ids.length > 0) {
        viewer.scene.setObjectsVisible(ids, nextVisible);
      }

      if (nextVisible) {
        visIcon.className = 'fa-solid fa-eye';
        visBtn.classList.remove('hidden-state');
        visBtn.title = `Hide ${fileName}`;
      } else {
        visIcon.className = 'fa-solid fa-eye-slash';
        visBtn.classList.add('hidden-state');
        visBtn.title = `Show ${fileName}`;
      }

      updateStatus(`${nextVisible ? 'Shown' : 'Hidden'} model ${fileName}`);
    });

    item.addEventListener('click', () => {
      container.querySelectorAll('.ifc-class-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');

      if (ids.length === 0) return;

      viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);

      viewer.scene.setObjectsSelected(ids, true);
      viewer.scene.setObjectsHighlighted(ids, true);

      let aabb = modelObj && modelObj.aabb ? modelObj.aabb : viewer.scene.getAABB(ids);
      if (aabb) {
        viewer.cameraFlight.flyTo(aabb);
      }

      updateStatus(`Selected and highlighted ${count} objects in model ${fileName}`);
    });

    listUl.appendChild(item);
  });

  container.appendChild(listUl);
}

// --- Initialize App ---
function startApp() {
  try { initCollapsiblePanels(); } catch (e) { console.error("Error initCollapsiblePanels:", e); }
  try { initViewer(); } catch (e) { console.error("Error initViewer:", e); }
  try { setupIfcOpenShellTools(); } catch (e) { console.error("Error setupIfcOpenShellTools:", e); }
  try { setupThemeToggle(); } catch (e) { console.error("Error setupThemeToggle:", e); }
  try { setupAiSidebarToggle(); } catch (e) { console.error("Error setupAiSidebarToggle:", e); }
  try { setupRightSidebarToggle(); } catch (e) { console.error("Error setupRightSidebarToggle:", e); }
  try { setupSidebarResizers(); } catch (e) { console.error("Error setupSidebarResizers:", e); }
  try { setupRibbonControls(); } catch (e) { console.error("Error setupRibbonControls:", e); }
  try { initFilterSubTabs(); } catch (e) { console.error("Error initFilterSubTabs:", e); }
  try { setupRightSidebarTabs(); } catch (e) { console.error("Error setupRightSidebarTabs:", e); }
  try { setupMcpPolling(); } catch (e) { console.error("Error setupMcpPolling:", e); }

  // Register AI agent control APIs
  window.bimBamApi = {
    getAllObjects: () => {
      if (!viewer || !viewer.metaScene) return { success: false, error: "No metaScene available." };
      const objs = [];
      Object.entries(viewer.metaScene.metaObjects).forEach(([id, meta]) => {
        objs.push({ id, name: meta.name || '', type: meta.type || '' });
      });
      return { success: true, objects: objs };
    },
    getObjectMetadata: (id) => {
      const entity = viewer.scene.objects[id];
      const modelId = entity && entity.model ? entity.model.id : null;
      const meta = getElementMetadata(id, modelId);
      return { success: !!meta, metadata: meta };
    },
    selectObjects: (ids) => {
      viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
      if (ids && ids.length > 0) {
        viewer.scene.setObjectsSelected(ids, true);
        updateSelectionUI();
      } else {
        handleObjectDeselected();
      }
      return { success: true, message: `Selected ${ids ? ids.length : 0} objects.` };
    },
    hideObjects: (ids) => {
      if (ids && ids.length > 0) {
        viewer.scene.setObjectsVisible(ids, false);
        return { success: true, message: `Hid ${ids.length} objects.` };
      }
      return { success: false, error: "No IDs provided." };
    },
    showAllObjects: () => {
      const allObjectIds = viewer.scene.objectIds;
      viewer.scene.setObjectsVisible(allObjectIds, true);
      return { success: true, message: "Showed all objects." };
    },
    isolateObjects: (ids) => {
      const allObjectIds = viewer.scene.objectIds;
      viewer.scene.setObjectsVisible(allObjectIds, false);
      if (ids && ids.length > 0) {
        viewer.scene.setObjectsVisible(ids, true);
      }
      return { success: true, message: `Isolated ${ids ? ids.length : 0} objects.` };
    },
    highlightObjects: (ids, highlight) => {
      if (ids && ids.length > 0) {
        viewer.scene.setObjectsHighlighted(ids, !!highlight);
        return { success: true, message: `Set highlight ${highlight} for ${ids.length} objects.` };
      }
      return { success: false, error: "No IDs provided." };
    },
    xrayObjects: (ids, xray) => {
      if (ids && ids.length > 0) {
        viewer.scene.setObjectsXRayed(ids, !!xray);
        return { success: true, message: `Set X-Ray ${xray} for ${ids.length} objects.` };
      }
      return { success: false, error: "No IDs provided." };
    },
    flyToObjects: (ids) => {
      if (ids && ids.length > 0) {
        const aabb = viewer.scene.getAABB(ids);
        viewer.cameraFlight.flyTo(aabb);
        return { success: true, message: "Flew to bounding box of specified objects." };
      } else {
        viewer.cameraFlight.flyTo(activeModel || viewer.scene);
        return { success: true, message: "Flew to fit entire view." };
      }
    },
    applyPropertyFilter: (propName, operator, valQuery) => {
      valQuery = String(valQuery).trim().toLowerCase();
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
        if (isMatch) matchedIds.push(id);
      });
      
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
      if (matchedIds.length > 0) {
        viewer.scene.setObjectsXRayed(allObjectIds, true);
        viewer.scene.setObjectsXRayed(matchedIds, false);
        viewer.scene.setObjectsHighlighted(matchedIds, true);
        if (filterResultCount) filterResultCount.innerText = `Found ${matchedIds.length} matching objects`;
        return { success: true, count: matchedIds.length, matchedIds };
      } else {
        viewer.scene.setObjectsXRayed(allObjectIds, true);
        if (filterResultCount) filterResultCount.innerText = "No matching objects found";
        return { success: true, count: 0, matchedIds: [] };
      }
    },
    resetPropertyFilter: () => {
      const allObjectIds = viewer.scene.objectIds;
      viewer.scene.setObjectsXRayed(allObjectIds, false);
      viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
      if (filterResultCount) filterResultCount.innerText = "";
      return { success: true, message: "Reset property filter." };
    },
    searchObjectsByText: (query) => {
      const matchedIds = filterObjects(query);
      const queryLower = query.toLowerCase().trim();
      if (queryLower === "") {
        return { success: true, count: matchedIds.length, message: "Cleared search query." };
      }
      return { success: true, count: matchedIds.length, matchedIds };
    },
    addSectionPlane: (type, pos, dir) => {
      const id = `plane-ai-${Date.now()}`;
      let plane;
      if (type === 'center') {
        plane = sectionPlanes.createSectionPlane({
          id: id,
          pos: pos || viewer.scene.center,
          dir: dir || [0, -1, 0]
        });
      } else {
        if (!pos || !dir) {
          return { success: false, error: "Position and normal direction are required for surface cuts." };
        }
        plane = sectionPlanes.createSectionPlane({
          id,
          pos,
          dir
        });
      }
      if (chkShowGizmos.checked) {
        sectionPlanes.showControl(plane.id);
      }
      return { success: true, planeId: plane.id, message: `Added section plane of type ${type}.` };
    },
    clearSectionPlanes: () => {
      sectionPlanes.clear();
      return { success: true, message: "Cleared all section planes." };
    },
    setMeasurementMode: (mode) => {
      const cleanMode = mode === 'none' ? null : mode;
      setMeasurementMode(cleanMode);
      return { success: true, message: `Set measurement mode to ${mode}.` };
    },
    clearAllMeasurements: () => {
      clearAllMeasurements();
      return { success: true, message: "Cleared all measurements." };
    },
    runIfcDiff: async (oldModelId, newModelId) => {
      const oldModel = loadedModels.find(m => m.id === oldModelId);
      const newModel = loadedModels.find(m => m.id === newModelId);
      if (!oldModel || !newModel) {
        return { error: "Models not found in current session." };
      }
      const formData = new FormData();
      formData.append('oldFile', oldModel.file);
      formData.append('newFile', newModel.file);
      const response = await fetch('/api/python/ifcdiff', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Diff failed on backend');
      }
      const result = await response.json();
      return { success: true, result };
    },
    runClashDetection: async (modelAId, modelBId, tolerance = 0.0) => {
      const modelA = loadedModels.find(m => m.id === modelAId);
      const modelB = loadedModels.find(m => m.id === modelBId);
      if (!modelA) return { error: "Model A not found." };
      const formData = new FormData();
      formData.append('fileA', modelA.file);
      if (modelB) formData.append('fileB', modelB.file);
      formData.append('tolerance', tolerance);
      const response = await fetch('/api/python/ifcclash', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Clash failed on backend');
      }
      const result = await response.json();
      return { success: true, result };
    },
    updateObjectParameter: (objectId, parameterName, newValue) => {
      const entity = viewer.scene.objects[objectId];
      const modelId = entity && entity.model ? entity.model.id : null;
      let updated = false;

      // 1. Try Revit metadata map first
      const revitMeta = revitMetadataMap[modelId];
      if (revitMeta && revitMeta.Elements) {
        const element = revitMeta.Elements.find(e => String(e.Id) === String(objectId));
        if (element && element.ParameterGroups) {
          element.ParameterGroups.forEach((gIdx) => {
            const group = revitMeta.ParameterGroups[gIdx];
            if (group && group.Parameters) {
              group.Parameters.forEach((pIdx) => {
                const param = revitMeta.Parameters[pIdx];
                if (param && param.Name === parameterName) {
                  param.Value = newValue;
                  updated = true;
                }
              });
            }
          });
        }
      }

      // 2. Try standard IFC metadata next
      if (!updated && viewer.metaScene) {
        const metaObj = viewer.metaScene.metaObjects[objectId];
        if (metaObj && metaObj.propertySets) {
          metaObj.propertySets.forEach((pset) => {
            if (pset.properties) {
              pset.properties.forEach((prop) => {
                if (prop.name === parameterName) {
                  prop.value = newValue;
                  updated = true;
                }
              });
            }
          });
        }
      }

      if (updated) {
        recalculateAvailableQuantities();
        if (String(activeElementId) === String(objectId)) {
          updateSelectionUI();
        }
        updateStatus(`Updated parameter "${parameterName}" of object ${objectId} to "${newValue}"`);
        return { success: true, message: `Successfully updated parameter "${parameterName}" to "${newValue}".` };
      }

      return { success: false, error: `Parameter "${parameterName}" not found on object ${objectId}.` };
    },

    // Color & Styling
    colorizeObjects: (ids, hexColor) => {
      if (!ids || ids.length === 0) return { success: false, error: "No object IDs provided." };
      const hex = (hexColor || "#38bdf8").replace('#', '');
      const num = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
      const rgb = [(num >> 16) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
      viewer.scene.setObjectsColorized(ids, rgb);
      return { success: true, message: `Colorized ${ids.length} objects with ${hexColor}.` };
    },
    resetObjectColors: (ids) => {
      const targetIds = ids && ids.length > 0 ? ids : viewer.scene.objectIds;
      viewer.scene.setObjectsColorized(targetIds, false);
      return { success: true, message: "Reset object colors to default." };
    },
    setViewerTheme: (theme) => {
      const mode = (theme === 'light') ? 'light' : 'dark';
      document.body.dataset.theme = mode;
      localStorage.setItem('theme', mode);
      return { success: true, theme: mode, message: `Set UI theme to ${mode}.` };
    },

    // Camera Views & Navigation
    setCameraView: (view) => {
      const presets = {
        top: { eye: [0, 100, 0], look: [0, 0, 0], up: [0, 0, -1] },
        bottom: { eye: [0, -100, 0], look: [0, 0, 0], up: [0, 0, 1] },
        front: { eye: [0, 0, 100], look: [0, 0, 0], up: [0, 1, 0] },
        back: { eye: [0, 0, -100], look: [0, 0, 0], up: [0, 1, 0] },
        left: { eye: [-100, 0, 0], look: [0, 0, 0], up: [0, 1, 0] },
        right: { eye: [100, 0, 0], look: [0, 0, 0], up: [0, 1, 0] },
        isometric: { eye: [100, 100, 100], look: [0, 0, 0], up: [0, 1, 0] }
      };
      const key = (view || 'isometric').toLowerCase();
      const target = presets[key] || presets.isometric;
      viewer.cameraFlight.flyTo(target);
      return { success: true, view: key, message: `Navigated camera to ${key} view.` };
    },
    setCameraProjection: (projection) => {
      const mode = (projection === 'ortho' || projection === 'orthographic') ? 'ortho' : 'perspective';
      viewer.camera.projection = mode;
      return { success: true, projection: mode, message: `Set camera projection to ${mode}.` };
    },
    getCameraState: () => {
      return {
        success: true,
        eye: [...viewer.camera.eye],
        look: [...viewer.camera.look],
        up: [...viewer.camera.up],
        projection: viewer.camera.projection
      };
    },
    setCameraState: (eye, look, up) => {
      if (!eye || !look) return { success: false, error: "Eye and Look coordinates required." };
      viewer.cameraFlight.flyTo({ eye, look, up: up || [0, 1, 0] });
      return { success: true, message: "Camera moved to custom state." };
    },

    // Solar Position
    setSunPosition: (dateTime, skyColor, groundColor, enabled = true) => {
      if (chkEnableSunPosition) chkEnableSunPosition.checked = !!enabled;
      if (sunDateTime && dateTime) sunDateTime.value = dateTime;
      if (sunSkyColor && skyColor) sunSkyColor.value = skyColor;
      if (sunGroundColor && groundColor) sunGroundColor.value = groundColor;
      if (enabled) {
        if (sunParamsContainer) sunParamsContainer.style.display = 'flex';
        updateSunPositionLight();
      } else {
        if (sunParamsContainer) sunParamsContainer.style.display = 'none';
        restoreDefaultLights();
      }
      return { success: true, enabled, message: `Updated solar position (enabled: ${enabled}).` };
    },

    // QTO & 5D BOQ
    getQtoSummary: () => {
      if (!elementsList || elementsList.length === 0) {
        return { success: true, message: "No QTO items loaded.", count: 0, items: [] };
      }
      return {
        success: true,
        count: elementsList.length,
        items: elementsList.map(e => ({
          id: e.id,
          globalId: e.globalId,
          name: e.name,
          category: e.category || e.ifcType,
          volume: e.volume,
          area: e.area,
          length: e.length,
          count: e.count
        }))
      };
    },
    getElementQto: (objectId) => {
      const found = elementsList ? elementsList.find(e => String(e.id) === String(objectId) || String(e.globalId) === String(objectId)) : null;
      if (found) return { success: true, qto: found };
      return { success: false, error: `No QTO record found for object ${objectId}.` };
    },
    getBoqItems: async () => {
      try {
        const res = await fetch('/api/boq');
        if (res.ok) {
          const items = await res.json();
          return { success: true, items };
        }
      } catch (e) {}
      return { success: false, error: "Could not fetch BOQ items." };
    },
    calculateProjectCost: async () => {
      try {
        const res = await fetch('/api/boq');
        if (res.ok) {
          const items = await res.json();
          const total = items.reduce((acc, it) => acc + (Number(it.total_price) || 0), 0);
          return { success: true, totalCost: total, currency: "IDR", itemsCount: items.length };
        }
      } catch (e) {}
      return { success: false, error: "Could not calculate project cost." };
    },
    searchAhspCatalog: async (query) => {
      try {
        const res = await fetch(`/api/ahsp/search?q=${encodeURIComponent(query || '')}`);
        if (res.ok) {
          const items = await res.json();
          return { success: true, count: items.length, items };
        }
      } catch (e) {}
      return { success: false, error: "AHSP search failed." };
    },

    // Models
    getLoadedModels: () => {
      return {
        success: true,
        models: (loadedModels || []).map(m => ({ id: m.id, name: m.name, size: m.file ? m.file.size : 0 }))
      };
    }
  };

  // Case-insensitive / snake_case proxy so FastMCP tool calls route seamlessly
  window.bimBamApi = new Proxy(window.bimBamApi, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string') {
        const camel = prop.replace(/_([a-z0-9])/g, (_, g) => g.toUpperCase());
        if (camel in target) return target[camel];
      }
      return undefined;
    }
  });

  // Set default datetime to 12:00 PM (noon) of the current day in local time
  const todayNoon = new Date();
  todayNoon.setHours(12, 0, 0, 0);
  const tzoffset = todayNoon.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(todayNoon.getTime() - tzoffset)).toISOString().slice(0, 16);
  if (sunDateTime) sunDateTime.value = localISOTime;

  // Bind sun position event listeners
  if (chkEnableSunPosition) {
    chkEnableSunPosition.addEventListener('change', () => {
      if (chkEnableSunPosition.checked) {
        if (sunParamsContainer) sunParamsContainer.style.display = 'flex';
        updateSunPositionLight();
      } else {
        if (sunParamsContainer) sunParamsContainer.style.display = 'none';
        restoreDefaultLights();
        updateStatus("Solar Position light disabled. Default lights restored.");
      }
    });
  }

  if (sunDateTime) sunDateTime.addEventListener('input', updateSunPositionLight);
  if (sunSkyColor) sunSkyColor.addEventListener('input', updateSunPositionLight);
  if (sunGroundColor) sunGroundColor.addEventListener('input', updateSunPositionLight);

  // Trigger update if coordinates are changed manually
  if (btnEditGeoreference) {
    btnEditGeoreference.addEventListener('click', () => {
      if (!isEditingGeoreference && chkEnableSunPosition && chkEnableSunPosition.checked) {
        updateSunPositionLight();
      }
    });
  }

  if (geoModelSelect) {
    geoModelSelect.addEventListener('change', () => {
      if (chkEnableSunPosition && chkEnableSunPosition.checked) {
        updateSunPositionLight();
      }
    });
  }

  // Initialize the AI Chatbox Controller
  setupAiAgent();

  updateStatus("BIM Viewer initialized. Ready for user files.");
}

// --- IfcOpenShell Python Tools Integration ---
function setupIfcOpenShellTools() {
  console.log("[IfcOpenShell Tools] Initializing frontend tools...");

  // 1. Ribbon & Sidebar Tab switching logic
  const tabButtons = document.querySelectorAll('.ribbon-tab, .sidebar-tab');
  const tabPanes = document.querySelectorAll('.ribbon-pane, .tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });

      btn.classList.add('active');
      const activePane = document.getElementById(targetTab);
      if (activePane) {
        activePane.classList.add('active');
        activePane.style.display = 'flex';
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

  // 8. JSON Backup & Manual Classification Tools
  setupBackupAndOverrideTools();
}

// --- RVT to IFC Converter Tool (DDC cad2data) ---
function setupRvtConverter() {
  const btnConvertRvt = document.getElementById('btnConvertRvt');
  const rvtFileInput = document.getElementById('rvtFileInput');
  const ddcExePathInput = document.getElementById('ddcExePath');
  const btnLoadDdcExe = document.getElementById('btnLoadDdcExe');
  const ddcStatusDot = document.getElementById('ddcStatusDot');
  const ddcExeStatusText = document.getElementById('ddcExeStatusText');
  const ddcExeStatus = document.getElementById('ddcExeStatus');
  const ddcIfcVersion = document.getElementById('ddcIfcVersion');

  if (!btnConvertRvt) return;

  // Helper to test and apply DDC converter path
  async function checkAndApplyDdcPath(targetPath, silent = false) {
    if (!targetPath) {
      if (!silent) alert("Please enter the folder or path to RVT2IFCconverter.exe");
      return false;
    }
    try {
      const res = await fetch('/api/check-ddc-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid) {
        localStorage.setItem('ddc_converter_path', targetPath);
        if (ddcStatusDot) ddcStatusDot.style.color = '#22c55e';
        if (ddcExeStatusText) ddcExeStatusText.innerText = data.exeName || 'Loaded';
        if (ddcExeStatus) ddcExeStatus.title = `Converter: ${data.exePath}`;
        if (!silent) {
          updateStatus(`DDC Converter loaded: ${data.exePath}`);
        }
        return true;
      } else {
        if (ddcStatusDot) ddcStatusDot.style.color = '#ef4444';
        if (ddcExeStatusText) ddcExeStatusText.innerText = 'Not found';
        if (ddcExeStatus) ddcExeStatus.title = data.error || 'Executable not found';
        if (!silent) {
          alert(`DDC Converter not found:\n${data.error || 'Please specify the correct folder or .exe path.'}`);
        }
        return false;
      }
    } catch (err) {
      if (ddcStatusDot) ddcStatusDot.style.color = '#ef4444';
      if (ddcExeStatusText) ddcExeStatusText.innerText = 'Error';
      if (!silent) alert(`Failed to check converter path: ${err.message}`);
      return false;
    }
  }

  // Restore saved converter path from localStorage
  const savedDdcPath = localStorage.getItem('ddc_converter_path');
  if (savedDdcPath && ddcExePathInput) {
    ddcExePathInput.value = savedDdcPath;
    checkAndApplyDdcPath(savedDdcPath, true);
  }

  if (btnLoadDdcExe && ddcExePathInput) {
    btnLoadDdcExe.addEventListener('click', () => {
      checkAndApplyDdcPath(ddcExePathInput.value.trim(), false);
    });
    ddcExePathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        checkAndApplyDdcPath(ddcExePathInput.value.trim(), false);
      }
    });
  }

  btnConvertRvt.addEventListener('click', async () => {
    const file = rvtFileInput.files[0];
    if (!file) {
      alert("Please select a Revit (.rvt) file to convert.");
      return;
    }

    const converterPath = ddcExePathInput ? ddcExePathInput.value.trim() : '';
    if (!converterPath) {
      alert("Please specify the local directory or .exe path of the DDC converter and click Load.");
      if (ddcExePathInput) ddcExePathInput.focus();
      return;
    }

    const ifcVersion = ddcIfcVersion ? ddcIfcVersion.value : '4x3';

    showLoader("Converting RVT to IFC", "Running DDC RVT2IFC converter pipeline...", 20);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('converterPath', converterPath);
    formData.append('ifcVersion', ifcVersion);

    try {
      const response = await fetch('/api/convert-rvt', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.details ? `${errData.error}: ${errData.details}` : (errData.error || `HTTP error ${response.status}`);
        throw new Error(msg);
      }

      updateLoaderProgress(65, "Receiving converted IFC file...");
      const ifcBlob = await response.blob();
      const ifcFilename = file.name.replace(/\.[^/.]+$/, "") + ".ifc";
      const ifcFile = new File([ifcBlob], ifcFilename, { type: 'application/x-step' });

      updateLoaderProgress(80, "Parsing IFC geometry and BIM metadata...");
      await loadModel(ifcFile, false);

      updateStatus(`Revit file converted to IFC (${ifcVersion}) and loaded successfully.`);
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
    const lowercaseSeen = new Set();
    if (!viewer || !viewer.metaScene) return [];
    const metaObjects = viewer.metaScene.metaObjects;
    for (const metaObj of Object.values(metaObjects)) {
      if (modelId && metaObj.metaModel && metaObj.metaModel.id !== modelId) continue;
      if (metaObj.type && metaObj.type.trim()) {
        const original = metaObj.type.trim();
        const lower = original.toLowerCase();
        if (!lowercaseSeen.has(lower)) {
          lowercaseSeen.add(lower);
          classes.add(original);
        }
      }
    }
    return Array.from(classes).sort((a, b) => a.localeCompare(b));
  }

  // Populate a <select> dropdown with property names
  function populateParamSelect(selectEl) {
    if (!selectEl) return;
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
    if (!csvModelSelect) return;
    const modelId = csvModelSelect.value || null;
    allPropertyNames = gatherPropertyNames(modelId);

    // Populate first select
    if (csvParamSelect0) populateParamSelect(csvParamSelect0);

    // Populate all dynamic selects
    if (csvParamRows) {
      csvParamRows.querySelectorAll('.csv-param-select').forEach(sel => {
        populateParamSelect(sel);
      });
    }

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
    if (!csvPreviewCount) return;
    if (!viewer || !viewer.metaScene) {
      csvPreviewCount.style.display = 'none';
      return;
    }
    const modelId = csvModelSelect ? (csvModelSelect.value || null) : null;
    const classFilter = csvIfcClassFilter.value || null;
    let count = 0;
    const metaObjects = viewer.metaScene.metaObjects;
    for (const metaObj of Object.values(metaObjects)) {
      if (modelId && metaObj.metaModel && metaObj.metaModel.id !== modelId) continue;
      if (classFilter && (!metaObj.type || metaObj.type.toLowerCase() !== classFilter.toLowerCase())) continue;
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
  if (csvBtnAdd0) {
    csvBtnAdd0.addEventListener('click', () => {
      addParamRow(csvParamSelect0 ? csvParamSelect0.value : '');
    });
  }

  // Refresh on model select change
  if (csvModelSelect) csvModelSelect.addEventListener('change', refreshCsvUi);
  if (csvIfcClassFilter) csvIfcClassFilter.addEventListener('change', updatePreviewCount);

  // Listen for model load events to refresh CSV property/class dropdowns
  window.addEventListener('ifcModelsUpdated', () => {
    refreshCsvUi();
  });

  // CSV Generation and Download
  if (btnExportIfcCsv) {
    btnExportIfcCsv.addEventListener('click', () => {
      if (!viewer || !viewer.metaScene) {
        alert('No model loaded. Please load an IFC model first.');
        return;
      }
      exportModelToCsv();
    });
  }

  function exportModelToCsv() {
    if (!csvModelSelect || !csvIfcClassFilter || !csvColName || !csvColType || !csvColId) return;

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
      if (classFilter && (!metaObj.type || metaObj.type.toLowerCase() !== classFilter.toLowerCase())) continue;
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
  }
} // end setupIfcCsvTool

// --- JSON Backup & Manual Classification Overrides Tool ---
function setupBackupAndOverrideTools() {
  const exportTableToCsv = (tableId, filename) => {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = [];
    const headerCells = table.querySelectorAll('thead th');
    const headers = [];
    headerCells.forEach(th => {
      if (th.textContent.trim().toLowerCase() !== 'action') {
        headers.push(th.textContent.trim());
      }
    });
    rows.push(headers);

    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(tr => {
      const row = [];
      const cells = tr.querySelectorAll('td');
      if (cells.length === 0) return;
      for (let i = 0; i < cells.length; i++) {
        const th = headerCells[i];
        if (th && th.textContent.trim().toLowerCase() === 'action') continue;
        let text = cells[i].textContent.trim();
        text = text.replace(/\s+/g, ' ');
        row.push(text);
      }
      rows.push(row);
    });

    const escapeCell = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = rows.map(r => r.map(escapeCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const btnExportRulesJson = document.getElementById('btnExportRulesJson');
  if (btnExportRulesJson) {
    btnExportRulesJson.addEventListener('click', () => {
      fetch('/api/rules/export')
        .then(r => r.json())
        .then(rules => {
          const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `rules_backup_${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          updateStatus("Exported classification rules mapping JSON.");
        });
    });
  }

  const btnExportRulesCsv = document.getElementById('btnExportRulesCsv');
  if (btnExportRulesCsv) {
    btnExportRulesCsv.addEventListener('click', () => {
      exportTableToCsv('rulesTable', `rules_backup_${Date.now()}.csv`);
      updateStatus("Exported classification rules mapping CSV from table.");
    });
  }

  const btnImportRulesJson = document.getElementById('btnImportRulesJson');
  const rulesFileInputJson = document.getElementById('rulesFileInputJson');
  if (btnImportRulesJson && rulesFileInputJson) {
    btnImportRulesJson.addEventListener('click', () => rulesFileInputJson.click());
    rulesFileInputJson.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const rules = JSON.parse(evt.target.result);
          fetch('/api/rules/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules })
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              updateStatus(`Imported ${data.count} mapping rules successfully from JSON.`);
              if (typeof renderRulesMapping === 'function') {
                renderRulesMapping();
              }
              if (activeModel) {
                triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
              }
            }
          });
        } catch (err) {
          alert("Failed to parse JSON file: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  const btnImportRulesCsv = document.getElementById('btnImportRulesCsv');
  const rulesFileInputCsv = document.getElementById('rulesFileInputCsv');
  if (btnImportRulesCsv && rulesFileInputCsv) {
    btnImportRulesCsv.addEventListener('click', () => rulesFileInputCsv.click());
    rulesFileInputCsv.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const csvText = evt.target.result;
        fetch('/api/rules/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvText })
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            updateStatus(`Imported ${data.count} mapping rules successfully from CSV.`);
            if (typeof renderRulesMapping === 'function') {
              renderRulesMapping();
            }
            if (activeModel) {
              triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
            }
          } else {
            alert("Import failed: " + data.error);
          }
        })
        .catch(err => alert("Import request failed: " + err.message));
      };
      reader.readAsText(file);
    });
  }

  const btnExportAhspJson = document.getElementById('btnExportAhspJson');
  if (btnExportAhspJson) {
    btnExportAhspJson.addEventListener('click', () => {
      fetch('/api/ahsp/export?format=json')
        .then(r => r.json())
        .then(jsonData => {
          const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ahsp_library_backup_${Date.now()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          updateStatus("Exported AHSP standards catalog JSON.");
        });
    });
  }

  const btnExportAhspCsv = document.getElementById('btnExportAhspCsv');
  if (btnExportAhspCsv) {
    btnExportAhspCsv.addEventListener('click', () => {
      exportTableToCsv('ahspTable', `ahsp_library_backup_${Date.now()}.csv`);
      updateStatus("Exported AHSP standards catalog CSV from table.");
    });
  }

  const btnImportAhspJson = document.getElementById('btnImportAhspJson');
  const ahspFileInputJson = document.getElementById('ahspFileInputJson');
  if (btnImportAhspJson && ahspFileInputJson) {
    btnImportAhspJson.addEventListener('click', () => ahspFileInputJson.click());
    ahspFileInputJson.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const jsonData = JSON.parse(evt.target.result);
          fetch('/api/ahsp/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonData })
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              updateStatus("Imported AHSP catalog library successfully from JSON.");
              if (typeof renderAhspLibrary === 'function') {
                renderAhspLibrary();
              }
              if (activeModel) {
                triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
              }
            } else {
              alert("Import failed: " + data.error);
            }
          })
          .catch(err => alert("Import request failed: " + err.message));
        } catch (err) {
          alert("Failed to parse JSON file: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  const btnImportAhspCsv = document.getElementById('btnImportAhspCsv');
  const ahspFileInputCsv = document.getElementById('ahspFileInputCsv');
  if (btnImportAhspCsv && ahspFileInputCsv) {
    btnImportAhspCsv.addEventListener('click', () => ahspFileInputCsv.click());
    ahspFileInputCsv.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const csvText = evt.target.result;
        fetch('/api/ahsp/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvText })
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            updateStatus("Imported AHSP catalog library successfully from CSV.");
            if (typeof renderAhspLibrary === 'function') {
              renderAhspLibrary();
            }
            if (activeModel) {
              triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
            }
          } else {
            alert("Import failed: " + data.error);
          }
        })
        .catch(err => alert("Import request failed: " + err.message));
      };
      reader.readAsText(file);
    });
  }

  // --- Clear Price Unit Analysis Database (no reload) ---
  const btnClearAhsp = document.getElementById('btnClearAhsp');
  if (btnClearAhsp) {
    btnClearAhsp.addEventListener('click', () => {
      if (!confirm("This will permanently delete ALL Price Unit Analysis data (classifications, resources, analyses, BOQ items). Are you sure?")) return;
      fetch('/api/ahsp/clear', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            updateStatus("Price Unit Analysis database cleared.");
            alert(data.message);
            if (typeof renderAhspLibrary === 'function') renderAhspLibrary();
          } else {
            alert("Clear failed: " + data.error);
          }
        })
        .catch(err => alert("Clear request failed: " + err.message));
    });
  }

  // --- Clear Mapping & Rules Database ---
  const btnClearRules = document.getElementById('btnClearRules');
  if (btnClearRules) {
    btnClearRules.addEventListener('click', () => {
      if (!confirm("This will permanently delete ALL mapping rules, classification overrides, quantity overrides, and BOQ items. Are you sure?")) return;
      fetch('/api/rules/clear', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            updateStatus("Mapping & Rules database cleared.");
            alert(data.message);
            if (typeof renderRulesMapping === 'function') renderRulesMapping();
          } else {
            alert("Clear failed: " + data.error);
          }
        })
        .catch(err => alert("Clear request failed: " + err.message));
    });
  }

  // --- Dynamic Template Backups & Restore Setup ---
  const templates = [
    { key: 'Equipment', endpoint: '/api/equipment', file: 'equipment_backup.json' },
    { key: 'Labor', endpoint: '/api/labor', file: 'labor_backup.json' },
    { key: 'Materials', endpoint: '/api/materials', file: 'materials_backup.json' },
    { key: 'Resources', endpoint: '/api/resources', file: 'resources_backup.json' },
    { key: 'Prices', endpoint: '/api/prices', file: 'prices_backup.json' },
    { key: 'AhspFormulas', endpoint: '/api/analyses', file: 'ahsp_formulas_backup.json' },
    { key: 'Metadata', endpoint: '/api/metadata', file: 'metadata_backup.json' },
    { key: 'Validation', endpoint: '/api/validation', file: 'validation_report.json' }
  ];

  const templateFileInput = document.getElementById('templateFileInput');
  let activeImportEndpoint = '';

  templates.forEach(t => {
    const exportBtn = document.getElementById(`btnExport${t.key}`);
    const importBtn = document.getElementById(`btnImport${t.key}`);

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        updateStatus(`Exporting ${t.key} template...`);
        fetch(`${t.endpoint}/export`)
          .then(r => r.json())
          .then(data => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${t.file.replace('.json', '')}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            updateStatus(`Exported ${t.key} template successfully.`);
          })
          .catch(err => {
            alert(`Failed to export ${t.key}: ` + err.message);
          });
      });
    }

    if (importBtn && templateFileInput) {
      importBtn.addEventListener('click', () => {
        activeImportEndpoint = `${t.endpoint}/import`;
        templateFileInput.value = '';
        templateFileInput.click();
      });
    }
  });

  if (templateFileInput) {
    templateFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !activeImportEndpoint) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const payload = JSON.parse(evt.target.result);
          updateStatus("Uploading template JSON...");
          fetch(activeImportEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              updateStatus(`Imported template successfully.`);
              alert(`Template imported successfully! Added/updated ${data.count || ''} records.`);
              if (typeof renderAhspLibrary === 'function') renderAhspLibrary();
              if (activeModel) {
                triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
              }
            } else {
              alert("Import failed: " + (data.error || "Unknown error"));
            }
          })
          .catch(err => {
            alert("Upload request failed: " + err.message);
          });
        } catch (err) {
          alert("Failed to parse JSON file: " + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // --- Export QTO Overrides JSON (Resume Estimating) ---
  const btnExportQto = document.getElementById('btnExportQto');
  if (btnExportQto) {
    btnExportQto.addEventListener('click', () => {
      if (!activeModel) {
        alert("Please load a model first.");
        return;
      }
      
      updateStatus("Preparing QTO export JSON...");
      
      Promise.all([
        fetch(`/api/projects/${activeModel.id}/elements`).then(r => r.json()),
        fetch(`/api/projects/${activeModel.id}/overrides`).then(r => r.json()),
        fetch(`/api/projects/${activeModel.id}/classification-overrides`).then(r => r.json())
      ]).then(([elements, overrides, classOverrides]) => {
        const idToGuidMap = {};
        elements.forEach(el => {
          idToGuidMap[el.id] = el.global_id;
        });

        const qtyOverrideMap = {};
        overrides.forEach(o => {
          if (!qtyOverrideMap[o.element_id]) qtyOverrideMap[o.element_id] = {};
          qtyOverrideMap[o.element_id][o.quantity_name] = o.override_value;
        });

        const classOverrideMap = {};
        classOverrides.forEach(c => {
          classOverrideMap[c.element_id] = c.classification_code;
        });

        const qtoExport = [];
        elements.forEach(el => {
          const elOverrides = qtyOverrideMap[el.id];
          const elClass = classOverrideMap[el.id];
          
          if (elOverrides || elClass) {
            qtoExport.push({
              global_id: el.global_id,
              overrides: elOverrides || null,
              manual_classification: elClass || null
            });
          }
        });

        const blob = new Blob([JSON.stringify(qtoExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qto_overrides_backup_${activeModel.id}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateStatus("Exported QTO overrides JSON.");
      }).catch(err => {
        alert("Failed to export QTO: " + err.message);
      });
    });
  }

  // --- Import QTO Overrides JSON (Resume Estimating) ---
  const btnImportQto = document.getElementById('btnImportQto');
  const qtoFileInput = document.getElementById('qtoFileInput');
  if (btnImportQto && qtoFileInput) {
    btnImportQto.addEventListener('click', () => {
      if (!activeModel) {
        alert("Please load a model first.");
        return;
      }
      qtoFileInput.click();
    });
    
    qtoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const qto = JSON.parse(evt.target.result);
          if (!Array.isArray(qto)) {
            throw new Error("Invalid QTO file format. Expected a JSON array.");
          }
          
          updateStatus("Importing overrides and manual classifications...");
          
          fetch(`/api/projects/${activeModel.id}/qto/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qto })
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              updateStatus("Imported overrides successfully. Recalculating BOQ...");
              triggerBOQGeneration(activeModel.id, window.selectedRegionId || 'R-JKT');
              renderQtoTable();
              alert("QTO overrides and manual classifications resumed successfully.");
            } else {
              alert("Failed to import QTO: " + data.error);
            }
          });
        } catch (err) {
          alert("Failed to parse JSON file: " + err.message);
        }
      };
      reader.readAsText(file);
      qtoFileInput.value = '';
    });
  }

  // Initialize IFC 4D Module
  initIfc4DModule();
}

// =========================================================================
// IFC 4D SCHEDULING, GANTT CHART & CHRONOLOGY MODULE
// =========================================================================
function initIfc4DModule() {
  let schedules4D = [];
  let today4D = new Date().toISOString().slice(0, 10);
  let laborResources4D = [];
  let chronologyActive = false;
  let chronologyTimer = null;
  let currentSimDate = null;
  let selectedTaskElementIds = [];

  const ifc4dPanel = document.getElementById('ifc4dPanel');
  if (!ifc4dPanel) return;

  const ifc4dResizeHandle = document.getElementById('ifc4dResizeHandle');
  const btn4dAssignTask = document.getElementById('btn4dAssignTask');
  const input4dToday = document.getElementById('input4dToday');
  const btn4dToggleChronology = document.getElementById('btn4dToggleChronology');
  const chronologyControlsWrap = document.getElementById('chronologyControlsWrap');
  const btn4dPlayChronology = document.getElementById('btn4dPlayChronology');
  const slider4dChronology = document.getElementById('slider4dChronology');
  const lbl4dChronologyDate = document.getElementById('lbl4dChronologyDate');
  const btn4dSaveDraft = document.getElementById('btn4dSaveDraft');
  const btn4dImportDraft = document.getElementById('btn4dImportDraft');
  const input4dImportDraft = document.getElementById('input4dImportDraft');
  const btn4dExportOds = document.getElementById('btn4dExportOds') || document.getElementById('btn4dExportOdt');
  const btn4dExportIfc = document.getElementById('btn4dExportIfc');
  const btn4dToggleCollapse = document.getElementById('btn4dToggleCollapse');
  const btn4dClose = document.getElementById('btn4dClose');
  const ganttContainer = document.getElementById('ganttContainer');
  const badge4dTaskCount = document.getElementById('badge4dTaskCount');

  // Ribbon elements
  const btnRibbonToggle4d = document.getElementById('btnRibbonToggle4d');
  const btnRibbonAssignTask = document.getElementById('btnRibbonAssignTask');
  const btnRibbonChronology = document.getElementById('btnRibbonChronology');
  const btnRibbonSaveDraft = document.getElementById('btnRibbonSaveDraft');
  const btnRibbonImportDraft = document.getElementById('btnRibbonImportDraft');
  const btnRibbonExportOds = document.getElementById('btnRibbonExportOds') || document.getElementById('btnRibbonExportOdt');
  const btnRibbonExportIfc = document.getElementById('btnRibbonExportIfc');

  // Modal elements
  const modalAssign4D = document.getElementById('modalAssign4D');
  const btnCloseAssign4D = document.getElementById('btnCloseAssign4D');
  const btnCancelAssign4D = document.getElementById('btnCancelAssign4D');
  const formAssign4D = document.getElementById('formAssign4D');
  const assign4dElementChip = document.getElementById('assign4dElementChip');
  const assign4dWorkDesc = document.getElementById('assign4dWorkDesc');
  const assign4dStartDate = document.getElementById('assign4dStartDate');
  const assign4dEndDate = document.getElementById('assign4dEndDate');
  const assign4dLaborResource = document.getElementById('assign4dLaborResource');
  const assign4dLaborCount = document.getElementById('assign4dLaborCount');
  const assign4dColor = document.getElementById('assign4dColor');
  const assign4dColorCode = document.getElementById('assign4dColorCode');
  const assign4dPredecessor = document.getElementById('assign4dPredecessor');
  const assign4dProgress = document.getElementById('assign4dProgress');
  const assign4dProgressText = document.getElementById('assign4dProgressText');

  // Initialize Today date
  if (input4dToday) {
    input4dToday.value = today4D;
    input4dToday.addEventListener('change', () => {
      today4D = input4dToday.value || new Date().toISOString().slice(0, 10);
      renderGantt();
    });
  }

  // Panel resizing (ns-resize)
  let isDraggingResizer = false;
  let startY = 0;
  let startHeight = 0;

  if (ifc4dResizeHandle) {
    ifc4dResizeHandle.addEventListener('mousedown', (e) => {
      isDraggingResizer = true;
      startY = e.clientY;
      startHeight = ifc4dPanel.offsetHeight;
      ifc4dPanel.style.transition = 'none';
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingResizer) return;
    const dy = startY - e.clientY;
    const newHeight = Math.max(38, Math.min(window.innerHeight * 0.85, startHeight + dy));
    ifc4dPanel.style.height = `${newHeight}px`;
    if (newHeight <= 45) {
      ifc4dPanel.classList.add('collapsed');
    } else {
      ifc4dPanel.classList.remove('collapsed');
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingResizer) {
      isDraggingResizer = false;
      ifc4dPanel.style.transition = 'height 0.15s ease';
      document.body.style.cursor = '';
    }
  });

  // Collapse / Close / Open
  function open4DPanel() {
    ifc4dPanel.classList.remove('hidden');
    ifc4dPanel.classList.remove('collapsed');
    if (btn4dToggleCollapse) btn4dToggleCollapse.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
  }

  if (btn4dToggleCollapse) {
    btn4dToggleCollapse.addEventListener('click', () => {
      ifc4dPanel.classList.toggle('collapsed');
      const isCol = ifc4dPanel.classList.contains('collapsed');
      btn4dToggleCollapse.innerHTML = isCol ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
    });
  }

  if (btn4dClose) {
    btn4dClose.addEventListener('click', () => {
      ifc4dPanel.classList.add('hidden');
    });
  }

  if (btnRibbonToggle4d) {
    btnRibbonToggle4d.addEventListener('click', () => {
      if (ifc4dPanel.classList.contains('hidden')) {
        open4DPanel();
      } else {
        ifc4dPanel.classList.toggle('collapsed');
        const isCol = ifc4dPanel.classList.contains('collapsed');
        if (btn4dToggleCollapse) btn4dToggleCollapse.innerHTML = isCol ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
      }
    });
  }

  // Fetch labor resources from BOQ database
  async function loadLaborResources() {
    try {
      const res = await fetch('/api/labor');
      if (res.ok) {
        laborResources4D = await res.json();
      }
    } catch (e) {
      console.warn("Could not fetch labor resources, fallback to defaults", e);
    }
    if (!laborResources4D || laborResources4D.length === 0) {
      laborResources4D = [
        { id: 'L-WRK', description: 'Pekerja (Worker)', unit: 'day' },
        { id: 'L-MSN', description: 'Tukang Batu (Mason)', unit: 'day' },
        { id: 'L-FRM', description: 'Kepala Tukang (Foreman)', unit: 'day' },
        { id: 'L-SUP', description: 'Mandor (Supervisor)', unit: 'day' }
      ];
    }
    if (assign4dLaborResource) {
      assign4dLaborResource.innerHTML = '<option value="">-- Select Labor Resource --</option>' +
        laborResources4D.map(l => `<option value="${l.id}">${escapeXml(l.description)} (${escapeXml(l.unit)})</option>`).join('');
    }
  }

  // Load and save schedules
  async function loadSchedules4D() {
    try {
      const res = await fetch('/api/4d/schedules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          schedules4D = data;
        }
      }
    } catch (e) {}

    if (schedules4D.length === 0) {
      const local = localStorage.getItem('bimbam_schedules_4d');
      if (local) {
        try { schedules4D = JSON.parse(local); } catch (e) {}
      }
    }
    renderGantt();
  }

  function saveSchedules4D() {
    localStorage.setItem('bimbam_schedules_4d', JSON.stringify(schedules4D));
    fetch('/api/4d/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedules: schedules4D })
    }).catch(() => {});
  }

  // IFC GlobalId helper for elements
  function getElementGlobalId(elemId) {
    if (window.viewer && window.viewer.metaScene && window.viewer.metaScene.metaObjects) {
      const meta = window.viewer.metaScene.metaObjects[elemId];
      if (meta) {
        if (meta.propertySets) {
          for (const pset of meta.propertySets) {
            if (pset.properties) {
              const gidProp = pset.properties.find(p => p.name && (p.name.toLowerCase() === 'globalid' || p.name.toLowerCase() === 'guid'));
              if (gidProp && gidProp.value) return String(gidProp.value).trim();
            }
          }
        }
        if (meta.originalSystemId) return String(meta.originalSystemId).trim();
        if (meta.id) return String(meta.id).trim();
      }
    }
    return elemId;
  }

  function ensureTaskGlobalIds(task) {
    if ((!task.elementGlobalIds || task.elementGlobalIds.length === 0) && task.elementIds && task.elementIds.length > 0) {
      task.elementGlobalIds = task.elementIds.map(id => getElementGlobalId(id));
    }
    return task.elementGlobalIds || [];
  }

  // Task assignment modal handling
  function openAssignModal() {
    open4DPanel();
    const selectedIds = (window.viewer && window.viewer.scene && window.viewer.scene.selectedObjectIds) ? window.viewer.scene.selectedObjectIds : [];
    selectedTaskElementIds = [...selectedIds];

    if (selectedTaskElementIds.length > 0) {
      const firstId = selectedTaskElementIds[0];
      const meta = (window.viewer && window.viewer.metaScene && window.viewer.metaScene.metaObjects) ? window.viewer.metaScene.metaObjects[firstId] : null;
      const name = meta ? (meta.name || meta.type || firstId) : firstId;
      assign4dElementChip.textContent = `${selectedTaskElementIds.length} element(s) selected: ${name}${selectedTaskElementIds.length > 1 ? ` (+${selectedTaskElementIds.length - 1} more)` : ''}`;
      if (!assign4dWorkDesc.value) {
        assign4dWorkDesc.value = `${name} Installation`;
      }
    } else {
      assign4dElementChip.textContent = "No element selected (Project-level task)";
    }

    if (!assign4dStartDate.value) assign4dStartDate.value = today4D;
    if (!assign4dEndDate.value) {
      const d = new Date(today4D);
      d.setDate(d.getDate() + 5);
      assign4dEndDate.value = d.toISOString().slice(0, 10);
    }

    // Populate predecessor choices
    if (assign4dPredecessor) {
      assign4dPredecessor.innerHTML = '<option value="">(None)</option>' +
        schedules4D.map(s => `<option value="${escapeXml(s.workDesc)}">${escapeXml(s.workDesc)}</option>`).join('');
    }

    if (modalAssign4D) modalAssign4D.style.display = 'flex';
  }

  if (btn4dAssignTask) btn4dAssignTask.addEventListener('click', openAssignModal);
  if (btnRibbonAssignTask) btnRibbonAssignTask.addEventListener('click', openAssignModal);
  if (btnCloseAssign4D) btnCloseAssign4D.addEventListener('click', () => modalAssign4D.style.display = 'none');
  if (btnCancelAssign4D) btnCancelAssign4D.addEventListener('click', () => modalAssign4D.style.display = 'none');

  if (assign4dColor) {
    assign4dColor.addEventListener('input', () => {
      if (assign4dColorCode) assign4dColorCode.textContent = assign4dColor.value;
    });
  }

  if (assign4dProgress) {
    assign4dProgress.addEventListener('input', () => {
      if (assign4dProgressText) assign4dProgressText.textContent = `${assign4dProgress.value}%`;
    });
  }

  if (formAssign4D) {
    formAssign4D.addEventListener('submit', (e) => {
      e.preventDefault();
      const workDesc = assign4dWorkDesc.value.trim();
      const startDate = assign4dStartDate.value;
      const endDate = assign4dEndDate.value;
      if (!workDesc || !startDate || !endDate) return;

      if (new Date(endDate) < new Date(startDate)) {
        alert("Ending Date cannot be earlier than Start Date.");
        return;
      }

      const resId = assign4dLaborResource ? assign4dLaborResource.value : '';
      const resObj = laborResources4D.find(r => r.id === resId);
      const resourceDesc = resObj ? resObj.description : '';
      const resourceCount = Number(assign4dLaborCount ? assign4dLaborCount.value : 1) || 1;
      const color = assign4dColor ? assign4dColor.value : '#38bdf8';
      const predecessor = assign4dPredecessor ? assign4dPredecessor.value : '';
      const progress = Number(assign4dProgress ? assign4dProgress.value : 0) || 0;

      const elementGlobalIds = selectedTaskElementIds.map(id => getElementGlobalId(id));

      const newTask = {
        id: 'task-' + Date.now(),
        workDesc,
        startDate,
        endDate,
        resourceId: resId,
        resourceDesc,
        resourceCount,
        color,
        predecessor,
        progress,
        elementIds: [...selectedTaskElementIds],
        elementGlobalIds: elementGlobalIds
      };

      schedules4D.push(newTask);
      saveSchedules4D();
      renderGantt();

      modalAssign4D.style.display = 'none';
      formAssign4D.reset();
      if (assign4dColor) assign4dColor.value = '#38bdf8';
      if (assign4dColorCode) assign4dColorCode.textContent = '#38bdf8';
      if (assign4dProgress) assign4dProgress.value = 0;
      if (assign4dProgressText) assign4dProgressText.textContent = '0%';
    });
  }

  // Gantt Chart Rendering
  function renderGantt() {
    if (badge4dTaskCount) {
      badge4dTaskCount.textContent = `${schedules4D.length} Task${schedules4D.length === 1 ? '' : 's'}`;
    }

    if (!ganttContainer) return;

    if (schedules4D.length === 0) {
      ganttContainer.innerHTML = `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; gap: 8px;">
          <i class="fa-solid fa-calendar-plus" style="font-size: 28px; opacity: 0.5;"></i>
          <span>No schedule tasks yet. Select a 3D element and click <strong>Assign Task</strong>.</span>
        </div>`;
      return;
    }

    // Determine timeline date boundaries
    const allDates = [];
    allDates.push(new Date(today4D + 'T00:00:00'));
    if (currentSimDate) allDates.push(new Date(currentSimDate));
    schedules4D.forEach(s => {
      allDates.push(new Date(s.startDate + 'T00:00:00'));
      allDates.push(new Date(s.endDate + 'T00:00:00'));
    });

    const minTime = Math.min(...allDates.map(d => d.getTime()));
    const maxTime = Math.max(...allDates.map(d => d.getTime()));

    const dayMs = 86400000;
    const startRange = new Date(minTime - 2 * dayMs);
    startRange.setHours(0, 0, 0, 0);
    const endRange = new Date(maxTime + 3 * dayMs);
    endRange.setHours(23, 59, 59, 999);

    const totalRangeMs = endRange.getTime() - startRange.getTime();
    const totalDays = Math.ceil(totalRangeMs / dayMs);

    const dayHeaders = [];
    const curr = new Date(startRange);
    for (let i = 0; i < totalDays; i++) {
      const dStr = curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const isToday = curr.toISOString().slice(0, 10) === today4D;
      dayHeaders.push({
        dateStr: curr.toISOString().slice(0, 10),
        label: dStr,
        isToday
      });
      curr.setDate(curr.getDate() + 1);
    }

    // Left Table Pane
    let tableHtml = `
      <div class="gantt-table-pane">
        <table class="gantt-table">
          <thead>
            <tr>
              <th>Work Description</th>
              <th>Labor</th>
              <th style="text-align: right;">Prog</th>
              <th style="text-align: center; width: 30px;"></th>
            </tr>
          </thead>
          <tbody>
    `;

    schedules4D.forEach((t, idx) => {
      const laborText = t.resourceDesc ? `${t.resourceCount}× ${t.resourceDesc}` : '-';
      tableHtml += `
        <tr data-task-idx="${idx}" title="Click to highlight linked 3D element">
          <td><strong style="color: var(--text-main);">${escapeXml(t.workDesc)}</strong></td>
          <td style="color: var(--text-muted); font-size: 10px;">${escapeXml(laborText)}</td>
          <td style="text-align: right; font-weight: 600; color: ${t.progress === 100 ? 'var(--success)' : 'var(--accent)'};">${t.progress}%</td>
          <td style="text-align: center;">
            <button class="btn-icon-xs btn-delete-task" data-task-id="${t.id}" style="width: 20px; height: 20px; border: none; background: transparent; color: var(--danger); cursor: pointer;" title="Delete task"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `;
    });
    tableHtml += `</tbody></table></div>`;

    // Right Timeline Pane
    const dayColWidth = 44;
    const timelineInnerWidth = Math.max(dayColWidth * totalDays, 600);

    let timelineHtml = `
      <div class="gantt-timeline-pane" id="ganttTimelinePane">
        <div class="gantt-timeline-inner" style="width: ${timelineInnerWidth}px;">
          <div class="gantt-header-row">
    `;

    dayHeaders.forEach(dh => {
      timelineHtml += `
        <div class="gantt-day-header ${dh.isToday ? 'style="font-weight:700; color:#f59e0b;"' : ''}">
          ${dh.label}
        </div>
      `;
    });
    timelineHtml += `</div>`;

    // Vertical Today Line (Requirement 3)
    const todayMs = new Date(today4D + 'T12:00:00').getTime();
    const todayOffsetPct = ((todayMs - startRange.getTime()) / totalRangeMs) * 100;
    const todayLeftPx = (todayOffsetPct / 100) * timelineInnerWidth;

    timelineHtml += `
      <div class="gantt-today-line" style="left: ${todayLeftPx}px;">
        <span class="gantt-today-badge">Today (${today4D})</span>
      </div>
    `;

    // Vertical Chronology Line (Requirement 7)
    if (chronologyActive && currentSimDate) {
      const simMs = currentSimDate.getTime();
      const simOffsetPct = ((simMs - startRange.getTime()) / totalRangeMs) * 100;
      const simLeftPx = (simOffsetPct / 100) * timelineInnerWidth;
      timelineHtml += `
        <div class="gantt-chronology-line" style="left: ${simLeftPx}px;">
          <span class="gantt-chronology-badge">Sim: ${currentSimDate.toISOString().slice(0, 10)}</span>
        </div>
      `;
    }

    // Task rows & bars
    schedules4D.forEach((t, idx) => {
      const sTime = new Date(t.startDate + 'T00:00:00').getTime();
      const eTime = new Date(t.endDate + 'T23:59:59').getTime();
      const leftPct = Math.max(0, ((sTime - startRange.getTime()) / totalRangeMs) * 100);
      const widthPct = Math.min(100 - leftPct, Math.max(1.5, ((eTime - sTime) / totalRangeMs) * 100));

      // Requirement 5: Overdue check -> Red bar
      const isOverdue = new Date(t.endDate + 'T23:59:59') < new Date(today4D + 'T00:00:00') && Number(t.progress) < 100;
      const barBg = isOverdue ? '#ef4444' : (t.color || '#38bdf8');
      const overdueClass = isOverdue ? 'overdue' : '';

      timelineHtml += `
        <div class="gantt-grid-row" data-task-idx="${idx}">
          ${dayHeaders.map(() => '<div class="gantt-grid-cell"></div>').join('')}
          <div class="gantt-bar-item ${overdueClass}" style="left: ${leftPct}%; width: ${widthPct}%; background-color: ${barBg};" title="${escapeXml(t.workDesc)}: ${t.startDate} → ${t.endDate} (${t.progress}%) ${isOverdue ? '[OVERDUE]' : ''}">
            <div class="gantt-bar-fill" style="width: ${t.progress}%;"></div>
            <div class="gantt-bar-content">
              ${isOverdue ? '<i class="fa-solid fa-triangle-exclamation"></i>' : ''}
              <span>${escapeXml(t.workDesc)}</span>
              <small style="opacity: 0.85;">(${t.progress}%)</small>
              ${t.predecessor ? `<small style="opacity: 0.75; font-size: 9px;">← ${escapeXml(t.predecessor)}</small>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    timelineHtml += `</div></div>`;

    ganttContainer.innerHTML = tableHtml + timelineHtml;

    // Delete buttons
    ganttContainer.querySelectorAll('.btn-delete-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.taskId;
        if (confirm("Delete this schedule task?")) {
          schedules4D = schedules4D.filter(s => s.id !== id);
          saveSchedules4D();
          renderGantt();
        }
      });
    });

    // Row click -> Select linked element in viewer
    ganttContainer.querySelectorAll('[data-task-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.taskIdx);
        const task = schedules4D[idx];
        if (task && task.elementIds && task.elementIds.length > 0 && window.viewer && window.viewer.scene) {
          window.viewer.scene.setObjectsSelected(window.viewer.scene.selectedObjectIds, false);
          window.viewer.scene.setObjectsSelected(task.elementIds, true);
          if (typeof updateSelectionUI === 'function') {
            updateSelectionUI();
          }
        }
      });
    });
  }

  // 4D Chronology Simulation (Requirement 7)
  function toggleChronology(active) {
    chronologyActive = (active !== undefined) ? active : !chronologyActive;
    if (btn4dToggleChronology) {
      btn4dToggleChronology.innerHTML = chronologyActive 
        ? '<i class="fa-solid fa-eye text-accent"></i> Chronology: On'
        : '<i class="fa-solid fa-eye-slash"></i> Chronology: Off';
      btn4dToggleChronology.classList.toggle('btn-primary', chronologyActive);
      btn4dToggleChronology.classList.toggle('btn-secondary', !chronologyActive);
    }
    if (btnRibbonChronology) {
      btnRibbonChronology.innerHTML = chronologyActive
        ? '<i class="fa-solid fa-film text-accent"></i> Simulation: On'
        : '<i class="fa-solid fa-film"></i> Simulation: Off';
      btnRibbonChronology.classList.toggle('btn-primary', chronologyActive);
      btnRibbonChronology.classList.toggle('btn-secondary', !chronologyActive);
    }

    if (chronologyControlsWrap) {
      chronologyControlsWrap.style.display = chronologyActive ? 'flex' : 'none';
    }

    if (!chronologyActive) {
      stopChronologyPlay();
      currentSimDate = null;
      if (window.viewer && window.viewer.scene) {
        const allIds = Object.keys(window.viewer.scene.objects);
        window.viewer.scene.setObjectsVisible(allIds, true);
      }
      renderGantt();
      return;
    }

    if (schedules4D.length === 0) {
      alert("Please assign schedule tasks first.");
      toggleChronology(false);
      return;
    }

    const allStarts = schedules4D.map(s => new Date(s.startDate + 'T00:00:00').getTime());
    const allEnds = schedules4D.map(s => new Date(s.endDate + 'T23:59:59').getTime());
    const minSimTime = Math.min(...allStarts);
    const maxSimTime = Math.max(...allEnds);

    if (slider4dChronology) {
      slider4dChronology.min = 0;
      slider4dChronology.max = Math.ceil((maxSimTime - minSimTime) / 86400000);
      slider4dChronology.value = 0;
    }

    updateChronologyFrame(minSimTime, maxSimTime, 0);
  }

  function updateChronologyFrame(minSimTime, maxSimTime, dayOffset) {
    const simMs = minSimTime + dayOffset * 86400000;
    currentSimDate = new Date(Math.min(maxSimTime, simMs));
    const simDateStr = currentSimDate.toISOString().slice(0, 10);
    if (lbl4dChronologyDate) lbl4dChronologyDate.textContent = simDateStr;

    // Hide/show elements based on schedule date reached
    if (window.viewer && window.viewer.scene) {
      schedules4D.forEach(task => {
        if (task.elementIds && task.elementIds.length > 0) {
          const taskStart = new Date(task.startDate + 'T00:00:00');
          if (currentSimDate < taskStart) {
            window.viewer.scene.setObjectsVisible(task.elementIds, false);
          } else {
            window.viewer.scene.setObjectsVisible(task.elementIds, true);
          }
        }
      });
    }

    renderGantt();
  }

  if (btn4dToggleChronology) btn4dToggleChronology.addEventListener('click', () => toggleChronology());
  if (btnRibbonChronology) btnRibbonChronology.addEventListener('click', () => toggleChronology());

  if (slider4dChronology) {
    slider4dChronology.addEventListener('input', () => {
      if (!chronologyActive) return;
      const allStarts = schedules4D.map(s => new Date(s.startDate + 'T00:00:00').getTime());
      const allEnds = schedules4D.map(s => new Date(s.endDate + 'T23:59:59').getTime());
      updateChronologyFrame(Math.min(...allStarts), Math.max(...allEnds), Number(slider4dChronology.value));
    });
  }

  function stopChronologyPlay() {
    if (chronologyTimer) {
      clearInterval(chronologyTimer);
      chronologyTimer = null;
    }
    if (btn4dPlayChronology) btn4dPlayChronology.innerHTML = '<i class="fa-solid fa-play"></i>';
  }

  if (btn4dPlayChronology) {
    btn4dPlayChronology.addEventListener('click', () => {
      if (chronologyTimer) {
        stopChronologyPlay();
        return;
      }

      btn4dPlayChronology.innerHTML = '<i class="fa-solid fa-pause"></i>';
      const allStarts = schedules4D.map(s => new Date(s.startDate + 'T00:00:00').getTime());
      const allEnds = schedules4D.map(s => new Date(s.endDate + 'T23:59:59').getTime());
      const minSim = Math.min(...allStarts);
      const maxSim = Math.max(...allEnds);
      const maxDays = Number(slider4dChronology.max);

      if (Number(slider4dChronology.value) >= maxDays) {
        slider4dChronology.value = 0;
      }

      chronologyTimer = setInterval(() => {
        let nextVal = Number(slider4dChronology.value) + 1;
        if (nextVal > maxDays) {
          stopChronologyPlay();
          return;
        }
        slider4dChronology.value = nextVal;
        updateChronologyFrame(minSim, maxSim, nextVal);
      }, 600);
    });
  }

  // Export LibreOffice Calc .ODS Spreadsheet
  function exportScheduleToOds() {
    if (schedules4D.length === 0) {
      alert("No schedule tasks to export.");
      return;
    }

    function crc32(bytes) {
      let crc = ~0;
      for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
      }
      return (~crc) >>> 0;
    }

    function createZip(files) {
      const encoder = new TextEncoder();
      const parts = [];
      const centralHeaders = [];
      let offset = 0;

      for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const dataBytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
        const crc = crc32(dataBytes);
        const size = dataBytes.length;

        // Local Header
        const lh = new Uint8Array(30 + nameBytes.length);
        const lhView = new DataView(lh.buffer);
        lhView.setUint32(0, 0x04034b50, true);
        lhView.setUint16(4, 20, true);
        lhView.setUint16(6, 0, true);
        lhView.setUint16(8, 0, true);
        lhView.setUint16(10, 0, true);
        lhView.setUint16(12, 0, true);
        lhView.setUint32(14, crc, true);
        lhView.setUint32(18, size, true);
        lhView.setUint32(22, size, true);
        lhView.setUint16(26, nameBytes.length, true);
        lhView.setUint16(28, 0, true);
        lh.set(nameBytes, 30);

        parts.push(lh, dataBytes);

        // Central Directory Header
        const ch = new Uint8Array(46 + nameBytes.length);
        const chView = new DataView(ch.buffer);
        chView.setUint32(0, 0x02014b50, true);
        chView.setUint16(4, 20, true);
        chView.setUint16(6, 20, true);
        chView.setUint16(8, 0, true);
        chView.setUint16(10, 0, true);
        chView.setUint16(12, 0, true);
        chView.setUint16(14, 0, true);
        chView.setUint32(16, crc, true);
        chView.setUint32(20, size, true);
        chView.setUint32(24, size, true);
        chView.setUint16(28, nameBytes.length, true);
        chView.setUint16(30, 0, true);
        chView.setUint16(32, 0, true);
        chView.setUint16(34, 0, true);
        chView.setUint16(36, 0, true);
        chView.setUint32(38, 0, true);
        chView.setUint32(42, offset, true);
        ch.set(nameBytes, 46);

        centralHeaders.push(ch);
        offset += lh.length + dataBytes.length;
      }

      const centralOffset = offset;
      let centralSize = 0;
      centralHeaders.forEach(ch => centralSize += ch.length);

      // End of Central Directory
      const eocd = new Uint8Array(22);
      const eocdView = new DataView(eocd.buffer);
      eocdView.setUint32(0, 0x06054b50, true);
      eocdView.setUint16(4, 0, true);
      eocdView.setUint16(6, 0, true);
      eocdView.setUint16(8, files.length, true);
      eocdView.setUint16(10, files.length, true);
      eocdView.setUint32(12, centralSize, true);
      eocdView.setUint32(16, centralOffset, true);
      eocdView.setUint16(20, 0, true);

      return new Blob([...parts, ...centralHeaders, eocd], { type: 'application/vnd.oasis.opendocument.spreadsheet' });
    }

    let rowsXml = '';
    schedules4D.forEach((t, i) => {
      const isOverdue = new Date(t.endDate + 'T23:59:59') < new Date(today4D + 'T00:00:00') && Number(t.progress) < 100;
      const statusText = t.progress === 100 ? 'Completed' : (isOverdue ? 'OVERDUE (Delayed)' : 'In Progress');
      const labor = t.resourceDesc ? `${t.resourceCount} ${t.resourceDesc}` : '-';
      const gids = (t.elementGlobalIds || []).join(', ') || '-';

      rowsXml += `
        <table:table-row>
          <table:table-cell office:value-type="float" office:value="${i + 1}"><text:p>${i + 1}</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${escapeXml(t.workDesc)}</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${t.startDate}</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${t.endDate}</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${escapeXml(labor)}</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${escapeXml(t.predecessor || '-')}</text:p></table:table-cell>
          <table:table-cell office:value-type="float" office:value="${t.progress}"><text:p>${t.progress}%</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${statusText}</text:p></table:table-cell>
          <table:table-cell office:value-type="string"><text:p>${escapeXml(gids)}</text:p></table:table-cell>
        </table:table-row>
      `;
    });

    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.2">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="4D_Schedule">
        <table:table-column table:number-columns-repeated="9"/>
        <table:table-header-rows>
          <table:table-row>
            <table:table-cell office:value-type="string"><text:p>No</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Work Description</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Start Date</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Ending Date</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Assigned Labor</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Predecessor</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Progress (%)</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Status</text:p></table:table-cell>
            <table:table-cell office:value-type="string"><text:p>Element GlobalIDs</text:p></table:table-cell>
          </table:table-row>
        </table:table-header-rows>
        ${rowsXml}
      </table:table>
    </office:spreadsheet>
  </office:body>
</office:document-content>`;

    const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

    const blob = createZip([
      { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
      { name: 'META-INF/manifest.xml', data: manifestXml },
      { name: 'content.xml', data: contentXml }
    ]);

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BIM_BAM_Schedule_${today4D}.ods`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // Save Schedule Draft as JSON (Includes element GlobalIDs)
  function saveScheduleDraftJson() {
    if (schedules4D.length === 0) {
      alert("No schedule tasks to save as draft.");
      return;
    }

    schedules4D.forEach(t => ensureTaskGlobalIds(t));

    const draftData = {
      app: "BIM BAM",
      format: "4D_Schedule_Draft",
      version: "1.0",
      exportDate: new Date().toISOString(),
      referenceToday: today4D,
      tasksCount: schedules4D.length,
      tasks: schedules4D
    };

    const blob = new Blob([JSON.stringify(draftData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BIM_BAM_Schedule_Draft_${today4D}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // Import Schedule Draft JSON with element GlobalID matching
  function handleImportDraftFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const importedTasks = Array.isArray(parsed) ? parsed : (parsed.tasks || parsed.schedules || []);
        if (!Array.isArray(importedTasks) || importedTasks.length === 0) {
          alert("Selected JSON file does not contain valid schedule tasks.");
          return;
        }

        // Collect all element IDs and GlobalIDs from active viewer scene
        const viewerGlobalMap = new Map();
        const viewerAllGids = new Set();
        if (window.viewer && window.viewer.metaScene && window.viewer.metaScene.metaObjects) {
          Object.entries(window.viewer.metaScene.metaObjects).forEach(([elemId, meta]) => {
            const gid = getElementGlobalId(elemId);
            viewerGlobalMap.set(gid, elemId);
            viewerGlobalMap.set(elemId, elemId);
            viewerAllGids.add(gid);
            viewerAllGids.add(elemId);
            if (meta.id) {
              viewerAllGids.add(meta.id);
              viewerGlobalMap.set(meta.id, elemId);
            }
            if (meta.originalSystemId) {
              viewerAllGids.add(meta.originalSystemId);
              viewerGlobalMap.set(meta.originalSystemId, elemId);
            }
          });
        }
        if (window.viewer && window.viewer.scene && window.viewer.scene.objects) {
          Object.keys(window.viewer.scene.objects).forEach(id => {
            viewerAllGids.add(id);
            if (!viewerGlobalMap.has(id)) viewerGlobalMap.set(id, id);
          });
        }

        const modelLoaded = viewerAllGids.size > 0;
        const missingGlobalIds = [];
        let matchedCount = 0;
        let totalAssignedElements = 0;

        importedTasks.forEach(task => {
          const gids = task.elementGlobalIds || task.elementIds || [];
          gids.forEach(gid => {
            totalAssignedElements++;
            if (viewerAllGids.has(gid)) {
              matchedCount++;
            } else {
              missingGlobalIds.push({ task: task.workDesc || 'Untitled Task', globalId: gid });
            }
          });
        });

        if (modelLoaded && missingGlobalIds.length > 0) {
          const sampleList = missingGlobalIds.slice(0, 5).map(m => `• "${m.globalId}" (${m.task})`).join('\n');
          const moreText = missingGlobalIds.length > 5 ? `\n...and ${missingGlobalIds.length - 5} more.` : '';
          const msg = `⚠️ Model Mismatch Notification!\n\nThe schedule draft and currently open IFC model are DIFFERENT!\n\n` +
            `${missingGlobalIds.length} of ${totalAssignedElements} element GlobalID(s) do not exist in the active IFC model:\n\n${sampleList}${moreText}\n\n` +
            `Do you still want to import this schedule draft anyway?`;

          const proceed = confirm(msg);
          if (!proceed) {
            return;
          }
        } else if (modelLoaded && totalAssignedElements > 0) {
          alert(`✓ Schedule Draft Matched!\n\nAll ${matchedCount} element GlobalIDs match the open IFC model successfully.`);
        }

        // Remap elementIds to current viewer scene IDs where matched
        importedTasks.forEach(task => {
          if (task.elementGlobalIds && task.elementGlobalIds.length > 0) {
            const remappedIds = [];
            task.elementGlobalIds.forEach(gid => {
              const elemId = viewerGlobalMap.get(gid);
              if (elemId && !remappedIds.includes(elemId)) remappedIds.push(elemId);
            });
            if (remappedIds.length > 0) {
              task.elementIds = remappedIds;
            }
          }
        });

        if (parsed.referenceToday) {
          today4D = parsed.referenceToday;
          if (input4dToday) input4dToday.value = today4D;
        }

        schedules4D = importedTasks;
        saveSchedules4D();
        renderGantt();
      } catch (err) {
        console.error("Error parsing schedule draft JSON:", err);
        alert("Failed to parse JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // Export Open Planner Studio .IFC (Requirement 6)
  function exportScheduleToOpenPlannerStudioIfc() {
    if (schedules4D.length === 0) {
      alert("No schedule tasks to export.");
      return;
    }

    function makeIfcGuid() {
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
      let res = '';
      for (let i = 0; i < 22; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    }

    const nowIso = new Date().toISOString().slice(0, 19);
    const timestamp = Math.floor(Date.now() / 1000);

    const allStarts = schedules4D.map(s => s.startDate);
    const allEnds = schedules4D.map(s => s.endDate);
    const minStartIso = (allStarts.sort()[0] || today4D) + 'T07:00:00';
    const maxEndIso = (allEnds.sort().reverse()[0] || today4D) + 'T16:00:00';

    let lineNum = 1;
    const lines = [];
    const ref = () => `#${lineNum++}`;

    const personRef = ref(); lines.push(`${personRef}=IFCPERSON($,'Contractor',$,$,$,$,$,$);`);
    const orgRef = ref(); lines.push(`${orgRef}=IFCORGANIZATION($,'BIM BAM Construction',$,$,$);`);
    const poRef = ref(); lines.push(`${poRef}=IFCPERSONANDORGANIZATION(${personRef},${orgRef},$);`);
    const aOrgRef = ref(); lines.push(`${aOrgRef}=IFCORGANIZATION($,'OpenAEC Foundation',$,$,$);`);
    const appRef = ref(); lines.push(`${appRef}=IFCAPPLICATION(${aOrgRef},'0.2','Open Planner Studio','OPS');`);
    const ownerRef = ref(); lines.push(`${ownerRef}=IFCOWNERHISTORY(${poRef},${appRef},$,.NOCHANGE.,$,$,$,${timestamp});`);
    const unitM = ref(); lines.push(`${unitM}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
    const unitS = ref(); lines.push(`${unitS}=IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.);`);
    const unitAssign = ref(); lines.push(`${unitAssign}=IFCUNITASSIGNMENT((${unitM},${unitS}));`);
    const pt = ref(); lines.push(`${pt}=IFCCARTESIANPOINT((0.,0.,0.));`);
    const axis = ref(); lines.push(`${axis}=IFCAXIS2PLACEMENT3D(${pt},$,$);`);
    const ctx = ref(); lines.push(`${ctx}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Plan',3,1.0E-05,${axis},$);`);
    const projRef = ref(); lines.push(`${projRef}=IFCPROJECT('${makeIfcGuid()}',${ownerRef},'BIM BAM Schedule','Open Planner Studio 4D Schedule',$,$,$,(${ctx}),${unitAssign});`);

    const timePeriod = ref(); lines.push(`${timePeriod}=IFCTIMEPERIOD('07:00:00','16:00:00');`);
    const recPat = ref(); lines.push(`${recPat}=IFCRECURRENCEPATTERN(.WEEKLY.,$,(1,2,3,4,5),$,$,$,$,(${timePeriod}));`);
    const workTime = ref(); lines.push(`${workTime}=IFCWORKTIME('Standard work week',.PREDICTED.,$,${recPat},$,$);`);
    const calendar = ref(); lines.push(`${calendar}=IFCWORKCALENDAR('${makeIfcGuid()}',${ownerRef},'Standard Construction Calendar','Mon-Fri 07:00-16:00',$,(${workTime}),$,.FIRSTSHIFT.);`);
    const calPval = ref(); lines.push(`${calPval}=IFCPROPERTYSINGLEVALUE('HoursPerDay',$,IFCREAL(8),$);`);
    const calPset = ref(); lines.push(`${calPset}=IFCPROPERTYSET('${makeIfcGuid()}',${ownerRef},'OPS_Calendar',$,(${calPval}));`);
    const relCalProp = ref(); lines.push(`${relCalProp}=IFCRELDEFINESBYPROPERTIES('${makeIfcGuid()}',${ownerRef},$,$,(${calendar}),${calPset});`);

    const workPlan = ref(); lines.push(`${workPlan}=IFCWORKPLAN('${makeIfcGuid()}',${ownerRef},'BIM BAM Plan','4D Master Plan',$,$,'${nowIso}',$,$,$,$,$,'${minStartIso}','${maxEndIso}',.PLANNED.);`);
    const workSched = ref(); lines.push(`${workSched}=IFCWORKSCHEDULE('${makeIfcGuid()}',${ownerRef},'Construction schedule v1.0',$,$,$,'${nowIso}',$,$,$,$,$,'${minStartIso}','${maxEndIso}',.PLANNED.);`);
    const relAgg = ref(); lines.push(`${relAgg}=IFCRELAGGREGATES('${makeIfcGuid()}',${ownerRef},$,$,${workPlan},(${workSched}));`);

    const taskMap = new Map();
    const allTaskRefs = [];

    schedules4D.forEach((task, i) => {
      const sDate = new Date(task.startDate + 'T07:00:00');
      const eDate = new Date(task.endDate + 'T16:00:00');
      const durationDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000));
      const sIso = task.startDate + 'T07:00:00';
      const eIso = task.endDate + 'T16:00:00';

      const tTime = ref(); lines.push(`${tTime}=IFCTASKTIME('${escapeIfcString(task.workDesc)} Time',.PREDICTED.,$,.WORKTIME.,'P0Y0M${durationDays}D','${sIso}','${sIso}','${sIso}','${eIso}','${sIso}','${eIso}','P0Y0M0D','P0Y0M0D',.F.,$,$,$,$,$,${(task.progress / 100).toFixed(2)});`);
      const tRef = ref(); lines.push(`${tRef}=IFCTASK('${makeIfcGuid()}',${ownerRef},'${escapeIfcString(task.workDesc)}',$,$,'${i + 1}',$,$,$,.F.,$,${tTime},.CONSTRUCTION.);`);
      taskMap.set(task.workDesc, tRef);
      allTaskRefs.push(tRef);

      const pTaskVal = ref(); lines.push(`${pTaskVal}=IFCPROPERTYSINGLEVALUE('InternalTaskId',$,IFCTEXT('${task.id}'),$);`);
      const pTaskSet = ref(); lines.push(`${pTaskSet}=IFCPROPERTYSET('${makeIfcGuid()}',${ownerRef},'OPS_TaskIdentity',$,(${pTaskVal}));`);
      const relTaskProp = ref(); lines.push(`${relTaskProp}=IFCRELDEFINESBYPROPERTIES('${makeIfcGuid()}',${ownerRef},$,$,(${tRef}),${pTaskSet});`);

      if (task.resourceDesc) {
        const resGuid = makeIfcGuid();
        const laborRef = ref(); lines.push(`${laborRef}=IFCLABORRESOURCE('${resGuid}',${ownerRef},'${escapeIfcString(task.resourceDesc)}',$,$,$,$,$,.USERDEFINED.);`);
        const pUnits = ref(); lines.push(`${pUnits}=IFCPROPERTYSINGLEVALUE('MaxUnits',$,IFCREAL(${task.resourceCount || 1}),$);`);
        const pColor = ref(); lines.push(`${pColor}=IFCPROPERTYSINGLEVALUE('Color',$,IFCTEXT('${task.color || "#38bdf8"}'),$);`);
        const pResSet = ref(); lines.push(`${pResSet}=IFCPROPERTYSET('${makeIfcGuid()}',${ownerRef},'OPS_Resource',$,(${pUnits},${pColor}));`);
        const relResProp = ref(); lines.push(`${relResProp}=IFCRELDEFINESBYPROPERTIES('${makeIfcGuid()}',${ownerRef},$,$,(${laborRef}),${pResSet});`);

        const relAssign = ref(); lines.push(`${relAssign}=IFCRELASSIGNSTOPROCESS('${makeIfcGuid()}',${ownerRef},$,$,(${laborRef}),$,${tRef},$);`);
        const pAssignVal = ref(); lines.push(`${pAssignVal}=IFCPROPERTYSINGLEVALUE('${resGuid}#0',$,IFCTEXT('${task.resourceCount || 1}|UNIFORM'),$);`);
        const pAssignSet = ref(); lines.push(`${pAssignSet}=IFCPROPERTYSET('${makeIfcGuid()}',${ownerRef},'OPS_Assignments',$,(${pAssignVal}));`);
        const relAssignProp = ref(); lines.push(`${relAssignProp}=IFCRELDEFINESBYPROPERTIES('${makeIfcGuid()}',${ownerRef},$,$,(${tRef}),${pAssignSet});`);
      }
    });

    schedules4D.forEach(task => {
      if (task.predecessor && taskMap.has(task.predecessor)) {
        const predRef = taskMap.get(task.predecessor);
        const currRef = taskMap.get(task.workDesc);
        if (predRef && currRef) {
          const seqRef = ref(); lines.push(`${seqRef}=IFCRELSEQUENCE('${makeIfcGuid()}',${ownerRef},$,$,${predRef},${currRef},$,.FINISH_START.,$);`);
        }
      }
    });

    if (allTaskRefs.length > 0) {
      const relControl = ref(); lines.push(`${relControl}=IFCRELASSIGNSTOCONTROL('${makeIfcGuid()}',${ownerRef},$,$,(${allTaskRefs.join(',')}),$,${workSched});`);
    }

    const pProj1 = ref(); lines.push(`${pProj1}=IFCPROPERTYSINGLEVALUE('InternalProjectId',$,IFCTEXT('proj-bimbam-4d'),$);`);
    const pProj2 = ref(); lines.push(`${pProj2}=IFCPROPERTYSINGLEVALUE('DefaultTaskDurationUnit',$,IFCLABEL('days'),$);`);
    const pProj3 = ref(); lines.push(`${pProj3}=IFCPROPERTYSINGLEVALUE('ProjectStartDate',$,IFCDATE('${minStartIso.slice(0, 10)}'),$);`);
    const pProjSet = ref(); lines.push(`${pProjSet}=IFCPROPERTYSET('${makeIfcGuid()}',${ownerRef},'OPS_ProjectSettings',$,(${pProj1},${pProj2},${pProj3}));`);
    const relProjProp = ref(); lines.push(`${relProjProp}=IFCRELDEFINESBYPROPERTIES('${makeIfcGuid()}',${ownerRef},$,$,(${projRef}),${pProjSet});`);

    const ifcContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [SchedulingView]'),'2;1');
FILE_NAME('BIM_BAM_Schedule_OpenPlannerStudio.ifc','${nowIso}',('Contractor'),('BIM BAM Construction'),'Open Planner Studio 0.1','Open Planner Studio','');
FILE_SCHEMA(('IFC4X3'));
ENDSEC;
DATA;
${lines.join('\n')}
ENDSEC;
END-ISO-10303-21;
`;

    const blob = new Blob([ifcContent], { type: 'application/x-step' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BIM_BAM_Schedule_OpenPlannerStudio_${today4D}.ifc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function escapeIfcString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "''");
  }

  function escapeXml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Draft & Export event bindings
  if (btn4dSaveDraft) btn4dSaveDraft.addEventListener('click', saveScheduleDraftJson);
  if (btnRibbonSaveDraft) btnRibbonSaveDraft.addEventListener('click', saveScheduleDraftJson);

  if (input4dImportDraft) {
    input4dImportDraft.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImportDraftFile(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  if (btn4dImportDraft) {
    btn4dImportDraft.addEventListener('click', () => {
      if (input4dImportDraft) input4dImportDraft.click();
    });
  }
  if (btnRibbonImportDraft) {
    btnRibbonImportDraft.addEventListener('click', () => {
      if (input4dImportDraft) input4dImportDraft.click();
    });
  }

  if (btn4dExportOds) btn4dExportOds.addEventListener('click', exportScheduleToOds);
  if (btnRibbonExportOds) btnRibbonExportOds.addEventListener('click', exportScheduleToOds);
  if (btn4dExportIfc) btn4dExportIfc.addEventListener('click', exportScheduleToOpenPlannerStudioIfc);
  if (btnRibbonExportIfc) btnRibbonExportIfc.addEventListener('click', exportScheduleToOpenPlannerStudioIfc);

  // Register 4D Scheduling onto bimBamApi
  if (window.bimBamApi) {
    window.bimBamApi.getScheduleTasks = () => ({
      success: true,
      today: today4D,
      count: schedules4D.length,
      tasks: schedules4D
    });
    window.bimBamApi.createScheduleTask = (taskData) => {
      if (!taskData || !taskData.workDesc) return { success: false, error: "Work description required." };
      const newTask = {
        id: 'task-' + Date.now(),
        workDesc: taskData.workDesc,
        startDate: taskData.startDate || today4D,
        endDate: taskData.endDate || today4D,
        resourceId: taskData.resourceId || '',
        resourceDesc: taskData.resourceDesc || '',
        resourceCount: Number(taskData.resourceCount) || 1,
        color: taskData.color || '#38bdf8',
        predecessor: taskData.predecessor || '',
        progress: Number(taskData.progress) || 0,
        elementIds: taskData.elementIds || [],
        elementGlobalIds: (taskData.elementIds || []).map(id => getElementGlobalId(id))
      };
      schedules4D.push(newTask);
      saveSchedules4D();
      renderGantt();
      return { success: true, task: newTask, message: `Created task "${newTask.workDesc}".` };
    };
    window.bimBamApi.updateScheduleTask = (taskId, updates) => {
      const task = schedules4D.find(t => t.id === taskId);
      if (!task) return { success: false, error: `Task ${taskId} not found.` };
      Object.assign(task, updates);
      if (updates.elementIds) {
        task.elementGlobalIds = task.elementIds.map(id => getElementGlobalId(id));
      }
      saveSchedules4D();
      renderGantt();
      return { success: true, task, message: `Updated task "${task.workDesc}".` };
    };
    window.bimBamApi.deleteScheduleTask = (taskId) => {
      const idx = schedules4D.findIndex(t => t.id === taskId);
      if (idx === -1) return { success: false, error: `Task ${taskId} not found.` };
      const removed = schedules4D.splice(idx, 1);
      saveSchedules4D();
      renderGantt();
      return { success: true, message: `Deleted task "${removed[0].workDesc}".` };
    };
    window.bimBamApi.setScheduleToday = (todayDate) => {
      if (!todayDate) return { success: false, error: "Date string required (YYYY-MM-DD)." };
      today4D = todayDate;
      if (input4dToday) input4dToday.value = today4D;
      renderGantt();
      return { success: true, today: today4D, message: `Set reference Today date to ${today4D}.` };
    };
    window.bimBamApi.toggleChronologySimulation = (enabled) => {
      chronologyActive = (enabled !== undefined) ? !!enabled : !chronologyActive;
      if (btn4dToggleChronology) {
        btn4dToggleChronology.innerHTML = chronologyActive ? '<i class="fa-solid fa-eye"></i> Chronology: On' : '<i class="fa-solid fa-eye-slash"></i> Chronology: Off';
      }
      if (chronologyControlsWrap) {
        chronologyControlsWrap.style.display = chronologyActive ? 'flex' : 'none';
      }
      if (!chronologyActive) {
        stopChronologyPlay();
        restoreChronologyModelColors();
      }
      return { success: true, chronologyActive, message: `Chronology simulation is now ${chronologyActive ? 'ON' : 'OFF'}.` };
    };
    window.bimBamApi.setChronologySimulationDate = (date) => {
      currentSimDate = date;
      applyChronologyColorsForDate(date);
      if (lbl4dChronologyDate) lbl4dChronologyDate.textContent = date;
      renderGantt();
      return { success: true, simDate: date, message: `Set simulation date to ${date}.` };
    };
    window.bimBamApi.saveScheduleDraftJson = saveScheduleDraftJson;
    window.bimBamApi.exportScheduleToOds = exportScheduleToOds;
    window.bimBamApi.exportScheduleToOpenPlannerStudioIfc = exportScheduleToOpenPlannerStudioIfc;
  }

  // Initialize data
  loadLaborResources();
  loadSchedules4D();
}

// --- FastMCP Poller & Dispatcher ---
function setupMcpPolling() {
  let isPolling = false;
  async function pollMcp() {
    if (isPolling) return;
    isPolling = true;
    try {
      const res = await fetch('/api/mcp/poll');
      if (res.ok) {
        const data = await res.json();
        if (data && data.call) {
          const { callId, tool, args } = data.call;
          console.log(`[FastMCP] Dispatching tool "${tool}" with:`, args);
          let result = { success: false, error: `Tool "${tool}" is not registered in bimBamApi.` };
          if (window.bimBamApi && typeof window.bimBamApi[tool] === 'function') {
            try {
              const out = await window.bimBamApi[tool](args || {});
              result = (out !== undefined) ? out : { success: true };
            } catch (err) {
              result = { success: false, error: err.message || String(err) };
            }
          }
          await fetch('/api/mcp/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId, result })
          });
        }
      }
    } catch (e) {
      // Ignore background poll errors
    } finally {
      isPolling = false;
      setTimeout(pollMcp, 400);
    }
  }
  pollMcp();
}

startApp();
