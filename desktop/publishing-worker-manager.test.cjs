'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  createDesktopPublishingWorker,
  loadOrCreateSecrets,
} = require('./publishing-worker-manager.cjs');

const makeSafeStorage = () => ({
  encryptStringAsync: async (value) => Buffer.from(`protected:${value}`, 'utf8'),
  decryptStringAsync: async (value) => ({
    result: value.toString('utf8').replace(/^protected:/, ''),
    shouldReEncrypt: false,
  }),
});

test('desktop worker secrets are generated once and protected on disk', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-worker-secret-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'secrets.json');
  const safeStorage = makeSafeStorage();

  const first = await loadOrCreateSecrets({ filePath, safeStorage });
  const stored = fs.readFileSync(filePath, 'utf8');
  const second = await loadOrCreateSecrets({ filePath, safeStorage });

  assert.equal(first.workerToken, second.workerToken);
  assert.equal(first.vaultKey, second.vaultKey);
  assert.ok(first.workerToken.length >= 32);
  assert.ok(first.vaultKey.length >= 32);
  assert.doesNotMatch(stored, new RegExp(first.workerToken));
  assert.doesNotMatch(stored, new RegExp(first.vaultKey));
});

test('desktop worker stores runtime state under userData and proxies only typed operations', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-worker-runtime-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const requests = [];
  let forkOptions;
  const child = new EventEmitter();
  child.kill = () => true;

  const worker = createDesktopPublishingWorker({
    app: { getPath: (name) => name === 'userData' ? directory : '' },
    safeStorage: makeSafeStorage(),
    utilityProcess: {
      fork: (_entry, _args, options) => {
        forkOptions = options;
        return child;
      },
    },
    workerEntry: path.join(directory, 'app.asar', 'server', 'publishing-worker.js'),
    portAllocator: async () => 18794,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      const pathname = new URL(url).pathname;
      if (pathname === '/health') {
        return { ok: true, json: async () => ({ status: 'ok', accounts: [] }) };
      }
      return { ok: true, json: async () => ({ data: { pathname, method: options.method || 'GET' } }) };
    },
  });

  await worker.start();
  await worker.saveAccount('linkedin', { accessToken: 'token', authorUrn: 'urn:li:person:1' });
  await worker.createJob({ content: 'Hello', platforms: ['linkedin'], scheduledTime: new Date().toISOString() });

  const stateRoot = path.join(directory, 'publishing-worker');
  assert.equal(forkOptions.env.DHP_PUBLISHING_WORKER_PATH, path.join(stateRoot, 'jobs.json'));
  assert.equal(forkOptions.env.DHP_PUBLISHING_VAULT_PATH, path.join(stateRoot, 'vault.json'));
  assert.equal(forkOptions.env.DHP_PUBLISHING_CONTROL_PATH, path.join(stateRoot, 'control.json'));
  assert.equal(forkOptions.env.DHP_PUBLISHING_WORKER_HOST, '127.0.0.1');
  assert.equal(forkOptions.stdio, 'ignore');
  assert.ok(requests.some(({ url, options }) => new URL(url).pathname === '/v1/accounts/linkedin' && options.method === 'PUT'));
  assert.ok(requests.some(({ url, options }) => new URL(url).pathname === '/v1/jobs' && options.method === 'POST'));
  assert.ok(requests.every(({ options }) => String(options.headers?.Authorization || '').startsWith('Bearer ')));
  assert.throws(() => worker.saveAccount('zalo', {}), /không được hỗ trợ/);
  worker.stop();
});

test('desktop secret store fails closed instead of replacing corrupt data', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-worker-corrupt-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'secrets.json');
  fs.writeFileSync(filePath, '{"version":1,"protectedData":"not-valid"}');

  await assert.rejects(
    () => loadOrCreateSecrets({ filePath, safeStorage: makeSafeStorage() }),
    (error) => error.code === 'DESKTOP_SECRET_STORE_CORRUPT',
  );
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{"version":1,"protectedData":"not-valid"}');
});
