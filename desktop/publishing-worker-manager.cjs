'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const SECRET_STORE_VERSION = 1;
const READY_TIMEOUT_MS = 15_000;
const SUPPORTED_PLATFORMS = new Set([
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'pinterest',
  'youtube',
]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const findFreePort = (host = '127.0.0.1') => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.once('error', reject);
  probe.listen(0, host, () => {
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : null;
    probe.close((error) => {
      if (error) reject(error);
      else if (!port) reject(new Error('Không thể cấp cổng loopback cho Publishing Worker.'));
      else resolve(port);
    });
  });
});

const writeAtomic = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, value, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch { /* Windows ACL/ASAR compatibility. */ }
};

const encryptString = async (safeStorage, value) => {
  if (typeof safeStorage.encryptStringAsync === 'function') {
    return safeStorage.encryptStringAsync(value);
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage chưa sẵn sàng; worker từ chối lưu secret dạng rõ.');
  }
  return safeStorage.encryptString(value);
};

const decryptString = async (safeStorage, value) => {
  if (typeof safeStorage.decryptStringAsync === 'function') {
    const decrypted = await safeStorage.decryptStringAsync(value);
    return decrypted.result;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage chưa sẵn sàng; không thể mở worker secret.');
  }
  return safeStorage.decryptString(value);
};

const createSecrets = () => ({
  workerToken: crypto.randomBytes(32).toString('base64url'),
  vaultKey: crypto.randomBytes(48).toString('base64url'),
});

const isValidSecrets = (value) => value
  && typeof value === 'object'
  && typeof value.workerToken === 'string'
  && value.workerToken.length >= 32
  && typeof value.vaultKey === 'string'
  && value.vaultKey.length >= 32;

const loadOrCreateSecrets = async ({ filePath, safeStorage }) => {
  if (fs.existsSync(filePath)) {
    try {
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (record.version !== SECRET_STORE_VERSION || typeof record.protectedData !== 'string') {
        throw new Error('schema không tương thích');
      }
      const plaintext = await decryptString(safeStorage, Buffer.from(record.protectedData, 'base64'));
      const secrets = JSON.parse(plaintext);
      if (!isValidSecrets(secrets)) throw new Error('secret không hợp lệ');
      return secrets;
    } catch (cause) {
      const error = new Error('Kho secret desktop bị hỏng hoặc không thuộc tài khoản Windows hiện tại; ứng dụng từ chối ghi đè.');
      error.code = 'DESKTOP_SECRET_STORE_CORRUPT';
      error.cause = cause;
      throw error;
    }
  }

  const secrets = createSecrets();
  const protectedData = await encryptString(safeStorage, JSON.stringify(secrets));
  writeAtomic(filePath, JSON.stringify({
    version: SECRET_STORE_VERSION,
    protectedData: Buffer.from(protectedData).toString('base64'),
  }, null, 2));
  return secrets;
};

const normalizePlatform = (value) => {
  const platform = String(value || '').trim().toLowerCase();
  if (!SUPPORTED_PLATFORMS.has(platform)) throw new Error('Nền tảng worker không được hỗ trợ.');
  return platform;
};

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return value;
};

const safeJobId = (value) => {
  const jobId = String(value || '').trim();
  if (!jobId || jobId.length > 200 || /[^A-Za-z0-9._:-]/.test(jobId)) {
    throw new Error('Publishing job ID không hợp lệ.');
  }
  return jobId;
};

const createDesktopPublishingWorker = ({
  app,
  safeStorage,
  utilityProcess,
  workerEntry,
  fetchImpl = global.fetch,
  portAllocator = findFreePort,
}) => {
  let child = null;
  let endpoint = null;
  let workerToken = null;
  let startPromise = null;

  const request = async (requestPath, { method = 'GET', body, idempotencyKey } = {}) => {
    if (!endpoint || !workerToken) throw new Error('Publishing Worker desktop chưa sẵn sàng.');
    const response = await fetchImpl(`${endpoint}${requestPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${workerToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey).slice(0, 200) } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(35_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Publishing Worker HTTP ${response.status}`);
      error.code = payload.errorCode || `HTTP_${response.status}`;
      if (payload.existingJobId) error.existingJobId = payload.existingJobId;
      throw error;
    }
    return payload.data ?? payload;
  };

  const waitUntilReady = async () => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!child) throw new Error('Publishing Worker đã dừng trước khi sẵn sàng.');
      try {
        const health = await request('/health');
        if (health?.status === 'ok') return health;
      } catch {
        // The utility process may still be binding its loopback port.
      }
      await delay(120);
    }
    throw new Error('Publishing Worker desktop không sẵn sàng trong thời gian cho phép.');
  };

  const start = async () => {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const userDataPath = app.getPath('userData');
      const statePath = path.join(userDataPath, 'publishing-worker');
      const secrets = await loadOrCreateSecrets({
        filePath: path.join(statePath, 'desktop-worker-secrets.json'),
        safeStorage,
      });
      const port = await portAllocator('127.0.0.1');
      endpoint = `http://127.0.0.1:${port}`;
      workerToken = secrets.workerToken;

      child = utilityProcess.fork(workerEntry, [], {
        cwd: statePath,
        env: {
          ...process.env,
          DHP_PUBLISHING_WORKER_HOST: '127.0.0.1',
          DHP_PUBLISHING_WORKER_PORT: String(port),
          DHP_PUBLISHING_WORKER_TOKEN: secrets.workerToken,
          DHP_PUBLISHING_VAULT_KEY: secrets.vaultKey,
          DHP_PUBLISHING_WORKER_PATH: path.join(statePath, 'jobs.json'),
          DHP_PUBLISHING_VAULT_PATH: path.join(statePath, 'vault.json'),
          DHP_PUBLISHING_CONTROL_PATH: path.join(statePath, 'control.json'),
        },
        serviceName: 'DHP Publishing Worker',
        stdio: 'ignore',
      });
      child.once('exit', () => {
        child = null;
        endpoint = null;
        workerToken = null;
        startPromise = null;
      });
      await waitUntilReady();
      return { running: true, managed: true };
    })().catch((error) => {
      child?.kill();
      child = null;
      endpoint = null;
      workerToken = null;
      startPromise = null;
      throw error;
    });
    return startPromise;
  };

  const stop = () => {
    child?.kill();
    child = null;
    endpoint = null;
    workerToken = null;
    startPromise = null;
  };

  return {
    start,
    stop,
    health: () => request('/health'),
    saveAccount: (platform, credentials) => request(`/v1/accounts/${normalizePlatform(platform)}`, {
      method: 'PUT',
      body: assertPlainObject(credentials, 'Credential payload'),
    }),
    verifyAccount: (platform) => request(`/v1/accounts/${normalizePlatform(platform)}/verify`, { method: 'POST' }),
    removeAccount: (platform) => request(`/v1/accounts/${normalizePlatform(platform)}`, { method: 'DELETE' }),
    createJob: (job) => {
      const payload = assertPlainObject(job, 'Publishing job');
      return request('/v1/jobs', {
        method: 'POST',
        body: payload,
        idempotencyKey: payload.idempotencyKey,
      });
    },
    listJobs: () => request('/v1/jobs'),
    processJobs: () => request('/v1/jobs/process', { method: 'POST' }),
    retryJob: (jobId) => request(`/v1/jobs/${encodeURIComponent(safeJobId(jobId))}/retry`, { method: 'POST' }),
  };
};

module.exports = {
  SUPPORTED_PLATFORMS,
  createDesktopPublishingWorker,
  findFreePort,
  loadOrCreateSecrets,
};
