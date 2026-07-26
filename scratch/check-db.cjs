const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('bimbam.db');

try {
  const counts = db.prepare('SELECT project_id, COUNT(*) as count FROM ifc_elements GROUP BY project_id').all();
  console.log('ifc_elements count grouped by project_id:', counts);

  const projects = db.prepare('SELECT id, name FROM projects').all();
  console.log('All projects:', projects);
} catch (e) {
  console.error(e);
}
