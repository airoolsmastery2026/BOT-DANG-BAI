'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const DEFAULT_MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

function isPrivateIpAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && c === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224;
  }
  if (family === 6) {
    if (address.startsWith('::ffff:')) return isPrivateIpAddress(address.slice(7));
    return address === '::'
      || address === '::1'
      || address.startsWith('fc')
      || address.startsWith('fd')
      || /^fe[89ab]/.test(address)
      || address.startsWith('2001:db8:');
  }
  return true;
}

function unsafeSourceError(message) {
  const error = new Error(message);
  error.code = 'UNSAFE_SOURCE_URL';
  error.retryable = false;
  return error;
}

async function assertPublicSourceUrl(value, resolveHost) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw unsafeSourceError('YouTube source URL không hợp lệ.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw unsafeSourceError('YouTube source chỉ chấp nhận URL HTTP/HTTPS công khai không chứa credential.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa')) {
    throw unsafeSourceError('YouTube source không được trỏ tới hostname nội bộ.');
  }

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    try { addresses = await resolveHost(hostname); }
    catch (cause) {
      const error = new Error('Không phân giải được hostname của YouTube source.');
      error.code = cause?.code || 'SOURCE_DNS_FAILED';
      error.retryable = cause?.code === 'EAI_AGAIN';
      throw error;
    }
  }
  if (!Array.isArray(addresses) || !addresses.length) {
    throw unsafeSourceError('Không phân giải được hostname của YouTube source.');
  }
  if (addresses.some((item) => isPrivateIpAddress(typeof item === 'string' ? item : item?.address))) {
    throw unsafeSourceError('YouTube source không được trỏ tới địa chỉ mạng nội bộ hoặc dành riêng.');
  }
  return url;
}

function sourceSizeError(maxSourceBytes) {
  const error = new Error(`YouTube source vượt giới hạn ${maxSourceBytes} bytes.`);
  error.code = 'SOURCE_TOO_LARGE';
  error.retryable = false;
  return error;
}

async function readSourceBytes(response, maxSourceBytes) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxSourceBytes) throw sourceSizeError(maxSourceBytes);

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxSourceBytes) {
        await reader.cancel().catch(() => {});
        throw sourceSizeError(maxSourceBytes);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxSourceBytes) throw sourceSizeError(maxSourceBytes);
  return bytes;
}

const isTrustedUploadUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (url.hostname === 'googleapis.com' || url.hostname.endsWith('.googleapis.com'));
  } catch {
    return false;
  }
};

function createYouTubeAdapter({
  fetchImpl = fetch,
  timeoutMs = 30_000,
  maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES,
  resolveHost = (hostname) => dns.lookup(hostname, { all: true, verbatim: true }),
} = {}) {
  const sourceLimit = Number.isFinite(Number(maxSourceBytes)) && Number(maxSourceBytes) > 0
    ? Number(maxSourceBytes)
    : DEFAULT_MAX_SOURCE_BYTES;

  const headers = (accessToken, extra = {}) => ({
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...extra,
  });

  const readJson = async (response, fallback) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || fallback || `HTTP ${response.status}`);
      error.code = body?.error?.code || `HTTP_${response.status}`;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    return body;
  };

  const verify = async (credentials) => {
    const response = await fetchImpl('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: headers(credentials.accessToken),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await readJson(response, 'YouTube channel verify failed.');
    const channel = Array.isArray(data?.items) ? data.items[0] : null;
    if (!channel?.id) throw new Error('YouTube token không trả về channel đã xác thực.');
    if (String(channel.id) !== String(credentials.channelId)) throw new Error('YouTube token không khớp Channel ID trong vault.');
    return { platform: 'youtube', ok: true, account: { id: channel.id, name: channel?.snippet?.title || channel.id } };
  };

  const publish = async (job, credentials) => {
    const videoUrl = String(job.videoUrl || '').trim();
    if (!isHttpUrl(videoUrl)) throw new Error('YouTube cần video URL HTTP/HTTPS công khai.');

    let sourceUrl = videoUrl;
    let source;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const safeUrl = await assertPublicSourceUrl(sourceUrl, resolveHost);
      source = await fetchImpl(safeUrl.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(timeoutMs, 120_000)),
      });
      if (source.status < 300 || source.status >= 400) break;
      const location = String(source.headers.get('location') || '').trim();
      if (!location) throw unsafeSourceError('YouTube source redirect thiếu Location header.');
      if (redirectCount === MAX_REDIRECTS) throw unsafeSourceError('YouTube source có quá nhiều redirect.');
      sourceUrl = new URL(location, safeUrl).toString();
    }
    if (!source.ok) {
      const error = new Error(`Không tải được video nguồn cho YouTube (HTTP ${source.status}).`);
      error.code = `SOURCE_HTTP_${source.status}`;
      error.retryable = source.status === 429 || source.status >= 500;
      throw error;
    }
    const contentType = String(source.headers.get('content-type') || '').split(';')[0].trim();
    if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
      throw new Error(`YouTube source có Content-Type không hợp lệ: ${contentType || 'unknown'}.`);
    }
    const bytes = await readSourceBytes(source, sourceLimit);
    if (!bytes.length) throw new Error('YouTube source video rỗng.');

    const privacyStatus = ['private', 'unlisted', 'public'].includes(String(job.privacyStatus || '').trim())
      ? String(job.privacyStatus).trim()
      : 'private';
    const title = String(job.title || job.content || 'Video').trim().slice(0, 100);
    const description = String(job.content || '').trim().slice(0, 5000);

    const init = await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: headers(credentials.accessToken, {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(bytes.length),
        'X-Upload-Content-Type': contentType,
      }),
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!init.ok) await readJson(init, 'YouTube resumable session failed.');
    const uploadUrl = String(init.headers.get('location') || '').trim();
    if (!isTrustedUploadUrl(uploadUrl)) throw new Error('YouTube không trả về resumable upload URL đáng tin cậy.');

    const uploaded = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: headers(credentials.accessToken, {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
      }),
      body: bytes,
      signal: AbortSignal.timeout(Math.max(timeoutMs, 300_000)),
    });
    const data = await readJson(uploaded, 'YouTube video upload failed.');
    if (!data?.id) throw new Error('YouTube upload không trả về Video ID.');

    return {
      success: true,
      externalPostId: String(data.id),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,
      privacyStatus,
      publishedAt: new Date().toISOString(),
    };
  };

  return { publish, verify };
}

module.exports = {
  DEFAULT_MAX_SOURCE_BYTES,
  assertPublicSourceUrl,
  createYouTubeAdapter,
  isHttpUrl,
  isPrivateIpAddress,
  isTrustedUploadUrl,
  readSourceBytes,
};
