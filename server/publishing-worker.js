'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  JOB_STATUS,
  assertNoDuplicate,
  getDueJobs,
  markDeadLetter,
  markPublishing,
  mergePublishResults,
  normalizeJob,
  normalizeStoredJobs,
  recoverStuckJobs,
  retryJob,
  summarizeJobs,
} = require('./publishing-worker-runtime');
const { createCredentialVault } = require('./publishing-worker-vault');

const HOST = String(process.env.DHP_PUBLISHING_WORKER_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.DHP_PUBLISHING_WORKER_PORT || 8794);
const API_TOKEN = String(process.env.DHP_PUBLISHING_WORKER_TOKEN || '').trim();
const ALLOWED_ORIGIN = String(process.env.DHP_PUBLISHING_WORKER_ORIGIN || 'http://localhost:3000').trim();
const STORE_PATH = process.env.DHP_PUBLISHING_WORKER_PATH || path.join(__dirname, 'dhp-publishing-worker.json');
const VAULT_PATH = process.env.DHP_PUBLISHING_VAULT_PATH || path.join(__dirname, 'dhp-publishing-vault.json');
const VAULT_KEY = String(process.env.DHP_PUBLISHING_VAULT_KEY || '').trim();
const CONTROL_PATH = process.env.DHP_PUBLISHING_CONTROL_PATH || path.join(__dirname, 'dhp-publishing-control.json');
const INTERVAL_MS = Math.max(Number(process.env.DHP_PUBLISHING_WORKER_INTERVAL_MS || 30_000), 5_000);
const REQUEST_TIMEOUT_MS = Math.max(Number(process.env.DHP_PUBLISHING_WORKER_TIMEOUT_MS || 30_000), 5_000);
const META_VERSION = /^v\d+\.\d+$/.test(String(process.env.DHP_META_GRAPH_API_VERSION || 'v25.0').trim())
  ? String(process.env.DHP_META_GRAPH_API_VERSION || 'v25.0').trim()
  : 'v25.0';
const MAX_BODY_BYTES = 64_000;

if (!API_TOKEN) throw new Error('DHP_PUBLISHING_WORKER_TOKEN is required');
if (!VAULT_KEY) throw new Error('DHP_PUBLISHING_VAULT_KEY is required');

const vault = createCredentialVault({ filePath: VAULT_PATH, secret: VAULT_KEY });
let activeProcessing = null;
let stopping = false;

const atomicWriteJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, filePath);
};

const readJobs = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return normalizeStoredJobs(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')));
  } catch {
    return [];
  }
};

const writeJobs = (jobs) => atomicWriteJson(STORE_PATH, jobs);

const schedulerPaused = () => {
  try {
    if (!fs.existsSync(CONTROL_PATH)) return false;
    const state = JSON.parse(fs.readFileSync(CONTROL_PATH, 'utf8'));
    return state?.scheduler?.paused === true || state?.paused === true;
  } catch {
    return false;
  }
};

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(body));
};

const authorized = (req) => {
  const expected = `Bearer ${API_TOKEN}`;
  return String(req.headers.authorization || '') === expected;
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(new Error('Payload quá lớn.'));
      req.destroy();
      return;
    }
    body += chunk;
  });
  req.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}); }
    catch { reject(new Error('JSON không hợp lệ.')); }
  });
  req.on('error', reject);
});

const readRemote = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  const platformError = body?.error;
  if (!response.ok || platformError) {
    const error = new Error(platformError?.message || fallback || `HTTP ${response.status}`);
    error.code = platformError?.code || platformError?.error_code || `HTTP_${response.status}`;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return body;
};

const resultFailure = (error) => ({
  success: false,
  error: error instanceof Error ? error.message : String(error),
  errorCode: error?.code || 'PUBLISH_FAILED',
  retryable: error?.retryable === true,
  attemptedAt: new Date().toISOString(),
});

const metaHeaders = (token, form = false) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } : {}),
});

