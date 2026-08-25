'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
} = require('electron');

const APP_ID = 'vn.daihaiphat.botdangbai';
const APP_TITLE = 'BOT ĐĂNG BÀI';
const isSmokeTest = process.argv.includes('--smoke-test');
const entryPath = path.join(__dirname, '..', 'build', 'index.html');
const entryUrl = pathToFileURL(entryPath).toString();
const iconPath = path.join(__dirname, 'assets', 'icon.png');
const allowedExternalProtocols = new Set(['https:']);

let mainWindow;
let tray;
let isQuitting = false;
let smokeTimer;

const isSafeExternalUrl = (value) => {
  try {
    return allowedExternalProtocols.has(new URL(value).protocol);
  } catch {
    return false;
  }
};

const openExternalSafely = async (value) => {
  if (!isSafeExternalUrl(value)) return;
  await shell.openExternal(value);
};

const showMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

const quitApplication = () => {
  isQuitting = true;
  app.quit();
};

const updateLoginLaunch = (enabled) => {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
  createTrayMenu();
};

const createTrayMenu = () => {
  if (!tray || tray.isDestroyed()) return;
  const opensAtLogin = app.isPackaged && app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mở BOT ĐĂNG BÀI', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Khởi động cùng Windows',
      type: 'checkbox',
      checked: opensAtLogin,
      enabled: app.isPackaged,
      click: (item) => updateLoginLaunch(item.checked),
    },
    { type: 'separator' },
    { label: 'Thoát hoàn toàn', click: quitApplication },
  ]));
};

const createTray = () => {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip(`${APP_TITLE} · đang chạy nền`);
  tray.on('double-click', showMainWindow);
  createTrayMenu();
};

const installDesktopSecurity = () => {
  const desktopSession = session.defaultSession;
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders['Content-Security-Policy'] = [
      "default-src 'self'; "
      + "script-src 'self'; "
      + "style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data: blob: https:; "
      + "media-src 'self' blob: https:; "
      + "connect-src 'self' https: http://127.0.0.1:* http://localhost:*; "
      + "object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
    ];
    callback({ responseHeaders });
  });
};

const installWebContentsSecurity = () => {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      void openExternalSafely(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (url === entryUrl || url.startsWith(`${entryUrl}#`)) return;
      event.preventDefault();
      void openExternalSafely(url);
    });
  });
};

const finishSmokeTest = (exitCode, message) => {
  if (!isSmokeTest) return;
  clearTimeout(smokeTimer);
  if (message) process.stderr.write(`${message}\n`);
  app.exit(exitCode);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#070b14',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (isSmokeTest) return finishSmokeTest(0);
    mainWindow.show();
  });
  mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
    finishSmokeTest(1, `Desktop load failed (${code}): ${description}`);
  });
  mainWindow.on('close', (event) => {
    if (isQuitting || isSmokeTest) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
  void mainWindow.loadFile(entryPath);
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  installWebContentsSecurity();
  app.on('second-instance', showMainWindow);
  app.on('before-quit', () => {
    isQuitting = true;
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
  app.on('activate', () => {
    if (mainWindow) showMainWindow();
    else createWindow();
  });
  app.whenReady().then(() => {
    installDesktopSecurity();
    createWindow();
    if (!isSmokeTest) createTray();
    else smokeTimer = setTimeout(() => finishSmokeTest(1, 'Desktop smoke test timed out.'), 20_000);
  }).catch((error) => finishSmokeTest(1, error instanceof Error ? error.message : String(error)));
}

