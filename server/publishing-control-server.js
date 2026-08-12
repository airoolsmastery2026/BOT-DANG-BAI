const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { createPublishingControlRuntime } = require('./publishing-control-runtime');

const HOST = process.env.DHP_PUBLISHING_CONTROL_HOST || '127.0.0.1';
const PORT = Number(process.env.DHP_PUBLISHING_CONTROL_PORT || 8792);
const TOKEN = String(process.env.DHP_PUBLISHING_CONTROL_TOKEN || process.env.DHP_MEDIA_INGRESS_TOKEN || '').trim();
const STATE_PATH = process.env.DHP_PUBLISHING_CONTROL_PATH || path.join(__dirname, 'dhp-publishing-control.json');
const ALLOWED_ORIGIN = process.env.DHP_PUBLISHING_CONTROL_ORIGIN || 'http://localhost:3000';
const runtime = createPublishingControlRuntime({ statePath: STATE_PATH });

const secureEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const authorized = (req) => {
  if (!TOKEN) return false;
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return Boolean(match && secureEqual(match[1], TOKEN));
};
const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, X-DHP-Source-Service, X-DHP-Request-Id',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
};
const contextFrom = (req) => ({
  actor: String(req.headers['x-dhp-source-service'] || 'publishing-control').slice(0, 160),
  commandId: String(req.headers['idempotency-key'] || '').slice(0, 160),
});

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const requestId = String(req.headers['x-dhp-request-id'] || crypto.randomUUID());

  try {
    if (req.method === 'GET' && url.pathname === '/api/v1/publishing/health') {
      return json(res, 200, { schemaVersion: '1.0', requestId, data: { status: 'ok', scheduler: runtime.getState() } });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/publishing/scheduler/pause') {
      if (!req.headers['idempotency-key']) return json(res, 400, { error: 'Idempotency-Key is required' });
      return json(res, 200, { schemaVersion: '1.0', requestId, data: runtime.pause(contextFrom(req)) });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/publishing/scheduler/resume') {
      if (!req.headers['idempotency-key']) return json(res, 400, { error: 'Idempotency-Key is required' });
      return json(res, 200, { schemaVersion: '1.0', requestId, data: runtime.resume(contextFrom(req)) });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error?.code === 'CONTROL_STATE_CORRUPT' ? 503 : 500;
    return json(res, status, {
      error: 'Publishing control state unavailable.',
      errorCode: error?.code || 'CONTROL_STATE_UNAVAILABLE',
    });
  }
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) console.warn('DHP_PUBLISHING_CONTROL_TOKEN chưa cấu hình; API sẽ trả 401.');
  console.log(`DHP Publishing Control listening on http://${HOST}:${PORT}`);
});
