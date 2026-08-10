'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createCredentialVault,
  decryptJson,
  encryptJson,
  normalizeCredentials,
} = require('./publishing-worker-vault');

const SECRET = 'this-is-a-long-random-test-secret-123456789';

test('normalizes required credential fields per platform', () => {
  assert.deepEqual(normalizeCredentials('facebook', {
    accessToken: ' token ',
    pageId: ' page-1 ',
    ignored: 'value',
  }), {
    accessToken: 'token',
    pageId: 'page-1',
  });
  assert.throws(() => normalizeCredentials('instagram', { accessToken: 'token' }), /Business\/Creator ID/);
});

test('encrypts and decrypts JSON with authenticated encryption', () => {
  const encrypted = encryptJson({ accessToken: 'secret-token' }, SECRET);
  assert.equal(encrypted.algorithm, 'aes-256-gcm');
  assert.doesNotMatch(JSON.stringify(encrypted), /secret-token/);
  assert.deepEqual(decryptJson(encrypted, SECRET), { accessToken: 'secret-token' });
});

test('stores credentials encrypted at rest and lists only metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-worker-vault-'));
  const filePath = path.join(directory, 'vault.json');
  const vault = createCredentialVault({ filePath, secret: SECRET });

  vault.set('facebook', { accessToken: 'fb-secret-token', pageId: 'page-1' });

  const raw = fs.readFileSync(filePath, 'utf8');
  assert.doesNotMatch(raw, /fb-secret-token/);
  assert.doesNotMatch(raw, /page-1/);
  assert.deepEqual(vault.get('facebook'), { accessToken: 'fb-secret-token', pageId: 'page-1' });
  assert.deepEqual(vault.list().map((item) => item.platform), ['facebook']);
  assert.equal(vault.remove('facebook'), true);
  assert.equal(vault.get('facebook'), null);
});

test('rejects weak vault master secret', () => {
  assert.throws(() => createCredentialVault({ filePath: '/tmp/test-vault.json', secret: 'short' }), /ít nhất 24 ký tự/);
});
