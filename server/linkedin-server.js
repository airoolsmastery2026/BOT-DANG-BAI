const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.LINKEDIN_SERVER_PORT || 8790);
const HOST = process.env.LINKEDIN_SERVER_HOST || '0.0.0.0';
const ACCESS_TOKEN = (process.env.LINKEDIN_ACCESS_TOKEN || '').trim();
const AUTHOR_URN = (process.env.LINKEDIN_AUTHOR_URN || '').trim();
const API_VERSION = (process.env.LINKEDIN_API_VERSION || '202605').trim();
const API_KEY = (process.env.LINKEDIN_SERVER_API_KEY || '').trim();
const ALLOWED_ORIGIN = process.env.LINKEDIN_ALLOWED_ORIGIN || 'http://localhost:3000';
const STORE_PATH = process.env.LINKEDIN_STORE_PATH || path.join(__dirname, 'linkedin-posts.json');
const ENDPOINT = process.env.LINKEDIN_POSTS_ENDPOINT || 'https://api.linkedin.com/rest/posts';
const MAX_ATTEMPTS = Number(process.env.LINKEDIN_MAX_ATTEMPTS || 3);

let processing = false;

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Không thể đọc LinkedIn store:', error);
    return [];
  }
};

const writeStore = (posts) => {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(posts, null, 2), 'utf8');
  fs.renameSync(tempPath, STORE_PATH);
};

const respond = (res, statusCode, payload) => {
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

const validatePost = (body) => {
  const content = String(body.content || '').trim();
  if (!content) throw new Error('Nội dung bài viết không được để trống');
  if (content.length > 3000) throw new Error('Nội dung LinkedIn vượt quá 3.000 ký tự');
  const scheduledTime = body.scheduledTime ? new Date(body.scheduledTime) : new Date();
  if (Number.isNaN(scheduledTime.getTime())) throw new Error('Thời gian đăng không hợp lệ');
  return { content, scheduledTime: scheduledTime.toISOString() };
};

const publishPost = async (post) => {
  if (!ACCESS_TOKEN) throw new Error('Server chưa cấu hình LINKEDIN_ACCESS_TOKEN');
  if (!AUTHOR_URN) throw new Error('Server chưa cấu hình LINKEDIN_AUTHOR_URN');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': API_VERSION,
    },
    body: JSON.stringify({
      author: AUTHOR_URN,
      commentary: post.content,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(body || `LinkedIn API HTTP ${response.status}`);

  return {
    success: true,
    postId: response.headers.get('x-restli-id') || null,
  };
};

const processDuePosts = async () => {
  if (processing) return [];
  processing = true;

  try {
    const posts = readStore();
    const processed = [];
    const now = Date.now();

    for (const post of posts) {
      if (post.status !== 'scheduled') continue;
      if (new Date(post.scheduledTime).getTime() > now) continue;

      post.status = 'publishing';
      post.attempts = Number(post.attempts || 0) + 1;
      post.updatedAt = new Date().toISOString();
      writeStore(posts);

      try {
        post.result = await publishPost(post);
        post.status = 'published';
        post.publishedAt = new Date().toISOString();
        post.lastError = null;
        post.nextRetryAt = null;
      } catch (error) {
        post.lastError = error.message;
        if (post.attempts >= MAX_ATTEMPTS) {
          post.status = 'failed';
          post.nextRetryAt = null;
        } else {
          post.status = 'scheduled';
          post.nextRetryAt = new Date(Date.now() + post.attempts * 60_000).toISOString();
          post.scheduledTime = post.nextRetryAt;
        }
      }

      post.updatedAt = new Date().toISOString();
      processed.push({ ...post });
      writeStore(posts);
    }

    return processed;
  } finally {
    processing = false;
  }
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return respond(res, 204, {});
  if (!isAuthorized(req)) return respond(res, 401, { success: false, error: 'Không có quyền truy cập' });

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const posts = readStore();
      return respond(res, 200, {
        success: true,
        service: 'linkedin-scheduler',
        tokenConfigured: Boolean(ACCESS_TOKEN),
        authorConfigured: Boolean(AUTHOR_URN),
        queued: posts.filter((post) => post.status === 'scheduled').length,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/linkedin/posts') {
      return respond(res, 200, { success: true, posts: readStore() });
    }

    if (req.method === 'POST' && url.pathname === '/api/linkedin/posts') {
      const body = await readBody(req);
      const validated = validatePost(body);
      const posts = readStore();
      const post = {
        id: crypto.randomUUID(),
        content: validated.content,
        scheduledTime: validated.scheduledTime,
        status: 'scheduled',
        attempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      posts.unshift(post);
      writeStore(posts);
      if (new Date(post.scheduledTime).getTime() <= Date.now()) await processDuePosts();
      return respond(res, 201, {
        success: true,
        post: readStore().find((item) => item.id === post.id),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/linkedin/process') {
      return respond(res, 200, { success: true, processed: await processDuePosts() });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/linkedin/posts/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const posts = readStore();
      const next = posts.filter((post) => post.id !== id);
      if (next.length === posts.length) return respond(res, 404, { success: false, error: 'Không tìm thấy bài viết' });
      writeStore(next);
      return respond(res, 200, { success: true });
    }

    return respond(res, 404, { success: false, error: 'Endpoint không tồn tại' });
  } catch (error) {
    console.error(error);
    return respond(res, 400, { success: false, error: error.message });
  }
});

setInterval(() => {
  processDuePosts().catch((error) => console.error('LinkedIn scheduler error:', error));
}, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`LinkedIn server đang chạy tại http://${HOST}:${PORT}`);
  console.log(`Access token: ${ACCESS_TOKEN ? 'đã cấu hình' : 'CHƯA cấu hình'}`);
  console.log(`Author URN: ${AUTHOR_URN ? 'đã cấu hình' : 'CHƯA cấu hình'}`);
});
