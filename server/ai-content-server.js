'use strict';

const http = require('http');
const {
  buildContentPrompt,
  extractGeminiText,
  normalizeGenerateRequest,
} = require('./ai-content-runtime');

const HOST = String(process.env.DHP_AI_CONTENT_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.DHP_AI_CONTENT_PORT || 8793);
const ALLOWED_ORIGIN = String(process.env.DHP_AI_CONTENT_ORIGIN || 'http://localhost:3000').trim();
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const REQUEST_TIMEOUT_MS = Math.max(Number(process.env.DHP_AI_CONTENT_TIMEOUT_MS || 30_000), 5_000);
const MAX_BODY_BYTES = 32_000;

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0;
  let body = '';

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
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error('JSON không hợp lệ.'));
    }
  });
  req.on('error', reject);
});

const generateWithGemini = async (input) => {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY chưa được cấu hình trên AI Content Server.');
  const prompt = buildContentPrompt(input);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload?.error?.message || `Gemini HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return {
    text: extractGeminiText(payload),
    model: GEMINI_MODEL,
  };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const origin = String(req.headers.origin || '').trim();
  if (origin && origin !== ALLOWED_ORIGIN) {
    return json(res, 403, { error: 'Origin không được phép.' });
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      status: 'ok',
      service: 'dhp-ai-content',
      configured: Boolean(GEMINI_API_KEY),
      provider: 'gemini',
      model: GEMINI_MODEL,
    });
  }

  if (req.method !== 'POST' || url.pathname !== '/api/v1/content/generate') {
    return json(res, 404, { error: 'Not found' });
  }

  try {
    const body = await readBody(req);
    const input = normalizeGenerateRequest(body);
    const result = await generateWithGemini(input);
    return json(res, 200, { data: result });
  } catch (error) {
    const status = error?.message === 'Payload quá lớn.' ? 413
      : error?.message === 'JSON không hợp lệ.' || error?.message?.includes('Chủ đề') ? 400
        : error?.status === 429 ? 429
          : 502;
    return json(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, HOST, () => {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY chưa cấu hình; /health vẫn hoạt động nhưng generate sẽ trả lỗi.');
  }
  console.log(`DHP AI Content Server listening on http://${HOST}:${PORT}`);
});
