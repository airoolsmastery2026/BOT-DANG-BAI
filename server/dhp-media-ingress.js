const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.DHP_MEDIA_INGRESS_PORT || 8791);
const HOST = process.env.DHP_MEDIA_INGRESS_HOST || '127.0.0.1';
const TOKEN = String(process.env.DHP_MEDIA_INGRESS_TOKEN || '').trim();
const ALLOWED_ORIGIN = process.env.DHP_MEDIA_ALLOWED_ORIGIN || 'http://localhost:3000';
const STORE_PATH = process.env.DHP_MEDIA_INBOX_PATH || path.join(__dirname, 'dhp-media-inbox.json');
const MAX_BODY_BYTES = 1_000_000;

const CONTROL_PLANE_URL = String(process.env.DHP_CONTROL_PLANE_URL || '').trim().replace(/\/+$/, '');
const CONTROL_PLANE_KEY_ID = String(process.env.DHP_CONTROL_PLANE_KEY_ID || '').trim();
const CONTROL_PLANE_SECRET = String(process.env.DHP_CONTROL_PLANE_SECRET || '').trim();
const CLOUD_SYNC_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.DHP_MEDIA_CLOUD_SYNC_INTERVAL_MS || 30_000) || 30_000,
);
const CLOUD_REQUEST_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.DHP_MEDIA_CLOUD_TIMEOUT_MS || 15_000) || 15_000,
);

const isCloudConfigured = () => Boolean(
  CONTROL_PLANE_URL && CONTROL_PLANE_KEY_ID && CONTROL_PLANE_SECRET,
);

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Không thể đọc DHP media inbox:', error);
    return [];
  }
};

const writeStore = (entries) => {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(entries, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, STORE_PATH);
};

const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
};

const secureEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const isAuthorized = (req) => {
  if (!TOKEN) return false;
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && secureEqual(match[1], TOKEN));
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      reject(new Error('Request body vượt quá 1 MB'));
      req.destroy();
      return;
    }
    chunks.push(buffer);
  });
  req.on('end', () => {
    try {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text ? JSON.parse(text) : {});
    } catch {
      reject(new Error('JSON không hợp lệ'));
    }
  });
  req.on('error', reject);
});

const pick = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const asPlatforms = (value) => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))]
  : [];

const normalizePackage = (body) => {
  const pkg = body && typeof body.package === 'object' ? body.package : {};
  const input = body && typeof body.input === 'object' ? body.input : {};
  const output = body && typeof body.output === 'object' ? body.output : {};
  const script = output.script && typeof output.script === 'object' ? output.script : {};
  const render = output.render && typeof output.render === 'object' ? output.render : {};
  const video = output.video && typeof output.video === 'object' ? output.video : {};

  const content = pick(pkg.content, input.content, input.caption, script.text);
  if (!content) throw new Error('Media package thiếu content/caption/script');

  const platforms = asPlatforms(pkg.platforms || input.platforms);
  const scheduledRaw = pick(pkg.scheduledTime, input.scheduledTime) || new Date(Date.now() + 5 * 60_000).toISOString();
  const scheduledTime = new Date(scheduledRaw);
  if (Number.isNaN(scheduledTime.getTime())) throw new Error('scheduledTime không hợp lệ');

  const jobId = pick(body.jobId, pkg.jobId) || crypto.randomUUID();
  const idempotencyKey = pick(pkg.idempotencyKey, body.idempotencyKey) || `${jobId}:publish`;

  return {
    id: crypto.randomUUID(),
    idempotencyKey,
    jobId,
    projectId: pick(body.projectId, pkg.projectId),
    workflowId: pick(body.workflowId, pkg.workflowId),
    content,
    platforms,
    scheduledTime: scheduledTime.toISOString(),
    imageUrl: pick(pkg.imageUrl, input.imageUrl, render.imageUrl, render.url),
    videoUrl: pick(pkg.videoUrl, input.videoUrl, video.videoUrl, video.url),
    targetIds: pkg.targetIds && typeof pkg.targetIds === 'object' ? pkg.targetIds : {},
    status: 'pending',
    source: 'local-ingress',
    remotePackageId: null,
    createdAt: new Date().toISOString(),
    importedAt: null,
    importedPostId: null,
  };
};

