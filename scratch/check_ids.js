import fs from 'fs';

const content = fs.readFileSync('main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const matches = [...content.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)];
const ids = Array.from(new Set(matches.map(m => m[1])));

const missing = ids.filter(id => !html.includes(`id="${id}"`) && !html.includes(`id='${id}'`));

console.log('Total unique getElementById in main.js:', ids.length);
console.log('IDs in main.js NOT present in index.html:', missing);
