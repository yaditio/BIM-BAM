# BIM BAM - Premium IFC & XKT Viewer

BIM BAM is a modern, high-performance web-based Building Information Modeling (BIM) viewer built with **Xeokit SDK**, **Vite**, and **Express**. It provides advanced features for loading, converting, viewing, and querying IFC models directly in the web browser, with professional tools for estimation, measurements, and georeferencing.

---

## 🚀 Key Features

### 1. Model Loading & Formats
* **Dual Format Support**: Load standard industry `.ifc` models or highly compressed, web-optimized `.xkt` (Xeokit) files.
* **Dual Client-side Engines**:
  * **Web-IFC**: Ultra-fast WebAssembly-based parsing.
  * **IfcOpenShell (via Pyodide)**: Run Python-based IFC parsing directly in your browser.
* **Append Mode**: Load multiple BIM models concurrently in the same viewport.

### 2. High-Performance Conversion API
* An integrated **Express backend** processes uploaded `.ifc` files, converts them to `.xkt` on the fly using `@xeokit/xeokit-convert`, and streams the optimized file back to the browser for instant visualization.

### 3. Model Explorer & Properties Panel
* **Model Tree**: Structural spatial hierarchy panel with checkboxes to toggle element visibility, synchronized dynamically with 3D model clicks.
* **Properties Inspector**: Detailed overview of attributes, properties, and custom quantities grouped by IFC Property Sets.
* **Similar Selection**: Select all objects matching the selected component's IFC Type (e.g. all columns or standard wall cases) with one click.

### 4. Real-time Analysis & Sections
* **Interactive Section Planes**: Slice models using 3D cut planes. Add planes by clicking directly on surfaces or centering them automatically, and manipulate them using built-in translation gizmos.
* **Visibility Controls**: Hide, isolate, or show all elements instantly.

### 5. Quantity Take-Off (QTO)
* Scan model properties to harvest structural quantities (Volume, Area, Count, etc.).
* Review materials and sizes in a searchable, filterable spreadsheet-like modal interface.
* **Export to CSV** for integration with external estimators and spreadsheet software.

### 6. Measurement Toolbar
* **Distance**: Measure direct 3D vertex-to-vertex distances.
* **Multiline**: Measure accumulated chain lengths.
* **Angle**: Calculate angles between surfaces or vectors.
* **Area**: Calculate closed surface areas.
* **Spot Elevation**: Query exact XYZ coordinates and heights of point-selections.
* **Vertex Snapping**: Active snapping for precise architectural measurements.

### 7. Georeferencing & Cesium Globe Integration
* Georeference your models using **Easting (X)**, **Northing (Y)**, **True North Angle**, **EPSG Coordinate Systems**, and **Vertical Datum**.
* Project the georeferenced model onto an interactive 3D **Cesium Globe** dynamically to visualize your building in its real-world geographical context.

---

## 📁 Project Structure

```text
├── lib/
│   └── xeokit/
│       ├── web-ifc.wasm               # Client WebAssembly IFC parser
│       └── xeokit-sdk.min.es.js       # Core Xeokit SDK build
├── public/
│   ├── Duplex.ifc                     # Default demo model (Duplex house)
│   ├── IfcOpenHouse2x3.ifc            # Secondary demo model (Open house)
│   └── lib/                           # Place custom static assets here
├── uploads/                           # Backend folder for transient IFC uploads (git-ignored)
│   └── .gitkeep
├── scratch/                           # Diagnostic and helper scripts
│   ├── check-exports.mjs
│   └── inspect-exports.mjs
├── index.html                         # Client UI markup structure
├── main.js                            # Frontend application coordinator
├── style.css                          # Premium dark-theme glassmorphism stylesheet
├── server.js                          # Express.js backend for XKT conversion
├── vite.config.js                     # Vite proxy & server configuration
├── verify-p2.mjs                      # Playwright automated integration tests
├── .gitignore                         # Configured git ignore definitions
└── package.json                       # Scripts, dependencies, and configuration
```

---

## 🛠️ Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* A modern web browser supporting WebGL2 and WebAssembly (Chrome, Edge, Firefox, or Safari)

### Installation
1. Clone this repository to your local machine:
   ```bash
   git clone <your-repository-url>
   cd bim-bam
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```

### Running the Application
To run the frontend and backend concurrently in development mode:
```bash
npm run dev
```

* The **Vite Frontend Server** runs at `http://localhost:3000`.
* The **Express Backend Server** runs at `http://localhost:5000` (API calls are proxied automatically).

Open your browser to [http://localhost:3000](http://localhost:3000) to start using the app.

---

## 🧪 Running Automated Tests
The repository includes a comprehensive Playwright test script (`verify-p2.mjs`) to validate frontend features, viewer status, QTO modal exports, measurements, multi-model loading, georeference states, and Cesium globe switches.

1. Ensure the development server is running on port 3000.
2. Run the test command:
   ```bash
   node verify-p2.mjs
   ```

---

## 📄 License
This project is licensed under the GNU Affero General Public License v3.0 (AGPLv3) - see the [LICENSE](file:///e:/Documents/Practice/xeokit/BIM%20BAM/LICENSE) file for details.
