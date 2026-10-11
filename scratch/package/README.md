# @datadrivenconstruction/cad2data

**CAD/BIM converter pipeline** — convert Revit, IFC, DWG, DGN files to structured Excel/DAE/PDF data with validation and quantity takeoff.

[![npm version](https://img.shields.io/npm/v/@datadrivenconstruction/cad2data.svg)](https://www.npmjs.com/package/@datadrivenconstruction/cad2data)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Windows | Linux](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue.svg)]()

> Part of the [Data Driven Construction](https://datadrivenconstruction.io) ecosystem

## Supported Formats

| Input    | Output          | Windows Converter   | Linux Converter       |
| -------- | --------------- | ------------------- | --------------------- |
| `.rvt`   | XLSX, DAE, PDF  | RvtExporter.exe     | ddc-rvtconverter      |
| `.ifc`   | XLSX, DAE       | IfcExporter.exe     | ddc-ifcconverter      |
| `.dwg`   | XLSX, PDF       | DwgExporter.exe     | ddc-dwgconverter      |
| `.dgn`   | XLSX            | DgnExporter.exe     | ddc-dgnconverter      |
| `.rvt`   | IFC 2x3/4/4x3  | RVT2IFCconverter.exe| ddc-rvt2ifcconverter  |

**Revit versions**: 2015–2026 &bull; **IFC versions**: 2x3, 4.x &bull; **DWG**: 1983–2026 &bull; **DGN**: v7–v8

## Requirements

### Windows
- **Node.js** >= 16
- [Microsoft Visual C++ Redistributable 2015–2022 (x64)](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)

### Linux
- **Node.js** >= 16
- Debian/Ubuntu-based distribution (converters are `.deb` packages)

## Installation

```bash
npm install -g @datadrivenconstruction/cad2data
```

### Setup Converters

The package auto-detects your platform (Windows/Linux) and downloads the correct converters:

```bash
# Download and install converters from GitHub
cad2data setup

# Check installation status
cad2data list
```

#### Linux — alternative system-wide install

On Linux, you can also install converters system-wide via `.deb` packages:

```bash
cad2data setup
sudo dpkg -i $(npm root -g)/@datadrivenconstruction/cad2data/converters/DDC_Converters_Linux_Packages/*.deb
```

## CLI Usage

```bash
# Convert a single file
cad2data convert Model.rvt
cad2data convert Model.rvt --mode standard --bbox
cad2data convert Model.ifc -o ./output/

# Convert Revit to IFC
cad2data rvt2ifc Model.rvt --ifc-version 4x3

# Batch convert a directory
cad2data batch /projects --format .rvt --format .ifc -r

# Download converters from GitHub
cad2data setup

# List available converters
cad2data list

# Shorthand — pass file directly
cad2data Model.rvt
```

### Convert Options

| Flag                    | Description                        |
| ----------------------- | ---------------------------------- |
| `--output, -o <path>`   | Output file or directory           |
| `--mode, -m <mode>`     | `basic` / `standard` / `complete`  |
| `--bbox`                | Include bounding box data          |
| `--room`                | Include room data                  |
| `--schedule`            | Export schedules                   |
| `--sheets2pdf`          | Export sheets to PDF               |
| `--no-xlsx`             | Skip XLSX generation               |
| `--no-collada`          | Skip DAE/Collada generation        |
| `--category-file <path>`| Category filter file               |
| `--timeout <ms>`        | Timeout in milliseconds            |

### Export Modes

- **basic** — 309 categories
- **standard** — 724 categories
- **complete** — all 1209 categories

## Node.js API

```js
const { CAD2Data } = require('@datadrivenconstruction/cad2data');
const cad = new CAD2Data();

// Single file conversion (works on both Windows and Linux)
const result = await cad.convert('/projects/Model.rvt', {
  mode: 'standard',
  bbox: true,
  room: true,
});

// Revit to IFC
await cad.convertRevitToIfc('Model.rvt', {
  ifcVersion: '4x3',
  outputFile: 'Model.ifc',
});

// Batch conversion
const { results, errors } = await cad.batch('/projects', {
  formats: ['.rvt', '.ifc'],
  recursive: true,
  onProgress: (file, i, total) => console.log(`[${i}/${total}] ${file}`),
});

// Check installed converters
const converters = cad.listConverters();
console.log(converters);
```

### API Reference

#### `cad.convert(inputFile, options?)`

Convert a single CAD/BIM file.

- `inputFile` — path to `.rvt` / `.ifc` / `.dwg` / `.dgn`
- `options.outputDir` — output directory
- `options.outputFile` — explicit output path
- `options.mode` — `'basic'` | `'standard'` | `'complete'`
- `options.bbox` — include bounding box
- `options.room` — include room data
- `options.schedule` — export schedules
- `options.sheets2pdf` — export sheets to PDF
- `options.noXlsx` — skip Excel output
- `options.noCollada` — skip DAE output
- `options.timeout` — timeout in ms

Returns `Promise<{ stdout, stderr }>`

#### `cad.convertRevitToIfc(inputFile, options?)`

Convert Revit file to IFC format.

- `options.outputFile` — output `.ifc` path
- `options.ifcVersion` — `'2x3'` | `'4'` | `'4x3'`

#### `cad.batch(dir, options?)`

Batch convert all supported files in a directory.

- `options.formats` — filter extensions, e.g. `['.rvt', '.ifc']`
- `options.recursive` — scan subdirectories
- `options.convertOpts` — options for each conversion
- `options.onProgress` — `(file, index, total) => void`

Returns `Promise<{ results, errors, total }>`

#### `cad.listConverters()`

Returns array of available converters with installation status.

## n8n Workflows

This package includes pre-built [n8n](https://n8n.io) workflow templates in the `workflows/` directory:

1. Basic Revit/IFC/DWG conversion
2. All settings configuration
3. Batch converter pipeline
4. CAD/BIM data validation
5. AI classification with LLM and RAG
6. Construction price estimation with LLM
7. Carbon footprint / CO2 estimator
8. Phase extraction with XLSX parsing
9. Quantity takeoff HTML report generator

Import them into your n8n instance from the `workflows/` folder.

## Links

- [GitHub Repository](https://github.com/datadrivenconstruction/cad2data-Revit-IFC-DWG-DGN-pipeline-with-conversion-validation-qto)
- [DataDrivenConstruction.io](https://datadrivenconstruction.io)
- [Converter Downloads](https://datadrivenconstruction.io/convertors/)

## License

MIT — see [LICENSE](LICENSE)