const normalizeCloudPackage = (pkg) => {
  const item = asObject(pkg);
  const payload = asObject(item.payload);
  const payloadInput = asObject(payload.input);
  const payloadOutput = asObject(payload.output);
  const script = asObject(payloadOutput.script);
  const render = asObject(payloadOutput.render);
  const video = asObject(payloadOutput.video);

  const remotePackageId = pick(item.id);
  if (!remotePackageId) throw new Error('Cloud package thiếu id');

  const jobId = pick(item.jobId, payload.jobId) || crypto.randomUUID();
  const content = pick(item.content, payloadInput.content, payloadInput.caption, script.text, payloadInput.title);
  if (!content) throw new Error(`Cloud package ${remotePackageId} thiếu content`);

  const scheduledRaw = pick(item.scheduledTime, payloadInput.scheduledTime) || new Date(Date.now() + 5 * 60_000).toISOString();
  const scheduledTime = new Date(scheduledRaw);
  if (Number.isNaN(scheduledTime.getTime())) throw new Error(`Cloud package ${remotePackageId} có scheduledTime không hợp lệ`);

  return {
    id: crypto.randomUUID(),
    idempotencyKey: pick(item.idempotencyKey) || `${jobId}:publish`,
    jobId,
    projectId: pick(item.projectId),
    workflowId: pick(item.workflowId, payload.workflowId),
    content,
    platforms: asPlatforms(item.platforms || payloadInput.platforms),
    scheduledTime: scheduledTime.toISOString(),
    imageUrl: pick(item.imageUrl, payloadInput.imageUrl, render.imageUrl, render.url),
    videoUrl: pick(item.videoUrl, payloadInput.videoUrl, video.videoUrl, video.url),
    targetIds: asObject(item.targetIds),
    status: 'pending',
    source: 'control-plane-cloud',
    remotePackageId,
    createdAt: pick(item.createdAt) || new Date().toISOString(),
    importedAt: null,
    importedPostId: null,
  };
};

const controlPlaneHeaders = () => ({
  Accept: 'application/json',
  Authorization: `DHP-Key ${CONTROL_PLANE_KEY_ID}:${CONTROL_PLANE_SECRET}`,
});

const readRemoteJson = async (response) => {
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Control Plane trả JSON không hợp lệ (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const message = body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new Error(`Control Plane: ${message}`);
  }
  return body;
};

