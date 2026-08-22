'use strict';

const { fetchPublishingContent } = require('../server/dhp-website-client');

const REQUIRED_CONFIG = [
  'DHP_WEBSITE_BASE_URL',
  'ECOSYSTEM_SERVICE_API_KEY',
  'ECOSYSTEM_WEBHOOK_SECRET',
  'BOT_INGEST_TOKEN',
  'DHP_PUBLISHING_WORKER_TOKEN',
  'DHP_PUBLISHING_VAULT_KEY',
  'DHP_PUBLISHING_CONTROL_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CONTROL_OPERATORS',
];

const looksConfigured = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  return !/^(replace-with|changeme|example|todo|your-)/i.test(normalized);
};

const buildWorkerHealthUrl = (env) => {
  const host = String(env.DHP_PUBLISHING_WORKER_HOST || '127.0.0.1').trim();
  const port = Number(env.DHP_PUBLISHING_WORKER_PORT || 8794);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Worker host/port configuration is invalid.');
  }
  return `http://${host}:${port}/health`;
};

const configReadiness = (env) => REQUIRED_CONFIG.map((name) => ({
  name,
  ready: looksConfigured(env[name]),
}));

const sanitizeError = (error) => ({
  name: error instanceof Error ? error.name : 'Error',
  code: typeof error?.code === 'string' ? error.code : null,
  status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
});

async function checkWebsite({ fetchPublishingContentImpl = fetchPublishingContent } = {}) {
  try {
    const page = await fetchPublishingContentImpl({ limit: 1 });
    return {
      name: 'website_authenticated_content',
      ready: Boolean(page && Array.isArray(page.items)),
      detail: page && Array.isArray(page.items) ? 'reachable' : 'unexpected_response',
    };
  } catch (error) {
    return {
      name: 'website_authenticated_content',
      ready: false,
      detail: 'unavailable',
      error: sanitizeError(error),
    };
  }
}

async function checkWorker({ env = process.env, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(buildWorkerHealthUrl(env), { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        name: 'publishing_worker_health',
        ready: false,
        detail: 'unavailable',
        status: response.status,
      };
    }

    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    const configured = accounts.filter((account) => account?.configured === true);
    const notReady = configured.filter((account) => account?.verificationStatus !== 'verified');
    const paused = body.paused === true;

    return {
      name: 'publishing_worker_health',
      ready: body.status === 'ok' && !paused && notReady.length === 0,
      detail: paused ? 'paused' : notReady.length ? 'account_verification_required' : 'live_ready',
      queue: {
        total: Number(body.queue?.total || 0),
        due: Number(body.queue?.due || 0),
      },
      accounts: {
        configured: configured.length,
        verified: configured.length - notReady.length,
      },
    };
  } catch (error) {
    return {
      name: 'publishing_worker_health',
      ready: false,
      detail: 'offline',
      error: sanitizeError(error),
    };
  }
}

async function runPreflight({
  env = process.env,
  network = false,
  fetchImpl = fetch,
  fetchPublishingContentImpl = fetchPublishingContent,
} = {}) {
  const config = configReadiness(env);
  const missing = config.filter((item) => !item.ready).map((item) => item.name);
  const checks = [];

  if (network && missing.length === 0) {
    checks.push(await checkWebsite({ fetchPublishingContentImpl }));
    checks.push(await checkWorker({ env, fetchImpl }));
  }

  const ready = missing.length === 0 && (!network || checks.every((check) => check.ready));
  return {
    schemaVersion: '1.0',
    ready,
    mode: network ? 'network' : 'config-only',
    config,
    missing,
    checks,
  };
}

const printHuman = (report) => {
  console.log(`DHP production preflight: ${report.ready ? 'READY' : 'NOT READY'}`);
  console.log(`Mode: ${report.mode}`);
  for (const item of report.config) {
    console.log(`- ${item.name}: ${item.ready ? 'ready' : 'missing'}`);
  }
  for (const check of report.checks) {
    console.log(`- ${check.name}: ${check.ready ? 'ready' : check.detail}`);
  }
};

if (require.main === module) {
  const network = process.argv.includes('--network');
  const json = process.argv.includes('--json');
  runPreflight({ network })
    .then((report) => {
      if (json) console.log(JSON.stringify(report, null, 2));
      else printHuman(report);
      process.exitCode = report.ready ? 0 : 2;
    })
    .catch((error) => {
      console.error('DHP production preflight failed', sanitizeError(error));
      process.exitCode = 3;
    });
}

module.exports = {
  REQUIRED_CONFIG,
  buildWorkerHealthUrl,
  checkWebsite,
  checkWorker,
  configReadiness,
  looksConfigured,
  runPreflight,
};
