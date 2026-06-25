const { app, BrowserWindow, utilityProcess } = require('electron');
const path = require('path');

let mainWindow;
let serverProcess;

function startBackend() {
  const serverPath = path.join(__dirname, 'server.cjs');
  console.log('[Electron Main] Starting backend server at:', serverPath);
  
  // Start the server.cjs in a separate child process using utilityProcess to support ASAR
  serverProcess = utilityProcess.fork(serverPath, [], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  serverProcess.on('spawn', () => {
    console.log('[Electron Main] Backend process spawned successfully.');
  });

  serverProcess.on('error', (err) => {
    console.error('[Electron Main] Backend process failed to spawn:', err);
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Backend STDOUT]: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Backend STDERR]: ${data.toString().trim()}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Electron Main] Backend process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "BIM BAM - BIM Viewer",
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Hide default menu bar for a clean desktop app look
  mainWindow.setMenuBarVisibility(false);

  const isDev = !app.isPackaged;
  if (isDev) {
    // In dev, load Vite development server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the local Express server
    mainWindow.loadURL('http://localhost:5000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Start backend Express server
  startBackend();
  
  // Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Terminate backend server process
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