const cloudRequest = async (relativePath, options = {}) => {
  if (!isCloudConfigured()) throw new Error('Cloud Control Plane chưa cấu hình');
  const response = await fetch(`${CONTROL_PLANE_URL}${relativePath}`, {
    ...options,
    headers: {
      ...controlPlaneHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(CLOUD_REQUEST_TIMEOUT_MS),
  });
  return readRemoteJson(response);
};

let activeSync = null;
const syncFromCloud = async () => {
  if (!isCloudConfigured()) return { configured: false, received: 0, added: 0 };
  if (activeSync) return activeSync;

  activeSync = (async () => {
    const body = await cloudRequest('/v1/publish/packages?status=pending');
    const remote = Array.isArray(body.data) ? body.data : [];
    const entries = readStore();
    const known = new Set(entries.map((entry) => entry.idempotencyKey).filter(Boolean));
    let added = 0;

    for (const candidate of remote) {
      try {
        const incoming = normalizeCloudPackage(candidate);
        if (known.has(incoming.idempotencyKey)) continue;
        entries.push(incoming);
        known.add(incoming.idempotencyKey);
        added += 1;
      } catch (error) {
        console.warn('Bỏ qua cloud media package không hợp lệ:', error instanceof Error ? error.message : String(error));
      }
    }

    if (added > 0) writeStore(entries);
    return { configured: true, received: remote.length, added };
  })();

  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
};

const acknowledgeCloudPackage = async (remotePackageId, postId) => {
  if (!remotePackageId) return null;
  return cloudRequest(`/v1/publish/packages/${encodeURIComponent(remotePackageId)}/ack`, {
    method: 'POST',
    body: JSON.stringify({ postId: String(postId || '').trim() || undefined }),
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.url === '/health' && req.method === 'GET') {
    return json(res, 200, {
      status: 'ok',
      service: 'dhp-media-ingress',
      cloudSyncConfigured: isCloudConfigured(),
      cloudSyncIntervalMs: CLOUD_SYNC_INTERVAL_MS,
    });
  }
  if (!isAuthorized(req)) return json(res, 401, { error: 'Unauthorized' });

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'POST' && url.pathname === '/v1/media/sync') {
      const result = await syncFromCloud();
      return json(res, 200, { data: result });
    }

    if (req.method === 'GET' && url.pathname === '/v1/media/packages') {
      let sync = null;
      if (isCloudConfigured()) {
        try {
          sync = await syncFromCloud();
        } catch (error) {
          console.warn('DHP cloud inbox sync thất bại:', error instanceof Error ? error.message : String(error));
          sync = { configured: true, error: 'cloud_sync_failed' };
        }
      }
      const status = url.searchParams.get('status');
      const entries = readStore().filter((entry) => !status || entry.status === status);
      return json(res, 200, { data: entries, sync });
    }

    if (req.method === 'POST' && url.pathname === '/v1/media/packages') {
      const body = await readBody(req);
      const incoming = normalizePackage(body);
      const entries = readStore();
      const duplicate = entries.find((entry) => entry.idempotencyKey === incoming.idempotencyKey);
      if (duplicate) return json(res, 200, { data: duplicate, duplicate: true });
      entries.push(incoming);
      writeStore(entries);
      return json(res, 201, { data: incoming, duplicate: false });
    }

    const ackMatch = url.pathname.match(/^\/v1\/media\/packages\/([^/]+)\/ack$/);
    if (req.method === 'POST' && ackMatch) {
      const body = await readBody(req);
      const entries = readStore();
      const index = entries.findIndex((entry) => entry.id === ackMatch[1]);
      if (index < 0) return json(res, 404, { error: 'Package not found' });

      const postId = String(body.postId || '').trim() || null;
      const entry = entries[index];
      if (entry.remotePackageId) {
        await acknowledgeCloudPackage(entry.remotePackageId, postId);
      }

      entries[index] = {
        ...entry,
        status: 'imported',
        importedAt: new Date().toISOString(),
        importedPostId: postId,
      };
      writeStore(entries);
      return json(res, 200, { data: entries[index] });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Control Plane') ? 502 : 400;
    return json(res, status, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) console.warn('DHP_MEDIA_INGRESS_TOKEN chưa cấu hình; mọi route riêng tư sẽ trả 401.');
  if (isCloudConfigured()) {
    console.log(`DHP cloud media sync enabled every ${CLOUD_SYNC_INTERVAL_MS} ms.`);
    void syncFromCloud().catch((error) => {
      console.warn('DHP cloud inbox initial sync thất bại:', error instanceof Error ? error.message : String(error));
    });
    const timer = setInterval(() => {
      void syncFromCloud().catch((error) => {
        console.warn('DHP cloud inbox background sync thất bại:', error instanceof Error ? error.message : String(error));
      });
    }, CLOUD_SYNC_INTERVAL_MS);
    timer.unref();
  } else {
    console.log('DHP cloud media sync disabled; cấu hình DHP_CONTROL_PLANE_URL/KEY_ID/SECRET để bật.');
  }
  console.log(`DHP Media Ingress listening on http://${HOST}:${PORT}`);
});
