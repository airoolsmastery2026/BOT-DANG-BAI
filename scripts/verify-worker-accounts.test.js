'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeBaseUrl,
  shouldRefreshAccount,
  refreshWorkerAccounts,
} = require('./verify-worker-accounts');

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

test('normalizes worker URL and rejects unsafe schemes', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8794/'), 'http://127.0.0.1:8794');
  assert.throws(() => normalizeBaseUrl('file:///tmp/worker'), /HTTP\/HTTPS/);
});

test('refreshes only configured stale or unverified accounts by default', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/health')) {
      return jsonResponse(200, {
        accounts: {
          facebook: { configured: true, verificationStatus: 'verified', stale: false },
          instagram: { configured: true, verificationStatus: 'verified', stale: true },
          tiktok: { configured: true, verificationStatus: 'unverified', stale: false },
          linkedin: { configured: false, verificationStatus: 'unverified', stale: false },
        },
      });
    }
    return jsonResponse(200, { data: { account: { id: 'safe-id' } } });
  };

  const report = await refreshWorkerAccounts({
    baseUrl: 'http://127.0.0.1:8794',
    token: 'worker-secret',
    fetchImpl,
  });

  assert.deepEqual(report.results.map((item) => item.platform), ['instagram', 'tiktok']);
  assert.equal(report.failed, 0);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer worker-secret');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer worker-secret');
});

test('force mode re-verifies every configured account and reports provider failure without leaking token', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/health')) {
      return jsonResponse(200, {
        accounts: {
          facebook: { configured: true, verificationStatus: 'verified', stale: false },
          youtube: { configured: true, verificationStatus: 'verified', stale: false },
        },
      });
    }
    if (url.includes('/youtube/verify')) return jsonResponse(400, { error: 'token revoked', errorCode: 'VERIFY_FAILED' });
    return jsonResponse(200, { data: { account: { id: 'page-1' } } });
  };

  const report = await refreshWorkerAccounts({
    baseUrl: 'http://127.0.0.1:8794',
    token: 'top-secret-token',
    force: true,
    fetchImpl,
  });

  assert.equal(report.checked, 2);
  assert.equal(report.passed, 1);
  assert.equal(report.failed, 1);
  assert.equal(JSON.stringify(report).includes('top-secret-token'), false);
});

test('requires worker token before authenticated verification calls', async () => {
  await assert.rejects(
    refreshWorkerAccounts({ baseUrl: 'http://127.0.0.1:8794', token: '' }),
    /DHP_PUBLISHING_WORKER_TOKEN is required/,
  );
});

test('account refresh predicate fails closed for missing configuration', () => {
  assert.equal(shouldRefreshAccount(null), false);
  assert.equal(shouldRefreshAccount({ configured: false, verificationStatus: 'unverified' }), false);
  assert.equal(shouldRefreshAccount({ configured: true, verificationStatus: 'verified', stale: false }), false);
  assert.equal(shouldRefreshAccount({ configured: true, verificationStatus: 'verified', stale: true }), true);
  assert.equal(shouldRefreshAccount({ configured: true, verificationStatus: 'failed', stale: false }), true);
});
