import fs from 'fs';

const content = fs.readFileSync('main.js', 'utf8');
const lines = content.split('\n');

const missingIds = [
  'modelTreeSection',
  'qtoBarChart',
  'activeSnapCircle',
  'activeAreaGroup',
  'activeMultilineGroup',
  'csvParamRows',
  'csvParamSelect0',
  'csvBtnAdd0',
  'csvSelectedCols',
  'csvColChips',
  'csvPreviewCount',
  'templateFileInput'
];

missingIds.forEach(id => {
  lines.forEach((line, idx) => {
    if (line.includes(id)) {
      console.log(`${id} at L${idx+1}: ${line.trim()}`);
    }
  });
});
