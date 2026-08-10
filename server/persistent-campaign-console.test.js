'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'persistent-campaign.html'), 'utf8');

test('campaign console shares only session-scoped worker connection', () => {
  assert.match(html, /WORKER_SESSION_KEY = 'dhp_publishing_worker_admin'/);
  assert.match(html, /sessionStorage\.getItem\(WORKER_SESSION_KEY/);
  assert.doesNotMatch(html, /sessionStorage\.setItem\([^)]*(accessToken|platformToken)/i);
});

test('campaign console strips likely secret fields before campaign processing', () => {
  assert.match(html, /SECRET_KEY_PATTERN/);
  assert.match(html, /sanitize\(value/);
  assert.match(html, /results\.push\(sanitize\(value\)\)/);
});

test('persistent handoff only supports worker publisher platforms', () => {
  assert.match(html, /new Set\(\['facebook', 'instagram', 'tiktok'\]\)/);
  assert.match(html, /WORKER_PLATFORMS\.has\(platform\)/);
  assert.match(html, /skipped/);
});

test('persistent handoff blocks unapproved and incomplete-media workflows', () => {
  assert.match(html, /\['approved', 'scheduled'\]\.includes/);
  assert.match(html, /instagram: thiếu image URL/);
  assert.match(html, /tiktok: thiếu video URL/);
});

test('campaign console uses stable SHA-256 idempotency and handles worker duplicates', () => {
  assert.match(html, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(html, /'Idempotency-Key': job\.idempotencyKey/);
  assert.match(html, /response\.status === 409/);
  assert.match(html, /duplicates \+= 1/);
});

test('campaign preview renders via textContent rather than injecting campaign HTML', () => {
  assert.match(html, /cell\.textContent = text/);
  assert.doesNotMatch(html, /innerHTML\s*=\s*.*job\./);
  assert.doesNotMatch(html, /graph\.facebook\.com|open\.tiktokapis\.com/);
});
