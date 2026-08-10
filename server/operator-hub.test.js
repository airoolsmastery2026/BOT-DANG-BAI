'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'operator.html'), 'utf8');

test('operator hub links the four production workflow entry points', () => {
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/campaign-export\.html"/);
  assert.match(html, /href="\/worker-admin\.html"/);
  assert.match(html, /href="\/persistent-campaign\.html"/);
});

test('operator hub reads worker connection from session only', () => {
  assert.match(html, /SESSION_KEY = 'dhp_publishing_worker_admin'/);
  assert.match(html, /sessionStorage\.getItem\(SESSION_KEY/);
  assert.doesNotMatch(html, /localStorage\.(setItem|getItem)/);
});

test('operator hub health check never sends worker admin token', () => {
  assert.match(html, /fetch\(`\$\{url\}\/health`/);
  assert.doesNotMatch(html, /Authorization:\s*`Bearer/);
});
