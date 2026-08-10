'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'campaign-export.html'), 'utf8');

test('campaign export page discovers workflows without relying on a hardcoded storage key', () => {
  assert.match(html, /localStorage\.length/);
  assert.match(html, /localStorage\.key\(index\)/);
  assert.match(html, /looksLikeWorkflow/);
  assert.match(html, /value\.campaign/);
  assert.match(html, /Array\.isArray\(value\.channels\)/);
});

test('campaign export removes likely secret fields recursively before display or file export', () => {
  assert.match(html, /SECRET_KEY_PATTERN/);
  assert.match(html, /access\[_-\]\?token/);
  assert.match(html, /refresh\[_-\]\?token/);
  assert.match(html, /private\[_-\]\?key/);
  assert.match(html, /sanitize\(entry\.workflow\)/);
  assert.match(html, /JSON\.stringify\(payload\.workflow/);
});

test('campaign export never writes back to application local storage', () => {
  assert.doesNotMatch(html, /localStorage\.setItem/);
  assert.doesNotMatch(html, /localStorage\.removeItem/);
});

test('campaign JSON can be reviewed, copied and downloaded', () => {
  assert.match(html, /id="json"/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /new Blob/);
  assert.match(html, /anchor\.download/);
});
