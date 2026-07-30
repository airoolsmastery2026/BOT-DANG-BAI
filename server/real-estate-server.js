const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = process.env.REAL_ESTATE_SERVER_HOST || '0.0.0.0';
const PORT = Number(process.env.REAL_ESTATE_SERVER_PORT || 8791);
const API_KEY = process.env.REAL_ESTATE_SERVER_API_KEY || '';
const ALLOWED_ORIGIN = process.env.REAL_ESTATE_ALLOWED_ORIGIN || 'http://localhost:3000';
const STORE_PATH = path.resolve(process.env.REAL_ESTATE_STORE_PATH || path.join(__dirname, 'real-estate-listings.json'));

const TYPES = ['Căn hộ', 'Nhà phố', 'Biệt thự', 'Đất nền', 'Kho xưởng', 'Văn phòng'];
const TRANSACTIONS = ['Bán', 'Cho thuê'];
const STATUSES = ['Mới', 'Đang chăm sóc', 'Đã đặt cọc', 'Đã giao dịch'];

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
  });
  req.on('error', reject);
});

const loadListings = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Không thể đọc dữ liệu bất động sản:', error.message);
    return [];
  }
};

const persistListings = (listings) => {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(listings, null, 2));
  fs.renameSync(tempPath, STORE_PATH);
};

const authorize = (req, res) => {
  if (!API_KEY) return true;
  if (req.headers['x-api-key'] === API_KEY) return true;
  sendJson(res, 401, { success: false, error: 'API key không hợp lệ.' });
  return false;
};

const validateListing = (input, partial = false) => {
  const errors = [];
  const required = ['title', 'location', 'type', 'transaction', 'status'];
  if (!partial) required.forEach((field) => { if (!String(input[field] || '').trim()) errors.push(`Thiếu ${field}.`); });
  if (input.type && !TYPES.includes(input.type)) errors.push('Loại bất động sản không hợp lệ.');
  if (input.transaction && !TRANSACTIONS.includes(input.transaction)) errors.push('Loại giao dịch không hợp lệ.');
  if (input.status && !STATUSES.includes(input.status)) errors.push('Trạng thái không hợp lệ.');
  if (input.price !== undefined && input.price !== '' && Number(input.price) < 0) errors.push('Giá phải lớn hơn hoặc bằng 0.');
  if (input.area !== undefined && input.area !== '' && Number(input.area) < 0) errors.push('Diện tích phải lớn hơn hoặc bằng 0.');
  return errors;
};

const sanitize = (input) => ({
  title: String(input.title || '').trim(),
  type: input.type || 'Căn hộ',
  transaction: input.transaction || 'Bán',
  location: String(input.location || '').trim(),
  price: input.price === '' || input.price == null ? null : Number(input.price),
  area: input.area === '' || input.area == null ? null : Number(input.area),
  contact: String(input.contact || '').trim(),
  phone: String(input.phone || '').trim(),
  notes: String(input.notes || '').trim(),
  status: input.status || 'Mới',
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    const listings = loadListings();
    return sendJson(res, 200, { success: true, service: 'real-estate', total: listings.length, storage: STORE_PATH, apiKeyConfigured: Boolean(API_KEY) });
  }

  if (!url.pathname.startsWith('/api/real-estate')) return sendJson(res, 404, { success: false, error: 'Không tìm thấy endpoint.' });
  if (!authorize(req, res)) return undefined;

  try {
    const listings = loadListings();

    if (req.method === 'GET' && url.pathname === '/api/real-estate/listings') {
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const type = url.searchParams.get('type') || '';
      const transaction = url.searchParams.get('transaction') || '';
      const status = url.searchParams.get('status') || '';
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 24)));
      const filtered = listings.filter((item) => {
        const matchesQuery = !query || [item.title, item.location, item.type, item.contact, item.phone]
          .some((value) => String(value || '').toLowerCase().includes(query));
        return matchesQuery && (!type || item.type === type) && (!transaction || item.transaction === transaction) && (!status || item.status === status);
      });
      const start = (page - 1) * pageSize;
      return sendJson(res, 200, { success: true, items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize });
    }

    if (req.method === 'GET' && url.pathname === '/api/real-estate/stats') {
      return sendJson(res, 200, {
        success: true,
        stats: {
          total: listings.length,
          selling: listings.filter((item) => item.transaction === 'Bán').length,
          renting: listings.filter((item) => item.transaction === 'Cho thuê').length,
          active: listings.filter((item) => item.status !== 'Đã giao dịch').length,
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/real-estate/listings') {
      const input = await readBody(req);
      const errors = validateListing(input);
      if (errors.length) return sendJson(res, 400, { success: false, errors });
      const now = new Date().toISOString();
      const listing = { id: `property_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ...sanitize(input), createdAt: now, updatedAt: now };
      persistListings([listing, ...listings]);
      return sendJson(res, 201, { success: true, item: listing });
    }

    const match = url.pathname.match(/^\/api\/real-estate\/listings\/([^/]+)$/);
    if (match && req.method === 'PUT') {
      const input = await readBody(req);
      const errors = validateListing(input, true);
      if (errors.length) return sendJson(res, 400, { success: false, errors });
      const index = listings.findIndex((item) => item.id === match[1]);
      if (index < 0) return sendJson(res, 404, { success: false, error: 'Không tìm thấy nguồn hàng.' });
      const current = listings[index];
      const merged = { ...current, ...sanitize({ ...current, ...input }), id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
      listings[index] = merged;
      persistListings(listings);
      return sendJson(res, 200, { success: true, item: merged });
    }

    if (match && req.method === 'DELETE') {
      const next = listings.filter((item) => item.id !== match[1]);
      if (next.length === listings.length) return sendJson(res, 404, { success: false, error: 'Không tìm thấy nguồn hàng.' });
      persistListings(next);
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 404, { success: false, error: 'Không tìm thấy endpoint.' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { success: false, error: error.message || 'Lỗi máy chủ.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Real Estate server đang chạy tại http://${HOST}:${PORT}`);
});
