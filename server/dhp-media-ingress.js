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
    createdAt: new Date().toISOString(),
    importedAt: null,
    importedPostId: null,
  };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.url === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', service: 'dhp-media-ingress' });
  if (!isAuthorized(req)) return json(res, 401, { error: 'Unauthorized' });

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/v1/media/packages') {
      const status = url.searchParams.get('status');
      const entries = readStore().filter((entry) => !status || entry.status === status);
      return json(res, 200, { data: entries });
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
      entries[index] = {
        ...entries[index],
        status: 'imported',
        importedAt: new Date().toISOString(),
        importedPostId: String(body.postId || '').trim() || null,
      };
      writeStore(entries);
      return json(res, 200, { data: entries[index] });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) console.warn('DHP_MEDIA_INGRESS_TOKEN chưa cấu hình; mọi route riêng tư sẽ trả 401.');
  console.log(`DHP Media Ingress listening on http://${HOST}:${PORT}`);
});
