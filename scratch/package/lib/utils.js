'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONVERTERS_DIR = path.join(__dirname, '..', 'converters');
const IS_WINDOWS = os.platform() === 'win32';
const PLATFORM = IS_WINDOWS ? 'windows' : 'linux';

// Windows converters
const WIN_CONVERTER_MAP = {
  '.rvt': { exe: 'RvtExporter.exe', dir: 'DDC_CONVERTER_REVIT' },
  '.ifc': { exe: 'IfcExporter.exe', dir: 'DDC_CONVERTER_IFC' },
  '.dwg': { exe: 'DwgExporter.exe', dir: 'DDC_CONVERTER_DWG' },
  '.dgn': { exe: 'DgnExporter.exe', dir: 'DDC_CONVERTER_DGN' },
};
const WIN_RVT2IFC = { exe: 'RVT2IFCconverter.exe', dir: 'DDC_CONVERTER_Revit2IFC/DDC_REVIT2IFC_CONVERTER' };

// Linux converters (installed via .deb or extracted)
const LINUX_CONVERTER_MAP = {
  '.rvt': { exe: 'ddc-rvtconverter', dir: 'ddc-rvtconverter/usr/bin', systemPath: '/usr/bin/ddc-rvtconverter' },
  '.ifc': { exe: 'ddc-ifcconverter', dir: 'ddc-ifcconverter/usr/bin', systemPath: '/usr/bin/ddc-ifcconverter' },
  '.dwg': { exe: 'ddc-dwgconverter', dir: 'ddc-dwgconverter/usr/bin', systemPath: '/usr/bin/ddc-dwgconverter' },
  '.dgn': { exe: 'ddc-dgnconverter', dir: 'ddc-dgnconverter/usr/bin', systemPath: '/usr/bin/ddc-dgnconverter' },
};
const LINUX_RVT2IFC = { exe: 'ddc-rvt2ifcconverter', dir: 'ddc-rvt2ifcconverter/usr/bin', systemPath: '/usr/bin/ddc-rvt2ifcconverter' };

const CONVERTER_MAP = IS_WINDOWS ? WIN_CONVERTER_MAP : LINUX_CONVERTER_MAP;
const RVT2IFC = IS_WINDOWS ? WIN_RVT2IFC : LINUX_RVT2IFC;

const EXPORT_MODES = {
  basic: '309 categories',
  standard: '724 categories',
  complete: 'all 1209 categories',
};

const SUPPORTED_EXTENSIONS = Object.keys(CONVERTER_MAP);

function findExe(exeName, subDir, systemPath) {
  // On Linux, check system path first (installed via dpkg)
  if (!IS_WINDOWS && systemPath && fs.existsSync(systemPath)) {
    return systemPath;
  }
  // Check in subdirectory (after cad2data setup)
  const inSub = path.join(CONVERTERS_DIR, subDir, exeName);
  if (fs.existsSync(inSub)) return inSub;
  // Check directly in converters/ (manual copy)
  const direct = path.join(CONVERTERS_DIR, exeName);
  if (fs.existsSync(direct)) return direct;
  // Return subdirectory path as default
  return systemPath && !IS_WINDOWS ? systemPath : inSub;
}

function getConverterPath(ext) {
  const info = CONVERTER_MAP[ext.toLowerCase()];
  if (!info) return null;
  return findExe(info.exe, info.dir, info.systemPath);
}

function getRvt2IfcPath() {
  return findExe(RVT2IFC.exe, RVT2IFC.dir, RVT2IFC.systemPath);
}

function converterExists(converterPath) {
  return fs.existsSync(converterPath);
}

function resolveInputFile(input) {
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input file not found: ${resolved}`);
  }
  return resolved;
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function listAvailableConverters() {
  const available = [];
  for (const [ext, info] of Object.entries(CONVERTER_MAP)) {
    const fullPath = findExe(info.exe, info.dir, info.systemPath);
    available.push({
      extension: ext,
      executable: info.exe,
      installed: fs.existsSync(fullPath),
      path: fullPath,
    });
  }
  const rvt2ifcPath = getRvt2IfcPath();
  available.push({
    extension: '.rvt -> .ifc',
    executable: RVT2IFC.exe,
    installed: fs.existsSync(rvt2ifcPath),
    path: rvt2ifcPath,
  });
  return available;
}

function findFiles(dir, extensions, recursive = false) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...findFiles(fullPath, extensions, true));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

module.exports = {
  CONVERTERS_DIR,
  CONVERTER_MAP,
  EXPORT_MODES,
  SUPPORTED_EXTENSIONS,
  IS_WINDOWS,
  PLATFORM,
  getConverterPath,
  getRvt2IfcPath,
  converterExists,
  resolveInputFile,
  getFileExtension,
  listAvailableConverters,
  findFiles,
};
