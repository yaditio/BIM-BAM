'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { CONVERTERS_DIR, IS_WINDOWS, PLATFORM } = require('./utils');

const REPO = 'datadrivenconstruction/cad2data-Revit-IFC-DWG-DGN-pipeline-with-conversion-validation-qto';
const BRANCH = 'main';
const ZIP_URL = `https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip`;

const WIN_CONVERTER_DIRS = [
  'DDC_Converters_Windows_Packages/DDC_CONVERTER_DGN',
  'DDC_Converters_Windows_Packages/DDC_CONVERTER_DWG',
  'DDC_Converters_Windows_Packages/DDC_CONVERTER_IFC',
  'DDC_Converters_Windows_Packages/DDC_CONVERTER_REVIT',
  'DDC_Converters_Windows_Packages/DDC_CONVERTER_Revit2IFC',
];

const LINUX_CONVERTER_DIRS = [
  'DDC_Converters_Linux_Packages',
];

function followRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'cad2data-npm' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(followRedirects(res.headers.location, maxRedirects - 1));
      } else if (res.statusCode === 200) {
        resolve(res);
      } else {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
    }).on('error', reject);
  });
}

function downloadFile(url, destPath, label) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await followRedirects(url);
      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloaded = 0;

      const file = fs.createWriteStream(destPath);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalBytes > 0) {
          const pct = Math.round((downloaded / totalBytes) * 100);
          process.stdout.write(`\r  ${label}: ${pct}% (${Math.round(downloaded / 1024 / 1024)}MB)`);
        } else {
          process.stdout.write(`\r  ${label}: ${Math.round(downloaded / 1024 / 1024)}MB`);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write('\n');
        resolve(destPath);
      });
      file.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

function unzip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (IS_WINDOWS) {
      const cmd = 'powershell';
      const args = [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
      ];
      execFile(cmd, args, { timeout: 300000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`Unzip failed: ${err.message}\n${stderr}`));
        else resolve();
      });
    } else {
      execFile('unzip', ['-o', zipPath, '-d', destDir], { timeout: 300000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`Unzip failed: ${err.message}\n${stderr}`));
        else resolve();
      });
    }
  });
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function chmodRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      chmodRecursive(fullPath);
    } else if (entry.name.startsWith('ddc-')) {
      fs.chmodSync(fullPath, 0o755);
    }
  }
}

async function setup(options = {}) {
  const tmpDir = path.join(CONVERTERS_DIR, '.tmp_download');
  const zipPath = path.join(tmpDir, 'repo.zip');

  console.log('\n  cad2data — Downloading converters from GitHub\n');
  console.log(`  Repository: ${REPO}`);
  console.log(`  Branch: ${BRANCH}`);
  console.log(`  Platform: ${PLATFORM}\n`);

  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    console.log('  Downloading repository archive...');
    await downloadFile(ZIP_URL, zipPath, 'Download');

    console.log('  Extracting archive...');
    await unzip(zipPath, tmpDir);

    const extracted = fs.readdirSync(tmpDir).find(
      (d) => d.startsWith('cad2data') && fs.statSync(path.join(tmpDir, d)).isDirectory()
    );
    if (!extracted) {
      throw new Error('Could not find extracted repository directory');
    }
    const repoDir = path.join(tmpDir, extracted);

    const converterDirs = IS_WINDOWS ? WIN_CONVERTER_DIRS : LINUX_CONVERTER_DIRS;

    console.log('  Installing converters...\n');
    let installed = 0;
    for (const dir of converterDirs) {
      const srcDir = path.join(repoDir, dir);
      if (!fs.existsSync(srcDir)) {
        console.log(`  [SKIP] ${path.basename(dir)} — not found in repository`);
        continue;
      }
      const destName = path.basename(dir);
      const destDir = path.join(CONVERTERS_DIR, destName);
      console.log(`  [COPY] ${destName}`);
      copyDirSync(srcDir, destDir);
      installed++;
    }

    // On Linux, make executables runnable
    if (!IS_WINDOWS) {
      console.log('  Setting executable permissions...');
      chmodRecursive(CONVERTERS_DIR);
    }

    console.log(`\n  Installed ${installed} converter package(s) to:`);
    console.log(`  ${CONVERTERS_DIR}`);

    if (!IS_WINDOWS) {
      console.log('\n  Tip: You can also install system-wide with:');
      console.log('  sudo dpkg -i converters/DDC_Converters_Linux_Packages/*.deb');
    }

  } finally {
    console.log('\n  Cleaning up...');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('  Done! Run "cad2data list" to verify.\n');
}

module.exports = { setup };
