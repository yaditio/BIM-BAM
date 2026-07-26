const { execSync } = require('child_process');
const fs = require('fs');

try {
  const content = execSync('git show 18a43d0:index.html', { encoding: 'utf8' });
  const startIdx = content.indexOf('<div id="qtoModal"');
  if (startIdx === -1) {
    console.error('qtoModal div not found in git history');
    process.exit(1);
  }
  
  // Find matching outer closure of div
  let openDivs = 0;
  let endIdx = startIdx;
  while (endIdx < content.length) {
    const sub = content.substring(endIdx, endIdx + 20);
    if (sub.startsWith('<div')) {
      openDivs++;
    } else if (sub.startsWith('</div')) {
      openDivs--;
      if (openDivs === 0) {
        endIdx += 6; // include </div>
        break;
      }
    }
    endIdx++;
  }

  const modalHtml = content.substring(startIdx, endIdx);
  console.log('=== HTML EXTRACTED ===');
  console.log(modalHtml);
  fs.writeFileSync('scratch/old_modal.html', modalHtml);
} catch (e) {
  console.error(e);
}
