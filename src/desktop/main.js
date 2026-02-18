const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const { ensureChrome } = require('./chrome-manager');

// ── Paths ──────────────────────────────────────────────────────────────────────
const isPackaged = app.isPackaged;
const appRoot = isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..', '..');
const userDataDir = app.getPath('userData'); // %APPDATA%/WebClaw
const documentsDir = app.getPath('documents');

const DOWNLOADS_DIR = path.join(documentsDir, 'WebClaw Downloads');
const HISTORY_FILE = path.join(userDataDir, 'history.json');
const CHROME_CACHE_DIR = path.join(userDataDir, 'chrome');

for (const dir of [DOWNLOADS_DIR, userDataDir, CHROME_CACHE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── CLI: --clear-data ───────────────────────────────────────────────────────────
if (process.argv.includes('--clear-data')) {
  const deleteAll = process.argv.includes('--include-downloads');
  const removed = [];
  if (fs.existsSync(HISTORY_FILE)) {
    fs.unlinkSync(HISTORY_FILE);
    removed.push('history.json');
  }
  if (fs.existsSync(CHROME_CACHE_DIR)) {
    fs.rmSync(CHROME_CACHE_DIR, { recursive: true, force: true });
    removed.push('chrome/');
  }
  if (deleteAll && fs.existsSync(DOWNLOADS_DIR)) {
    fs.rmSync(DOWNLOADS_DIR, { recursive: true, force: true });
    removed.push('WebClaw Downloads/');
  }
  console.log(removed.length > 0 ? `Removed: ${removed.join(', ')}` : 'Nothing to clean up.');
  process.exit(0);
}

// ── Single Instance Lock ────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Globals ─────────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let expressServer = null;
let serverPort = null;

// ── Port finder ─────────────────────────────────────────────────────────────────
function findAvailablePort(startPort = 3100) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      if (startPort < 3200) {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(new Error('No available port found (3100-3199)'));
      }
    });
  });
}

// ── Create window ───────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(appRoot, 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray ────────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(appRoot, 'build', 'icon.png');
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('WebClaw');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } },
    },
    {
      label: 'Downloads Folder',
      click: () => { shell.openPath(DOWNLOADS_DIR); },
    },
    { type: 'separator' },
    {
      label: 'Reset Data',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        showResetDialog();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ── Data cleanup ────────────────────────────────────────────────────────────────
async function showResetDialog() {
  const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Reset'],
    defaultId: 0,
    cancelId: 0,
    title: 'Reset App Data',
    message: 'Delete app data and reset to initial state?',
    detail: 'This will remove:\n- Job history\n- Cached Chromium browser (~130 MB)\n\nDownloaded images will NOT be deleted unless checked below.',
    checkboxLabel: 'Also delete all downloaded images',
    checkboxChecked: false,
  });

  if (response === 1) {
    const removed = [];
    if (fs.existsSync(HISTORY_FILE)) { fs.unlinkSync(HISTORY_FILE); removed.push('Job history'); }
    if (fs.existsSync(CHROME_CACHE_DIR)) { fs.rmSync(CHROME_CACHE_DIR, { recursive: true, force: true }); removed.push('Chromium runtime'); }
    if (checkboxChecked && fs.existsSync(DOWNLOADS_DIR)) { fs.rmSync(DOWNLOADS_DIR, { recursive: true, force: true }); removed.push('Downloaded images'); }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Reset Complete',
      message: `Deleted: ${removed.join(', ')}`,
      detail: 'Restart the app to apply changes.',
    });
  }
}

// ── IPC handlers ────────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('open-downloads', () => { shell.openPath(DOWNLOADS_DIR); });
  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('get-downloads-dir', () => DOWNLOADS_DIR);
}

// ── App lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  setupIPC();
  createWindow();
  createTray();

  try {
    serverPort = await findAvailablePort(3100);
    console.log(`[Server] Using port ${serverPort}`);

    let chromePath;
    try {
      chromePath = await ensureChrome(CHROME_CACHE_DIR, mainWindow);
    } catch (err) {
      dialog.showErrorBox('Chrome Error', err.message);
      app.isQuitting = true;
      app.quit();
      return;
    }

    const { startServer } = require('../server/index');
    const result = await startServer({
      port: serverPort,
      host: '127.0.0.1',
      downloadsDir: DOWNLOADS_DIR,
      historyFile: HISTORY_FILE,
      publicDir: path.join(appRoot, 'public'),
      chromePath,
      configDir: userDataDir,
    });
    expressServer = result.server;

    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  } catch (err) {
    console.error('[Startup Error]', err);
    dialog.showErrorBox('Startup Error', err.message);
    app.isQuitting = true;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.isQuitting = true;
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (expressServer) expressServer.close();
});