const publishFacebook = async (job, credentials) => {
  const pageId = job.targetIds.facebook || credentials.pageId;
  if (!pageId) throw new Error('Facebook Page ID chưa được cấu hình.');
  const imageUrl = String(job.imageUrl || '').trim();
  const endpoint = imageUrl ? 'photos' : 'feed';
  const body = new URLSearchParams(imageUrl
    ? { url: imageUrl, caption: job.content }
    : { message: job.content });
  const response = await fetch(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(pageId)}/${endpoint}`, {
    method: 'POST',
    headers: metaHeaders(credentials.accessToken, true),
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await readRemote(response, 'Facebook publish failed.');
  return { success: true, externalPostId: data.id || data.post_id || null, publishedAt: new Date().toISOString() };
};

const publishInstagram = async (job, credentials) => {
  const userId = job.targetIds.instagram || credentials.userId;
  if (!userId) throw new Error('Instagram Business/Creator ID chưa được cấu hình.');
  if (!/^https?:\/\//i.test(job.imageUrl)) throw new Error('Instagram cần image URL HTTP/HTTPS công khai.');

  const containerResponse = await fetch(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(userId)}/media`, {
    method: 'POST',
    headers: metaHeaders(credentials.accessToken, true),
    body: new URLSearchParams({ image_url: job.imageUrl, caption: job.content }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const container = await readRemote(containerResponse, 'Instagram media container failed.');
  if (!container.id) throw new Error('Instagram không trả về creation ID.');

  const publishResponse = await fetch(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(userId)}/media_publish`, {
    method: 'POST',
    headers: metaHeaders(credentials.accessToken, true),
    body: new URLSearchParams({ creation_id: container.id }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await readRemote(publishResponse, 'Instagram publish failed.');
  return { success: true, externalPostId: data.id || null, publishedAt: new Date().toISOString() };
};

const getTikTokCreator = async (credentials) => {
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return readRemote(response, 'TikTok creator info failed.');
};

const publishTikTok = async (job, credentials) => {
  if (!/^https?:\/\//i.test(job.videoUrl)) throw new Error('TikTok cần video URL HTTP/HTTPS công khai.');
  const creator = await getTikTokCreator(credentials);
  const privacy = Array.isArray(creator?.data?.privacy_level_options)
    ? creator.data.privacy_level_options
    : [];
  if (!privacy.includes('SELF_ONLY')) throw new Error('TikTok account không cho phép SELF_ONLY trong creator info.');

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: { title: job.content, privacy_level: 'SELF_ONLY' },
      source_info: { source: 'PULL_FROM_URL', video_url: job.videoUrl },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await readRemote(response, 'TikTok publish failed.');
  return { success: true, externalPostId: data?.data?.publish_id || null, publishedAt: new Date().toISOString() };
};

const verifyPlatform = async (platform) => {
  const credentials = vault.get(platform);
  if (!credentials) throw new Error(`${platform}: chưa có credential trong worker vault.`);

  if (platform === 'facebook') {
    const response = await fetch(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(credentials.pageId)}?fields=id,name`, {
      headers: metaHeaders(credentials.accessToken),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await readRemote(response, 'Facebook verify failed.');
    if (String(data.id || '') !== credentials.pageId) throw new Error('Facebook token không khớp Page ID trong vault.');
    return { platform, ok: true, account: { id: data.id, name: data.name } };
  }

  if (platform === 'instagram') {
    const response = await fetch(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(credentials.userId)}?fields=id,username,name`, {
      headers: metaHeaders(credentials.accessToken),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await readRemote(response, 'Instagram verify failed.');
    if (String(data.id || '') !== credentials.userId) throw new Error('Instagram token không khớp Business/Creator ID trong vault.');
    return { platform, ok: true, account: { id: data.id, name: data.username || data.name } };
  }

  if (platform === 'tiktok') {
    const data = await getTikTokCreator(credentials);
    return { platform, ok: true, account: { name: data?.data?.creator_nickname || data?.data?.creator_username || 'TikTok creator' } };
  }

  throw new Error('Nền tảng chưa được hỗ trợ.');
};

const publishPlatform = async (platform, job) => {
  try {
    const credentials = vault.get(platform);
    if (!credentials) throw new Error(`${platform}: chưa có credential trong worker vault.`);
    if (platform === 'facebook') return await publishFacebook(job, credentials);
    if (platform === 'instagram') return await publishInstagram(job, credentials);
    if (platform === 'tiktok') return await publishTikTok(job, credentials);
    throw new Error(`Nền tảng ${platform} chưa được worker hỗ trợ.`);
  } catch (error) {
    return resultFailure(error);
  }
};

const processOneJob = async (job, jobs) => {
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index < 0) return null;

  const publishing = markPublishing(jobs[index]);
  jobs[index] = publishing;
  writeJobs(jobs);
  if (publishing.status === JOB_STATUS.DEAD_LETTER) return publishing;

  const results = {};
  for (const platform of publishing.pendingPlatforms) {
    results[platform] = await publishPlatform(platform, publishing);
  }

  let completed = mergePublishResults(publishing, results);
  if (completed.status === JOB_STATUS.FAILED) {
    const failures = completed.pendingPlatforms.map((platform) => completed.results[platform]);
    const retryable = failures.length > 0 && failures.every((result) => result?.retryable === true);
    if (retryable) {
      const delayMs = Math.min(60 * 60_000, 30_000 * (2 ** Math.max(completed.attemptCount - 1, 0)));
      completed = retryJob(completed, { delayMs });
    } else {
      completed = markDeadLetter(completed, { reason: 'Có lỗi không thể retry tự động.' });
    }
  }

  jobs[index] = completed;
  writeJobs(jobs);
  return completed;
};

const processDueJobs = async () => {
  if (activeProcessing) return activeProcessing;
  if (schedulerPaused()) return { paused: true, processed: [] };

  activeProcessing = (async () => {
    let jobs = recoverStuckJobs(readJobs());
    writeJobs(jobs);
    const due = getDueJobs(jobs, { limit: 50 });
    const processed = [];
    for (const dueJob of due) {
      jobs = readJobs();
      const current = jobs.find((item) => item.id === dueJob.id);
      if (!current || current.status !== JOB_STATUS.SCHEDULED) continue;
      const result = await processOneJob(current, jobs);
      if (result) processed.push(result);
    }
    return { paused: false, processed };
  })();

  try { return await activeProcessing; }
  finally { activeProcessing = null; }
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const origin = String(req.headers.origin || '').trim();
  if (origin && origin !== ALLOWED_ORIGIN) return json(res, 403, { error: 'Origin không được phép.' });

  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      status: 'ok',
      service: 'dhp-publishing-worker',
      paused: schedulerPaused(),
      intervalMs: INTERVAL_MS,
      queue: summarizeJobs(readJobs()),
      accounts: vault.list(),
    });
  }

  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });

  try {
    if (req.method === 'GET' && url.pathname === '/v1/jobs') {
      const status = url.searchParams.get('status');
      const jobs = readJobs().filter((job) => !status || job.status === status);
      return json(res, 200, { data: jobs });
    }

    if (req.method === 'POST' && url.pathname === '/v1/jobs') {
      const body = await readBody(req);
      const idempotencyKey = String(req.headers['idempotency-key'] || body.idempotencyKey || '').trim();
      const job = normalizeJob({ ...body, idempotencyKey: idempotencyKey || body.idempotencyKey });
      const jobs = readJobs();
      assertNoDuplicate(jobs, job);
      jobs.push(job);
      writeJobs(jobs);
      return json(res, 201, { data: job });
    }

    if (req.method === 'POST' && url.pathname === '/v1/jobs/process') {
      return json(res, 200, { data: await processDueJobs() });
    }

    const retryMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/retry$/);
    if (req.method === 'POST' && retryMatch) {
      const jobs = readJobs();
      const index = jobs.findIndex((job) => job.id === decodeURIComponent(retryMatch[1]));
      if (index < 0) return json(res, 404, { error: 'Job not found' });
      jobs[index] = retryJob(jobs[index], { delayMs: 1000 });
      writeJobs(jobs);
      return json(res, 200, { data: jobs[index] });
    }

    const accountMatch = url.pathname.match(/^\/v1\/accounts\/(facebook|instagram|tiktok)$/);
    if (accountMatch && req.method === 'PUT') {
      const body = await readBody(req);
      const metadata = vault.set(accountMatch[1], body);
      return json(res, 200, { data: metadata });
    }
    if (accountMatch && req.method === 'DELETE') {
      return json(res, 200, { data: { platform: accountMatch[1], removed: vault.remove(accountMatch[1]) } });
    }

    const verifyMatch = url.pathname.match(/^\/v1\/accounts\/(facebook|instagram|tiktok)\/verify$/);
    if (verifyMatch && req.method === 'POST') {
      return json(res, 200, { data: await verifyPlatform(verifyMatch[1]) });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error?.code === 'DUPLICATE_JOB' ? 409
      : error?.message === 'Payload quá lớn.' ? 413
        : error?.message === 'JSON không hợp lệ.' ? 400
          : 400;
    return json(res, status, {
      error: error instanceof Error ? error.message : String(error),
      ...(error?.existingJobId ? { existingJobId: error.existingJobId } : {}),
    });
  }
});

const timer = setInterval(() => {
  if (stopping) return;
  void processDueJobs().catch((error) => {
    console.warn('Publishing worker cycle failed:', error instanceof Error ? error.message : String(error));
  });
}, INTERVAL_MS);
timer.unref?.();

server.listen(PORT, HOST, () => {
  console.log(`DHP Publishing Worker listening on http://${HOST}:${PORT}`);
  console.log(`Persistent worker interval: ${INTERVAL_MS} ms.`);
  void processDueJobs().catch((error) => console.warn('Initial worker cycle failed:', error?.message || error));
});

const shutdown = (signal) => {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server.close(() => console.log(`DHP Publishing Worker stopped (${signal}).`));
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
