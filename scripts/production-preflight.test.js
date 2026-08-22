'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_CONFIG,
  buildWorkerHealthUrl,
  checkWorker,
  configReadiness,
  runPreflight,
} = require('./production-preflight');

const configuredEnv = () => Object.fromEntries(REQUIRED_CONFIG.map((name) => [name, `${name.toLowerCase()}-secret-value`]));

test('config readiness reports names only and never returns secret values', async () => {
  const env = configuredEnv();
  const report = await runPreflight({ env });
  assert.equal(report.ready, true);
  assert.equal(report.mode, 'config-only');
  assert.deepEqual(report.missing, []);
  const serialized = JSON.stringify(report);
  for (const value of Object.values(env)) assert.doesNotMatch(serialized, new RegExp(value));
});

test('placeholder and empty values fail closed', () => {
  const env = configuredEnv();
  env.TELEGRAM_BOT_TOKEN = '';
  env.DHP_PUBLISHING_CONTROL_TOKEN = 'replace-with-a-dedicated-random-secret';
  const readiness = configReadiness(env);
  assert.equal(readiness.find((item) => item.name === 'TELEGRAM_BOT_TOKEN').ready, false);
  assert.equal(readiness.find((item) => item.name === 'DHP_PUBLISHING_CONTROL_TOKEN').ready, false);
});

test('worker health URL defaults to loopback and validates port', () => {
  assert.equal(buildWorkerHealthUrl({}), 'http://127.0.0.1:8794/health');
  assert.throws(() => buildWorkerHealthUrl({ DHP_PUBLISHING_WORKER_PORT: '70000' }), /invalid/);
});

test('network preflight requires all config before making network calls', async () => {
  let calls = 0;
  const report = await runPreflight({
    env: {},
    network: true,
    fetchImpl: async () => { calls += 1; throw new Error('must not run'); },
    fetchPublishingContentImpl: async () => { calls += 1; throw new Error('must not run'); },
  });
  assert.equal(report.ready, false);
  assert.equal(calls, 0);
  assert.ok(report.missing.length > 0);
});

test('worker check is ready only when running and every configured account is verified', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 'ok',
      paused: false,
      queue: { total: 3, due: 1 },
      accounts: [
        { platform: 'facebook', configured: true, verificationStatus: 'verified' },
        { platform: 'youtube', configured: true, verificationStatus: 'verified' },
        { platform: 'pinterest', configured: false, verificationStatus: 'unverified' },
      ],
    }),
  });
  const check = await checkWorker({ env: {}, fetchImpl });
  assert.equal(check.ready, true);
  assert.deepEqual(check.accounts, { configured: 2, verified: 2 });
});

test('stale configured account blocks LIVE readiness', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 'ok',
      paused: false,
      accounts: [{ platform: 'facebook', configured: true, verificationStatus: 'stale' }],
    }),
  });
  const check = await checkWorker({ env: {}, fetchImpl });
  assert.equal(check.ready, false);
  assert.equal(check.detail, 'account_verification_required');
});
