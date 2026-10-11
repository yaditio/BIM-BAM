'use strict';

const { convert, convertRevitToIfc, batchConvert, ConversionError } = require('./converter');
const {
  listAvailableConverters,
  SUPPORTED_EXTENSIONS,
  EXPORT_MODES,
  CONVERTERS_DIR,
} = require('./utils');

class CAD2Data {
  /**
   * Convert a single CAD/BIM file to structured data.
   *
   * @param {string} inputFile — path to .rvt/.ifc/.dwg/.dgn file
   * @param {object} [options] — conversion options
   * @returns {Promise<{stdout: string, stderr: string}>}
   *
   * @example
   *   const cad = new CAD2Data();
   *   const result = await cad.convert('C:/Projects/Model.rvt', { mode: 'standard', bbox: true });
   */
  async convert(inputFile, options) {
    return convert(inputFile, options);
  }

  /**
   * Convert a Revit file to IFC format.
   *
   * @param {string} inputFile — path to .rvt file
   * @param {object} [options] — { outputFile, ifcVersion, timeout }
   * @returns {Promise<{stdout: string, stderr: string}>}
   *
   * @example
   *   const result = await cad.convertRevitToIfc('Model.rvt', { ifcVersion: '4x3' });
   */
  async convertRevitToIfc(inputFile, options) {
    return convertRevitToIfc(inputFile, options);
  }

  /**
   * Batch convert all supported files in a directory.
   *
   * @param {string} dir       — directory to scan
   * @param {object} [options] — { formats, recursive, convertOpts, onProgress }
   * @returns {Promise<{results: Array, errors: Array, total: number}>}
   *
   * @example
   *   const { results, errors } = await cad.batch('C:/Projects', {
   *     formats: ['.rvt', '.ifc'],
   *     recursive: true,
   *     onProgress: (file, i, total) => console.log(`[${i}/${total}] ${file}`),
   *   });
   */
  async batch(dir, options) {
    return batchConvert(dir, options);
  }

  /**
   * List available converters and their installation status.
   * @returns {Array<{extension, executable, installed, path}>}
   */
  listConverters() {
    return listAvailableConverters();
  }

  /** Supported file extensions */
  static get SUPPORTED_EXTENSIONS() {
    return SUPPORTED_EXTENSIONS;
  }

  /** Available export modes */
  static get EXPORT_MODES() {
    return EXPORT_MODES;
  }

  /** Path to converters directory */
  static get CONVERTERS_DIR() {
    return CONVERTERS_DIR;
  }
}

module.exports = { CAD2Data, convert, convertRevitToIfc, batchConvert, ConversionError };
