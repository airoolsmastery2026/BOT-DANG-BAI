const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'dhp-media-ingress.js'), 'utf8');
const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

test('cloud media sync keeps Control Plane credentials server-side', () => {
  assert.match(source, /DHP_CONTROL_PLANE_URL/);
  assert.match(source, /DHP_CONTROL_PLANE_KEY_ID/);
  assert.match(source, /DHP_CONTROL_PLANE_SECRET/);
  assert.match(source, /Authorization: `DHP-Key \$\{CONTROL_PLANE_KEY_ID\}:\$\{CONTROL_PLANE_SECRET\}`/);
  assert.doesNotMatch(envExample, /REACT_APP_DHP_CONTROL_PLANE_SECRET/);
  assert.doesNotMatch(envExample, /REACT_APP_DHP_CONTROL_PLANE_KEY_ID/);
});

test('cloud sync is idempotent and only acknowledges after local import request', () => {
  assert.match(source, /known = new Set\(entries\.map\(\(entry\) => entry\.idempotencyKey\)/);
  assert.match(source, /known\.has\(incoming\.idempotencyKey\)/);
  assert.match(source, /\/v1\/publish\/packages\?status=pending/);
  assert.match(source, /acknowledgeCloudPackage\(entry\.remotePackageId, postId\)/);
  assert.match(source, /status: 'imported'/);
});

test('local inbox remains loopback by default', () => {
  assert.match(source, /DHP_MEDIA_INGRESS_HOST \|\| '127\.0\.0\.1'/);
  assert.match(envExample, /DHP_MEDIA_INGRESS_HOST=127\.0\.0\.1/);
});
