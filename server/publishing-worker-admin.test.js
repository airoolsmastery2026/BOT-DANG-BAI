'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'worker-admin.html'), 'utf8');
const extendedHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'worker-platforms.html'), 'utf8');

test('worker admin keeps operator token in session storage only', () => {
  assert.match(html, /sessionStorage\.setItem\(SESSION_KEY/);
  assert.match(html, /sessionStorage\.getItem\(SESSION_KEY/);
  assert.doesNotMatch(html, /localStorage\.(setItem|getItem)/);
  assert.match(html, /id="workerToken" type="password"/);
  assert.match(extendedHtml, /sessionStorage\.getItem\(SESSION_KEY/);
  assert.doesNotMatch(extendedHtml, /localStorage\.(setItem|getItem)/);
});

test('worker admin contains no embedded platform or worker secret values', () => {
  for (const source of [html, extendedHtml]) {
    assert.doesNotMatch(source, /DHP_PUBLISHING_VAULT_KEY\s*=/);
    assert.doesNotMatch(source, /DHP_PUBLISHING_WORKER_TOKEN\s*=/);
    assert.doesNotMatch(source, /GEMINI_API_KEY\s*=/);
    assert.doesNotMatch(source, /access[_-]?token\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/i);
  }
});

test('worker admin exposes encrypted account lifecycle for core platforms', () => {
  for (const platform of ['facebook', 'instagram', 'tiktok']) {
    assert.match(html, new RegExp(`/v1/accounts/\\$\\{platform\\}`));
    assert.match(html, new RegExp(`/v1/accounts/\\$\\{platform\\}/verify`));
  }
  assert.match(html, /data-platform="facebook"/);
  assert.match(html, /data-platform="instagram"/);
  assert.match(html, /data-platform="tiktok"/);
});

test('extended connection console exposes LinkedIn and Pinterest vault lifecycle', () => {
  for (const platform of ['linkedin', 'pinterest']) {
    assert.match(extendedHtml, new RegExp(`data-platform="${platform}"`));
    assert.match(extendedHtml, new RegExp(`/v1/accounts/\\$\\{platform\\}`));
    assert.match(extendedHtml, new RegExp(`/v1/accounts/\\$\\{platform\\}/verify`));
  }
  assert.match(extendedHtml, /id="linkedinToken" type="password"/);
  assert.match(extendedHtml, /id="pinterestToken" type="password"/);
  assert.doesNotMatch(extendedHtml, /api\.linkedin\.com|api\.pinterest\.com/);
});

test('worker admin exposes persistent queue operations without direct publish bypass', () => {
  assert.match(html, /request\('\/v1\/jobs'/);
  assert.match(html, /request\('\/v1\/jobs\/process'/);
  assert.match(html, /\/v1\/jobs\/\$\{button\.dataset\.retry\}\/retry/);
  assert.doesNotMatch(html, /graph\.facebook\.com|open\.tiktokapis\.com|media_publish/);
});

test('worker admin escapes queue content before rendering', () => {
  assert.match(html, /const escapeHtml =/);
  assert.match(html, /escapeHtml\(job\.id\)/);
  assert.match(html, /escapeHtml\(String\(job\.content/);
});
