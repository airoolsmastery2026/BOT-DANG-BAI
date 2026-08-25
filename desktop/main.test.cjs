'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
const builderSource = fs.readFileSync(path.join(__dirname, 'build-installer.ps1'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

test('desktop renderer has no Node.js privileges', () => {
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /webSecurity:\s*true/);
  assert.match(source, /allowRunningInsecureContent:\s*false/);
});

test('desktop denies permissions, webviews and new renderer windows', () => {
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /setPermissionCheckHandler/);
  assert.match(source, /will-attach-webview/);
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /action:\s*'deny'/);
});

test('desktop only opens HTTPS links outside the application', () => {
  assert.match(source, /new Set\(\['https:'\]\)/);
  assert.match(source, /will-navigate/);
  assert.match(source, /openExternalSafely/);
});

test('desktop keeps the scheduler active in the tray and provides an explicit quit', () => {
  assert.match(source, /backgroundThrottling:\s*false/);
  assert.match(source, /event\.preventDefault\(\);\s*\n\s*mainWindow\.hide\(\)/);
  assert.match(source, /Thoát hoàn toàn/);
  assert.match(source, /Khởi động cùng Windows/);
});

test('Windows installer is per-user, uninstallable and excludes source maps', () => {
  assert.equal(pkg.main, 'desktop/main.cjs');
  assert.equal(pkg.build.extends, null);
  assert.equal(pkg.build.win.target[0].target, 'nsis');
  assert.deepEqual(pkg.build.win.target[0].arch, ['x64']);
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.perMachine, false);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.ok(pkg.build.files.includes('!build/**/*.map'));
  assert.match(pkg.scripts['desktop:package'], /build-installer\.ps1/);
  assert.match(builderSource, /--publish never/);
});
