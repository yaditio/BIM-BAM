'use strict';

const path = require('path');
const { convert, convertRevitToIfc, batchConvert } = require('./converter');
const { listAvailableConverters, SUPPORTED_EXTENSIONS, EXPORT_MODES, findFiles } = require('./utils');
const pkg = require('../package.json');

function printHelp() {
  console.log(`
  cad2data v${pkg.version}
  CAD/BIM converter pipeline — Revit, IFC, DWG, DGN

  USAGE:
    cad2data convert <file>       Convert a single file
    cad2data rvt2ifc <file>       Convert Revit to IFC
    cad2data batch <directory>    Batch convert all files in directory
    cad2data setup                Download converters from GitHub
    cad2data list                 Show available converters
    cad2data help                 Show this help

  OPTIONS (convert):
    --output, -o <path>     Output file or directory
    --mode, -m <mode>       Export mode: basic | standard | complete
    --bbox                  Include bounding box data
    --room                  Include room data
    --schedule              Export schedules
    --sheets2pdf            Export sheets to PDF
    --no-xlsx               Skip XLSX generation
    --no-collada            Skip DAE/Collada generation
    --category-file <path>  Category filter file
    --timeout <ms>          Timeout in milliseconds

  OPTIONS (rvt2ifc):
    --output, -o <path>     Output .ifc path
    --ifc-version <ver>     IFC version: 2x3 | 4 | 4x3
    --timeout <ms>          Timeout in milliseconds

  OPTIONS (batch):
    --format, -f <ext>      Filter by extension (e.g. .rvt .ifc), repeatable
    --recursive, -r         Scan subdirectories
    --mode, -m <mode>       Export mode for all files
    --bbox                  Include bounding box data

  SETUP:
    cad2data setup              Download all converters (~2GB) from GitHub

  EXAMPLES:
    cad2data setup
    cad2data convert Model.rvt
    cad2data convert Model.rvt --mode standard --bbox
    cad2data convert Model.ifc -o ./output/
    cad2data rvt2ifc Model.rvt --ifc-version 4x3
    cad2data batch C:\\Projects --format .rvt --format .ifc -r
    cad2data list

  MORE INFO:
    https://github.com/datadrivenconstruction/cad2data-Revit-IFC-DWG-DGN-pipeline-with-conversion-validation-qto
    https://datadrivenconstruction.io
`);
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        if (args.flags[key] !== undefined) {
          if (!Array.isArray(args.flags[key])) args.flags[key] = [args.flags[key]];
          args.flags[key].push(next);
        } else {
          args.flags[key] = next;
        }
        i += 2;
      } else {
        args.flags[key] = true;
        i += 1;
      }
    } else {
      args._.push(arg);
      i += 1;
    }
  }
  return args;
}

async function runConvert(args) {
  const file = args._[0];
  if (!file) {
    console.error('Error: No input file specified.\nUsage: cad2data convert <file>');
    process.exit(1);
  }

  const options = {};
  const f = args.flags;
  if (f.output || f.o) {
    const out = f.output || f.o;
    if (path.extname(out)) {
      options.outputFile = path.resolve(out);
    } else {
      options.outputDir = path.resolve(out);
    }
  }
  if (f.mode || f.m) options.mode = f.mode || f.m;
  if (f.bbox) options.bbox = true;
  if (f.room) options.room = true;
  if (f.schedule) options.schedule = true;
  if (f.sheets2pdf) options.sheets2pdf = true;
  if (f['no-xlsx']) options.noXlsx = true;
  if (f['no-collada']) options.noCollada = true;
  if (f['category-file']) options.categoryFile = f['category-file'];
  if (f.timeout) options.timeout = parseInt(f.timeout, 10);

  console.log(`Converting: ${file}`);
  const result = await convert(file, options);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  console.log('Done.');
}

async function runRvt2Ifc(args) {
  const file = args._[0];
  if (!file) {
    console.error('Error: No input file specified.\nUsage: cad2data rvt2ifc <file>');
    process.exit(1);
  }

  const options = {};
  const f = args.flags;
  if (f.output || f.o) options.outputFile = path.resolve(f.output || f.o);
  if (f['ifc-version']) options.ifcVersion = f['ifc-version'];
  if (f.timeout) options.timeout = parseInt(f.timeout, 10);

  console.log(`Converting Revit to IFC: ${file}`);
  const result = await convertRevitToIfc(file, options);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  console.log('Done.');
}

async function runBatch(args) {
  const dir = args._[0];
  if (!dir) {
    console.error('Error: No directory specified.\nUsage: cad2data batch <directory>');
    process.exit(1);
  }

  const f = args.flags;
  const formats = f.format || f.f;
  const formatList = formats
    ? (Array.isArray(formats) ? formats : [formats]).map(e => e.startsWith('.') ? e : `.${e}`)
    : undefined;

  const convertOpts = {};
  if (f.mode || f.m) convertOpts.mode = f.mode || f.m;
  if (f.bbox) convertOpts.bbox = true;

  const options = {
    formats: formatList,
    recursive: !!(f.recursive || f.r),
    convertOpts,
    onProgress: (file, i, total) => {
      console.log(`[${i}/${total}] ${path.basename(file)}`);
    },
  };

  console.log(`Batch converting: ${path.resolve(dir)}`);
  const { results, errors, total } = await batchConvert(dir, options);

  console.log(`\nCompleted: ${results.length}/${total} files`);
  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.error(`  ${path.basename(e.file)}: ${e.error}`);
    }
  }
}

async function runSetup() {
  const { setup } = require('./installer');
  await setup();
}

function runList() {
  const converters = listAvailableConverters();
  console.log('\nAvailable converters:\n');
  for (const c of converters) {
    const status = c.installed ? '[installed]' : '[not found]';
    console.log(`  ${c.extension.padEnd(12)} ${c.executable.padEnd(25)} ${status}`);
  }
  console.log(`\nConverters directory: ${path.resolve(__dirname, '..', 'converters')}`);
  console.log('Run "cad2data setup" to download converters from GitHub.\n');
}

async function run(argv) {
  const args = parseArgs(argv);
  const command = args._.shift();

  switch (command) {
    case 'convert':
      return runConvert(args);
    case 'rvt2ifc':
      return runRvt2Ifc(args);
    case 'batch':
      return runBatch(args);
    case 'setup':
      return runSetup();
    case 'list':
      return runList();
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      return printHelp();
    case '--version':
    case '-v':
      console.log(pkg.version);
      return;
    default:
      // If user passed a file directly without "convert", treat it as convert
      if (path.extname(command)) {
        args._.unshift(command);
        return runConvert(args);
      }
      console.error(`Unknown command: ${command}\nRun "cad2data help" for usage.`);
      process.exit(1);
  }
}

module.exports = { run };
