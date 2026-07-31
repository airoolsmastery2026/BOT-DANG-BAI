const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.ZALO_SERVER_PORT || 8787);
const HOST = process.env.ZALO_SERVER_HOST || '0.0.0.0';
const ACCESS_TOKEN = (process.env.ZALO_OA_ACCESS_TOKEN || '').trim();
const ALLOWED_ORIGIN = process.env.ZALO_ALLOWED_ORIGIN || 'http://localhost:3000';
const API_KEY = (process.env.ZALO_SERVER_API_KEY || '').trim();
const STORE_PATH = process.env.ZALO_STORE_PATH || path.join(__dirname, 'zalo-messages.json');
const ZALO_ENDPOINT = process.env.ZALO_OA_ENDPOINT || 'https://openapi.zalo.me/v3.0/oa/message/cs';

let schedulerRunning = false;

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (error) {
    console.error('Không thể đọc Zalo store:', error);
    return [];
  }
};

const writeStore = (messages) => {
  const directory = path.dirname(STORE_PATH);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(messages, null, 2), 'utf8');
  fs.renameSync(temporary, STORE_PATH);
};

const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) reject(new Error('Request quá lớn'));
  });
  req.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) : {});
    } catch {
      reject(new Error('JSON không hợp lệ'));
    }
  });
  req.on('error', reject);
});

const isAuthorized = (req) => !API_KEY || req.headers['x-api-key'] === API_KEY;

const validateMessage = ({ userId, content, scheduledTime }) => {
  if (!String(userId || '').trim()) throw new Error('Thiếu Zalo user_id');
  if (!String(content || '').trim()) throw new Error('Nội dung không được để trống');
  const date = scheduledTime ? new Date(scheduledTime) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('Thời gian gửi không hợp lệ');
  return date.toISOString();
};

const sendTextMessage = async (message) => {
  if (!ACCESS_TOKEN) throw new Error('Server chưa cấu hình ZALO_OA_ACCESS_TOKEN');

  const response = await fetch(ZALO_ENDPOINT, {
    method: 'POST',
    headers: {
      access_token: ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { user_id: message.userId },
      message: { text: message.content },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(data.error) !== 0) {
    throw new Error(data.message || data.error_name || `Zalo OA API HTTP ${response.status}`);
  }

  return {
    success: true,
    messageId: data.data?.message_id || data.message_id || null,
  };
};

const processDueMessages = async () => {
  if (schedulerRunning) return [];
  schedulerRunning = true;

  try {
    const messages = readStore();
    const now = Date.now();
    const processed = [];

    for (const message of messages) {
      if (message.status !== 'scheduled') continue;
      if (new Date(message.scheduledTime).getTime() > now) continue;

      message.status = 'sending';
      message.attempts = Number(message.attempts || 0) + 1;
      writeStore(messages);

      try {
        const result = await sendTextMessage(message);
        message.status = 'sent';
        message.sentAt = new Date().toISOString();
        message.result = result;
        message.lastError = null;
      } catch (error) {
        message.status = message.attempts >= 3 ? 'failed' : 'scheduled';
        message.lastError = error.message;
        message.nextRetryAt = message.status === 'scheduled'
          ? new Date(Date.now() + message.attempts * 60_000).toISOString()
          : null;
        if (message.nextRetryAt) message.scheduledTime = message.nextRetryAt;
      }

      processed.push(message);
      writeStore(messages);
    }

    return processed;
  } finally {
    schedulerRunning = false;
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (!isAuthorized(req)) return json(res, 401, { success: false, error: 'Không có quyền truy cập' });

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        success: true,
        service: 'zalo-oa-scheduler',
        tokenConfigured: Boolean(ACCESS_TOKEN),
        queued: readStore().filter((item) => item.status === 'scheduled').length,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/zalo/messages') {
      return json(res, 200, { success: true, messages: readStore() });
    }

    if (req.method === 'POST' && url.pathname === '/api/zalo/messages') {
      const body = await readBody(req);
      const scheduledTime = validateMessage(body);
      const messages = readStore();
      const message = {
        id: crypto.randomUUID(),
        userId: String(body.userId).trim(),
        content: String(body.content).trim(),
        scheduledTime,
        status: 'scheduled',
        attempts: 0,
        createdAt: new Date().toISOString(),
      };
      messages.push(message);
      writeStore(messages);
      if (new Date(scheduledTime).getTime() <= Date.now()) await processDueMessages();
      return json(res, 201, { success: true, message: readStore().find((item) => item.id === message.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/zalo/process') {
      const processed = await processDueMessages();
      return json(res, 200, { success: true, processed });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/zalo/messages/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const messages = readStore();
      const next = messages.filter((item) => item.id !== id);
      if (next.length === messages.length) return json(res, 404, { success: false, error: 'Không tìm thấy tin nhắn' });
      writeStore(next);
      return json(res, 200, { success: true });
    }

    return json(res, 404, { success: false, error: 'Endpoint không tồn tại' });
  } catch (error) {
    console.error(error);
    return json(res, 400, { success: false, error: error.message });
  }
});

setInterval(() => {
  processDueMessages().catch((error) => console.error('Zalo scheduler error:', error));
}, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Zalo OA server đang chạy tại http://${HOST}:${PORT}`);
  console.log(`Access token: ${ACCESS_TOKEN ? 'đã cấu hình' : 'CHƯA cấu hình'}`);
});
