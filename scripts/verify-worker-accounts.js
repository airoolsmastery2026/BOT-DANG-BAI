'use strict';

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'linkedin', 'pinterest', 'youtube'];

function normalizeBaseUrl(value) {
  const raw = String(value || 'http://127.0.0.1:8794').trim().replace(/\/$/, '');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Worker URL phải dùng HTTP/HTTPS.');
  return url.toString().replace(/\/$/, '');
}

function shouldRefreshAccount(account, force = false) {
  if (!account?.configured) return false;
  if (force) return true;
  return account.stale === true || account.verificationStatus !== 'verified';
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `Worker HTTP ${response.status}`);
    error.code = payload?.errorCode || `HTTP_${response.status}`;
    throw error;
  }
  return payload;
}

async function refreshWorkerAccounts({ baseUrl, token, force = false, fetchImpl = fetch }) {
  const workerUrl = normalizeBaseUrl(baseUrl);
  const workerToken = String(token || '').trim();
  if (!workerToken) throw new Error('DHP_PUBLISHING_WORKER_TOKEN is required.');

  const healthResponse = await fetchImpl(`${workerUrl}/health`, { cache: 'no-store' });
  const health = await readJson(healthResponse);
  const accounts = health?.accounts && typeof health.accounts === 'object' ? health.accounts : {};

  const candidates = SUPPORTED_PLATFORMS.filter((platform) => shouldRefreshAccount(accounts[platform], force));
  const results = [];

  for (const platform of candidates) {
    try {
      const response = await fetchImpl(`${workerUrl}/v1/accounts/${platform}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      const payload = await readJson(response);
      results.push({ platform, ok: true, account: payload?.data?.account || null });
    } catch (error) {
      results.push({
        platform,
        ok: false,
        errorCode: error?.code || 'VERIFY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    worker: workerUrl,
    checked: candidates.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    skipped: SUPPORTED_PLATFORMS.length - candidates.length,
    results,
  };
}

async function main() {
  const force = process.argv.includes('--all');
  const report = await refreshWorkerAccounts({
    baseUrl: process.env.DHP_PUBLISHING_WORKER_URL || 'http://127.0.0.1:8794',
    token: process.env.DHP_PUBLISHING_WORKER_TOKEN,
    force,
  });

  console.log(`Worker account verification: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped.`);
  for (const item of report.results) {
    console.log(item.ok
      ? `PASS ${item.platform}`
      : `FAIL ${item.platform} [${item.errorCode}] ${item.message}`);
  }
  if (report.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { SUPPORTED_PLATFORMS, normalizeBaseUrl, shouldRefreshAccount, refreshWorkerAccounts };
