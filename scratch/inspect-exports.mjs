import { chromium } from 'playwright';
import { existsSync } from 'fs';

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  let executablePath = null;

  if (existsSync(chromePath)) {
    executablePath = chromePath;
  } else if (existsSync(edgePath)) {
    executablePath = edgePath;
  }
  
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Browser Console]: ${msg.text()}`);
  });
  
  await page.goto('http://localhost:3000');
  await page.evaluate(async () => {
    const XE = await import('./lib/xeokit/xeokit-sdk.min.es.js');
    console.log("EXPORTS:" + Object.keys(XE).join(','));
  });
  
  await browser.close();
}
run();
