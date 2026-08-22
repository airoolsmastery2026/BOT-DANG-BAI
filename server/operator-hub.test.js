'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'operator.html'), 'utf8');

test('operator hub links the production workflow entry points', () => {
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/campaign-export\.html"/);
  assert.match(html, /href="\/worker-admin\.html"/);
  assert.match(html, /href="\/worker-platforms\.html"/);
  assert.match(html, /href="\/persistent-campaign\.html"/);
});

test('operator hub reads worker connection from session only', () => {
  assert.match(html, /SESSION_KEY = 'dhp_publishing_worker_admin'/);
  assert.match(html, /sessionStorage\.getItem\(SESSION_KEY/);
  assert.doesNotMatch(html, /localStorage\.(setItem|getItem)/);
});

test('operator hub health probe remains unauthenticated and no-store', () => {
  assert.match(html, /fetch\(`\$\{url\}\/health`, \{ cache: 'no-store' \}\)/);
});

test('operator readiness fails closed on paused or stale verification', () => {
  assert.match(html, /account\?\.stale === true/);
  assert.match(html, /account\?\.verificationStatus !== 'verified'/);
  assert.match(html, /const ready = !paused && configured > 0 && verified === configured/);
  assert.match(html, /LIVE READY/);
});

test('operator can reverify only accounts that need refresh using session token', () => {
  assert.match(html, /const targets = accounts\.filter\(verificationNeedsRefresh\)/);
  assert.match(html, /\/v1\/accounts\/\$\{encodeURIComponent\(platform\)\}\/verify/);
  assert.match(html, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(html, /\/v1\/jobs\/process/);
});

test('operator hub exposes all six persistent worker platforms', () => {
  for (const platform of ['Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'Pinterest', 'YouTube']) {
    assert.match(html, new RegExp(platform));
  }
});
