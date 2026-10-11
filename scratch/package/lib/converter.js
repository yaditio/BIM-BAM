'use strict';

const { execFile } = require('child_process');
const path = require('path');
const {
  getConverterPath,
  getRvt2IfcPath,
  converterExists,
  resolveInputFile,
  getFileExtension,
  SUPPORTED_EXTENSIONS,
} = require('./utils');

class ConversionError extends Error {
  constructor(message, code, stderr) {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
    this.stderr = stderr;
  }
}

function execConverter(exePath, args, timeout) {
  return new Promise((resolve, reject) => {
    const opts = { maxBuffer: 50 * 1024 * 1024 };
    if (timeout) opts.timeout = timeout;

    execFile(exePath, args, opts, (error, stdout, stderr) => {
      if (error) {
        reject(new ConversionError(
          `Converter failed: ${error.message}`,
          error.code,
          stderr
        ));
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/**
 * Convert a single CAD/BIM file.
 *
 * @param {string} inputFile   — path to .rvt / .ifc / .dwg / .dgn file
 * @param {object} [options]
 * @param {string} [options.outputDir]   — output directory (default: same as input)
 * @param {string} [options.outputFile]  — explicit output file path
 * @param {string} [options.mode]        — export mode: basic | standard | complete
 * @param {boolean} [options.bbox]       — include bounding box data
 * @param {boolean} [options.room]       — include room data
 * @param {boolean} [options.schedule]   — export schedules
 * @param {boolean} [options.sheets2pdf] — export sheets to PDF
 * @param {boolean} [options.noXlsx]     — skip XLSX generation
 * @param {boolean} [options.noCollada]  — skip DAE/Collada generation
 * @param {string} [options.categoryFile]— path to category filter file
 * @param {number} [options.timeout]     — timeout in ms
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function convert(inputFile, options = {}) {
  const resolved = resolveInputFile(inputFile);
  const ext = getFileExtension(resolved);

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file format "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }

  const converterPath = getConverterPath(ext);
  if (!converterExists(converterPath)) {
    throw new Error(
      `Converter not found: ${converterPath}\n` +
      `Copy your .exe converters into the "converters" folder of the package.`
    );
  }

  const args = [resolved];

  if (options.outputFile) {
    args.push(options.outputFile);
  } else if (options.outputDir) {
    const baseName = path.basename(resolved, ext);
    args.push(path.join(options.outputDir, `${baseName}.xlsx`));
  }

  if (options.mode) args.push(options.mode);
  if (options.categoryFile) args.push(options.categoryFile);
  if (options.bbox) args.push('bbox');
  if (options.room) args.push('room');
  if (options.schedule) args.push('schedule');
  if (options.sheets2pdf) args.push('sheets2pdf');
  if (options.noXlsx) args.push('-no-xlsx');
  if (options.noCollada) args.push('-no-collada');

  return execConverter(converterPath, args, options.timeout);
}

/**
 * Convert Revit file to IFC format.
 *
 * @param {string} inputFile   — path to .rvt file
 * @param {object} [options]
 * @param {string} [options.outputFile] — output .ifc path
 * @param {string} [options.ifcVersion] — IFC version (2x3, 4, 4x3)
 * @param {number} [options.timeout]    — timeout in ms
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function convertRevitToIfc(inputFile, options = {}) {
  const resolved = resolveInputFile(inputFile);
  const ext = getFileExtension(resolved);

  if (ext !== '.rvt') {
    throw new Error('convertRevitToIfc only accepts .rvt files');
  }

  const converterPath = getRvt2IfcPath();
  if (!converterExists(converterPath)) {
    throw new Error(
      `RVT2IFC converter not found: ${converterPath}\n` +
      `Copy RVT2IFCconverter.exe into the "converters" folder.`
    );
  }

  const args = [resolved];
  if (options.outputFile) args.push(options.outputFile);
  if (options.ifcVersion) args.push(options.ifcVersion);

  return execConverter(converterPath, args, options.timeout);
}

/**
 * Batch convert all supported files in a directory.
 *
 * @param {string} dir              — directory to scan
 * @param {object} [options]
 * @param {string[]} [options.formats]   — filter by extension (e.g. ['.rvt', '.ifc'])
 * @param {boolean} [options.recursive]  — scan subdirectories
 * @param {object}  [options.convertOpts]— options passed to each convert() call
 * @param {function} [options.onProgress]— callback(file, index, total)
 * @returns {Promise<{results: Array, errors: Array}>}
 */
async function batchConvert(dir, options = {}) {
  const { findFiles } = require('./utils');
  const formats = options.formats || SUPPORTED_EXTENSIONS;
  const files = findFiles(dir, formats, options.recursive);
  const results = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (options.onProgress) {
      options.onProgress(file, i + 1, files.length);
    }
    try {
      const result = await convert(file, options.convertOpts || {});
      results.push({ file, ...result });
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  }

  return { results, errors, total: files.length };
}

module.exports = {
  convert,
  convertRevitToIfc,
  batchConvert,
  ConversionError,
};
