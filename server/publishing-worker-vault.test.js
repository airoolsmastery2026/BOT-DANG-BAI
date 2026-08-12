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
const YOUTUBE_CHANNEL = 'UCabcdefghijklmnopqrstuv';

test('normalizes required credential fields per platform', () => {
  assert.deepEqual(normalizeCredentials('facebook', {
    accessToken: ' token ',
    pageId: ' page-1 ',
    ignored: 'value',
  }), {
    accessToken: 'token',
    pageId: 'page-1',
  });
  assert.deepEqual(normalizeCredentials('linkedin', {
    accessToken: ' li-token ',
    authorUrn: ' urn:li:organization:12345 ',
  }), {
    accessToken: 'li-token',
    authorUrn: 'urn:li:organization:12345',
  });
  assert.deepEqual(normalizeCredentials('pinterest', {
    accessToken: ' pin-token ',
    boardId: ' 987654321 ',
  }), {
    accessToken: 'pin-token',
    boardId: '987654321',
  });
  assert.deepEqual(normalizeCredentials('youtube', {
    accessToken: ' yt-token ',
    channelId: ` ${YOUTUBE_CHANNEL} `,
  }), {
    accessToken: 'yt-token',
    channelId: YOUTUBE_CHANNEL,
  });
  assert.throws(() => normalizeCredentials('instagram', { accessToken: 'token' }), /Business\/Creator ID/);
  assert.throws(() => normalizeCredentials('linkedin', { accessToken: 'token', authorUrn: 'bad' }), /Author URN/);
  assert.throws(() => normalizeCredentials('linkedin', { accessToken: 'token', authorUrn: 'urn:li:organization:not-a-number' }), /Author URN/);
  assert.throws(() => normalizeCredentials('pinterest', { accessToken: 'token', boardId: 'bad' }), /Board ID/);
  assert.throws(() => normalizeCredentials('youtube', { accessToken: 'token', channelId: 'bad' }), /Channel ID/);
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
  vault.set('linkedin', { accessToken: 'li-secret-token', authorUrn: 'urn:li:person:123' });
  vault.set('pinterest', { accessToken: 'pin-secret-token', boardId: '987654321' });
  vault.set('youtube', { accessToken: 'yt-secret-token', channelId: YOUTUBE_CHANNEL });

  const raw = fs.readFileSync(filePath, 'utf8');
  assert.doesNotMatch(raw, /fb-secret-token|li-secret-token|pin-secret-token|yt-secret-token/);
  assert.doesNotMatch(raw, /page-1|urn:li:person:123|987654321|UCabcdefghijklmnopqrstuv/);
  assert.deepEqual(vault.get('facebook'), { accessToken: 'fb-secret-token', pageId: 'page-1' });
  assert.deepEqual(vault.get('linkedin'), { accessToken: 'li-secret-token', authorUrn: 'urn:li:person:123' });
  assert.deepEqual(vault.get('pinterest'), { accessToken: 'pin-secret-token', boardId: '987654321' });
  assert.deepEqual(vault.get('youtube'), { accessToken: 'yt-secret-token', channelId: YOUTUBE_CHANNEL });
  assert.deepEqual(vault.list().map((item) => item.platform).sort(), ['facebook', 'linkedin', 'pinterest', 'youtube']);
  assert.equal(vault.list().find((item) => item.platform === 'facebook').verificationStatus, 'unverified');
  assert.throws(
    () => vault.getVerified('facebook'),
    (error) => error.code === 'ACCOUNT_NOT_VERIFIED' && error.retryable === false,
  );
  assert.throws(
    () => vault.assertVerified('instagram'),
    (error) => error.code === 'ACCOUNT_NOT_CONFIGURED' && error.retryable === false,
  );
  const verified = vault.recordVerification('facebook', { ok: true });
  assert.equal(verified.status, 'verified');
  assert.equal(vault.assertVerified(['facebook']), true);
  assert.deepEqual(vault.getVerified('facebook'), { accessToken: 'fb-secret-token', pageId: 'page-1' });
  assert.equal(vault.list().find((item) => item.platform === 'facebook').verificationStatus, 'verified');
  assert.ok(vault.list().find((item) => item.platform === 'facebook').lastVerifiedAt);
  vault.recordVerification('pinterest', { ok: false, errorCode: 'HTTP_401' });
  assert.deepEqual(
    vault.list().find((item) => item.platform === 'pinterest'),
    {
      platform: 'pinterest',
      configured: true,
      updatedAt: vault.list().find((item) => item.platform === 'pinterest').updatedAt,
      verificationStatus: 'error',
      lastVerificationAttemptAt: vault.list().find((item) => item.platform === 'pinterest').lastVerificationAttemptAt,
      lastVerifiedAt: null,
      verificationErrorCode: 'HTTP_401',
    },
  );
  vault.set('facebook', { accessToken: 'new-secret-token', pageId: 'page-1' });
  assert.equal(vault.list().find((item) => item.platform === 'facebook').verificationStatus, 'unverified');
  assert.throws(() => vault.getVerified('facebook'), (error) => error.code === 'ACCOUNT_NOT_VERIFIED');
  assert.equal(vault.remove('linkedin'), true);
  assert.equal(vault.get('linkedin'), null);
});

test('refuses to replace a corrupt vault with an empty account set', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-worker-vault-corrupt-'));
  const filePath = path.join(directory, 'vault.json');
  fs.writeFileSync(filePath, '{not-json');
  const vault = createCredentialVault({ filePath, secret: SECRET });

  assert.throws(() => vault.list(), (error) => error.code === 'VAULT_CORRUPT');
  assert.throws(
    () => vault.set('facebook', { accessToken: 'token', pageId: 'page-1' }),
    (error) => error.code === 'VAULT_CORRUPT',
  );
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{not-json');
});

test('rejects weak vault master secret', () => {
  assert.throws(() => createCredentialVault({ filePath: '/tmp/test-vault.json', secret: 'short' }), /ít nhất 24 ký tự/);
});
