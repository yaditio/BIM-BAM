const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'bimbam.db');
const db = new DatabaseSync(dbPath);

console.log(`[Database] Initialized SQLite database at ${dbPath}`);

// Initialize schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ifc_elements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      global_id TEXT NOT NULL,
      ifc_type TEXT NOT NULL,
      name TEXT,
      storey TEXT,
      zone TEXT,
      material TEXT,
      volume REAL DEFAULT 0.0,
      area REAL DEFAULT 0.0,
      surface_area REAL DEFAULT 0.0,
      length REAL DEFAULT 0.0,
      count INTEGER DEFAULT 1,
      properties TEXT,
      ifc_type_override TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quantity_overrides (
      id TEXT PRIMARY KEY,
      element_id TEXT NOT NULL,
      quantity_name TEXT NOT NULL,
      calculated_value REAL NOT NULL,
      override_value REAL NOT NULL,
      reason TEXT,
      updated_by TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (element_id) REFERENCES ifc_elements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS classification_overrides (
      project_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      classification_code TEXT NOT NULL,
      PRIMARY KEY (project_id, element_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS classifications (
      code TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      category TEXT NOT NULL,
      source_title TEXT
    );

    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      ifc_type TEXT NOT NULL,
      material_filter TEXT,
      classification_code TEXT NOT NULL,
      quantity_expression TEXT NOT NULL,
      priority INTEGER DEFAULT 10,
      FOREIGN KEY (classification_code) REFERENCES classifications(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ahsp_analyses (
      code TEXT PRIMARY KEY,
      classification_code TEXT NOT NULL,
      description TEXT NOT NULL,
      overhead_factor REAL DEFAULT 0.10,
      source_title TEXT,
      FOREIGN KEY (classification_code) REFERENCES classifications(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL, -- 'Labor', 'Material', 'Equipment'
      description TEXT NOT NULL,
      unit TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ahsp_details (
      id TEXT PRIMARY KEY,
      ahsp_code TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      coefficient REAL NOT NULL,
      waste_factor REAL DEFAULT 1.0,
      FOREIGN KEY (ahsp_code) REFERENCES ahsp_analyses(code) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resource_prices (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL,
      region_id TEXT NOT NULL,
      price REAL NOT NULL,
      effective_date TEXT NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE,
      UNIQUE(resource_id, region_id)
    );

    CREATE TABLE IF NOT EXISTS boq_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      classification_code TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      source_title TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (classification_code) REFERENCES classifications(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS catalog_metadata (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT,
      region TEXT,
      author TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS validation_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      issues_count INTEGER,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Schema migrations for backward compatibility
  try {
    db.exec("ALTER TABLE classifications ADD COLUMN source_title TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE ahsp_analyses ADD COLUMN source_title TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE boq_items ADD COLUMN source_title TEXT;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE ifc_elements ADD COLUMN ifc_type_override TEXT;");
  } catch (e) {}

  preloadDefaults();
}

function preloadDefaults() {
  // Check if regions table has data
  const check = db.prepare('SELECT COUNT(*) as count FROM regions').get();
  if (check.count > 0) return; // already preloaded

  console.log('[Database] Preloading default AHSP definitions, resources, and region prices...');

  // Regions
  const insertRegion = db.prepare('INSERT INTO regions (id, name) VALUES (?, ?)');
  insertRegion.run('R-JKT', 'Jakarta');
  insertRegion.run('R-BDG', 'Bandung');
  insertRegion.run('R-SBY', 'Surabaya');
  insertRegion.run('R-PAP', 'Papua');

  // Resources
  const insertResource = db.prepare('INSERT INTO resources (id, category, description, unit) VALUES (?, ?, ?, ?)');
  // Labor
  insertResource.run('L-WRK', 'Labor', 'Pekerja (Worker)', 'day');
  insertResource.run('L-MSN', 'Labor', 'Tukang Batu (Mason)', 'day');
  insertResource.run('L-FRM', 'Labor', 'Kepala Tukang (Foreman)', 'day');
  insertResource.run('L-SUP', 'Labor', 'Mandor (Supervisor)', 'day');
  // Materials
  insertResource.run('M-CEM', 'Material', 'Semen Portland (Cement)', 'kg');
  insertResource.run('M-SND', 'Material', 'Pasir Beton (Sand)', 'm³');
  insertResource.run('M-GRV', 'Material', 'Kerikil / Split (Aggregate)', 'm³');
  insertResource.run('M-WTR', 'Material', 'Air (Water)', 'liter');
  insertResource.run('M-RMX', 'Material', 'Beton Ready Mix fc 25 MPa', 'm³');
  insertResource.run('M-STL', 'Material', 'Besi Tulangan U-24 (Steel)', 'kg');
  insertResource.run('M-TMB', 'Material', 'Kayu Kelas III (Formwork Timber)', 'm³');
  insertResource.run('M-NLS', 'Material', 'Paku (Nails)', 'kg');
  // Equipment
  insertResource.run('E-EXC', 'Equipment', 'Excavator Rental', 'hour');
  insertResource.run('E-MXR', 'Equipment', 'Concrete Mixer Rental', 'hour');

  // Resource Prices per Region
  const insertPrice = db.prepare('INSERT INTO resource_prices (id, resource_id, region_id, price, effective_date) VALUES (?, ?, ?, ?, ?)');
  const prices = {
    'R-JKT': { 'L-WRK': 120000, 'L-MSN': 150000, 'L-FRM': 180000, 'L-SUP': 200000, 'M-CEM': 1500, 'M-SND': 250000, 'M-GRV': 300000, 'M-WTR': 100, 'M-RMX': 950000, 'M-STL': 15000, 'M-TMB': 3000000, 'M-NLS': 20000, 'E-EXC': 250000, 'E-MXR': 50000 },
    'R-BDG': { 'L-WRK': 100000, 'L-MSN': 130000, 'L-FRM': 150000, 'L-SUP': 170000, 'M-CEM': 1400, 'M-SND': 220000, 'M-GRV': 280000, 'M-WTR': 80,  'M-RMX': 900000, 'M-STL': 14500, 'M-TMB': 2800000, 'M-NLS': 18000, 'E-EXC': 230000, 'E-MXR': 45000 },
    'R-SBY': { 'L-WRK': 110000, 'L-MSN': 140000, 'L-FRM': 160000, 'L-SUP': 180000, 'M-CEM': 1450, 'M-SND': 230000, 'M-GRV': 290000, 'M-WTR': 90,  'M-RMX': 920000, 'M-STL': 14800, 'M-TMB': 2900000, 'M-NLS': 19000, 'E-EXC': 240000, 'E-MXR': 48000 },
    'R-PAP': { 'L-WRK': 180000, 'L-MSN': 220000, 'L-FRM': 250000, 'L-SUP': 280000, 'M-CEM': 3500, 'M-SND': 500000, 'M-GRV': 600000, 'M-WTR': 300, 'M-RMX': 1800000, 'M-STL': 25000, 'M-TMB': 5000000, 'M-NLS': 35000, 'E-EXC': 450000, 'E-MXR': 90000 }
  };

  for (const regionId in prices) {
    for (const resId in prices[regionId]) {
      insertPrice.run(`${regionId}-${resId}`, resId, regionId, prices[regionId][resId], '2026-07-23');
    }
  }

  // Classifications (Indonesian Standard BOQ / Work Items)
  const insertClassification = db.prepare('INSERT INTO classifications (code, description, unit, category) VALUES (?, ?, ?, ?)');
  insertClassification.run('A.2.2.1', 'Galian Tanah Biasa Kedalaman 1 meter (Common excavation depth 1m)', 'm³', 'Earthworks');
  insertClassification.run('A.4.1.1', 'Pengecoran Beton Mutu fc 25 MPa dengan Ready Mix (Concrete Casting fc 25 MPa)', 'm³', 'Concrete Work');
  insertClassification.run('A.4.1.2', 'Pembesian dengan Besi Polos (Steel Reinforcement)', 'kg', 'Concrete Work');
  insertClassification.run('A.4.1.3', 'Pemasangan Bekisting untuk Balok/Kolom (Formwork for Beams/Columns)', 'm²', 'Concrete Work');

  // AHSP Analyses (Coefficients mapping)
  const insertAHSP = db.prepare('INSERT INTO ahsp_analyses (code, classification_code, description, overhead_factor) VALUES (?, ?, ?, ?)');
  insertAHSP.run('AHSP-EXC', 'A.2.2.1', 'Analisis Galian Tanah Biasa per m³', 0.10);
  insertAHSP.run('AHSP-CONC', 'A.4.1.1', 'Analisis Beton Ready Mix fc 25 MPa per m³', 0.10);
  insertAHSP.run('AHSP-REBAR', 'A.4.1.2', 'Analisis Pembesian per kg', 0.10);
  insertAHSP.run('AHSP-FORM', 'A.4.1.3', 'Analisis Pasang Bekisting per m²', 0.10);

  // AHSP Details (Resource coefficients)
  const insertDetail = db.prepare('INSERT INTO ahsp_details (id, ahsp_code, resource_id, coefficient, waste_factor) VALUES (?, ?, ?, ?, ?)');
  
  // Earthwork details (1 m³ excavation)
  insertDetail.run('D-EXC-1', 'AHSP-EXC', 'L-WRK', 0.75, 1.0);  // 0.75 workers/day
  insertDetail.run('D-EXC-2', 'AHSP-EXC', 'L-SUP', 0.025, 1.0); // 0.025 supervisor/day

  // Concrete casting details (1 m³ fc 25 ready mix)
  insertDetail.run('D-CONC-1', 'AHSP-CONC', 'M-RMX', 1.05, 1.0);  // 1.05 m³ ready mix (5% waste)
  insertDetail.run('D-CONC-2', 'AHSP-CONC', 'L-WRK', 0.165, 1.0); // workers
  insertDetail.run('D-CONC-3', 'AHSP-CONC', 'L-MSN', 0.0275, 1.0); // mason
  insertDetail.run('D-CONC-4', 'AHSP-CONC', 'L-SUP', 0.0083, 1.0); // foreman/supervisor

  // Rebar details (1 kg steel)
  insertDetail.run('D-REBAR-1', 'AHSP-REBAR', 'M-STL', 1.05, 1.0);  // 1.05 kg steel (5% waste)
  insertDetail.run('D-REBAR-2', 'AHSP-REBAR', 'L-WRK', 0.007, 1.0);  // workers
  insertDetail.run('D-REBAR-3', 'AHSP-REBAR', 'L-MSN', 0.007, 1.0);  // masons
  insertDetail.run('D-REBAR-4', 'AHSP-REBAR', 'L-SUP', 0.0004, 1.0); // supervisor

  // Formwork details (1 m² formwork)
  insertDetail.run('D-FORM-1', 'AHSP-FORM', 'M-TMB', 0.04, 1.05);   // timber m³
  insertDetail.run('D-FORM-2', 'AHSP-FORM', 'M-NLS', 0.3, 1.0);     // nails kg
  insertDetail.run('D-FORM-3', 'AHSP-FORM', 'L-WRK', 0.52, 1.0);    // workers
  insertDetail.run('D-FORM-4', 'AHSP-FORM', 'L-MSN', 0.26, 1.0);    // masons
  insertDetail.run('D-FORM-5', 'AHSP-FORM', 'L-SUP', 0.026, 1.0);   // supervisor

  // Default Calculation Rules
  const insertRule = db.prepare('INSERT INTO rules (id, rule_name, ifc_type, material_filter, classification_code, quantity_expression, priority) VALUES (?, ?, ?, ?, ?, ?, ?)');
  
  // Beam rules
  insertRule.run('R-BEAM-CONC', 'Concrete Beam Casting', 'IfcBeam', null, 'A.4.1.1', 'volume', 10);
  insertRule.run('R-BEAM-REBAR', 'Concrete Beam Rebar', 'IfcBeam', null, 'A.4.1.2', 'volume * 135.0', 10);
  insertRule.run('R-BEAM-FORM', 'Concrete Beam Formwork', 'IfcBeam', null, 'A.4.1.3', 'surface_area', 10);

  // Column rules
  insertRule.run('R-COL-CONC', 'Concrete Column Casting', 'IfcColumn', null, 'A.4.1.1', 'volume', 10);
  insertRule.run('R-COL-REBAR', 'Concrete Column Rebar', 'IfcColumn', null, 'A.4.1.2', 'volume * 150.0', 10);
  insertRule.run('R-COL-FORM', 'Concrete Column Formwork', 'IfcColumn', null, 'A.4.1.3', 'surface_area', 10);

  // Slab/Floor rules
  insertRule.run('R-SLAB-CONC', 'Concrete Slab Casting', 'IfcSlab', null, 'A.4.1.1', 'volume', 10);
  insertRule.run('R-SLAB-REBAR', 'Concrete Slab Rebar', 'IfcSlab', null, 'A.4.1.2', 'volume * 90.0', 10);
  insertRule.run('R-SLAB-FORM', 'Concrete Slab Formwork', 'IfcSlab', null, 'A.4.1.3', 'area', 10);

  // Excavation rules (IfcFooting or structural foundation triggers excavation volume)
  insertRule.run('R-FOOT-EXC', 'Foundation Excavation', 'IfcFooting', null, 'A.2.2.1', 'volume * 1.5', 10);
  insertRule.run('R-FOOT-CONC', 'Foundation Concrete', 'IfcFooting', null, 'A.4.1.1', 'volume', 10);
  insertRule.run('R-FOOT-FORM', 'Foundation Formwork', 'IfcFooting', null, 'A.4.1.3', 'surface_area', 10);
}

// Initial Call
initSchema();

module.exports = {
  db,
  query(sql, params = []) {
    return db.prepare(sql).all(...params);
  },
  get(sql, params = []) {
    return db.prepare(sql).get(...params);
  },
  run(sql, params = []) {
    return db.prepare(sql).run(...params);
  },
  transaction(callback) {
    db.exec('BEGIN TRANSACTION');
    try {
      callback();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
};
