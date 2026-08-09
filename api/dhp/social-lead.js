const { timingSafeEqual } = require('node:crypto');

const { forwardSocialLead } = require('../../server/dhp-social-lead-bridge');

const BODY_LIMIT_BYTES = 16 * 1024;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req-${Date.now()}`;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, {
      schemaVersion: '1.0',
      requestId,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', retryable: false },
    });
  }

  const ingestToken = process.env.BOT_INGEST_TOKEN?.trim();
  if (!ingestToken) {
    return send(res, 503, {
      schemaVersion: '1.0',
      requestId,
      error: { code: 'INGEST_NOT_CONFIGURED', message: 'Lead ingest is not configured.', retryable: false },
    });
  }
  if (!safeEqual(bearerToken(req), ingestToken)) {
    return send(res, 401, {
      schemaVersion: '1.0',
      requestId,
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized.', retryable: false },
    });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > BODY_LIMIT_BYTES) {
    return send(res, 413, {
      schemaVersion: '1.0',
      requestId,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.', retryable: false },
    });
  }

  try {
    const input = req.body;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Social lead payload is invalid.');
    }
    if (Buffer.byteLength(JSON.stringify(input), 'utf8') > BODY_LIMIT_BYTES) {
      return send(res, 413, {
        schemaVersion: '1.0',
        requestId,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.', retryable: false },
      });
    }

    const result = await forwardSocialLead({
      config: {
        websiteBaseUrl: process.env.DHP_WEBSITE_BASE_URL,
        webhookSecret: process.env.ECOSYSTEM_WEBHOOK_SECRET,
      },
      input,
      eventId: typeof req.headers['x-dhp-event-id'] === 'string'
        ? req.headers['x-dhp-event-id']
        : undefined,
      occurredAt: typeof req.headers['x-dhp-occurred-at'] === 'string'
        ? req.headers['x-dhp-occurred-at']
        : undefined,
    });

    if (result.ok) {
      return send(res, result.status, {
        schemaVersion: '1.0',
        requestId,
        data: {
          websiteRequestId: result.requestId,
          website: result.data,
        },
      });
    }

    return send(res, result.status, {
      schemaVersion: '1.0',
      requestId,
      error: result.error,
    });
  } catch (error) {
    console.error('DHP social lead bridge failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return send(res, 400, {
      schemaVersion: '1.0',
      requestId,
      error: {
        code: 'INVALID_SOCIAL_LEAD',
        message: 'Social lead payload is invalid or the bridge is not configured.',
        retryable: false,
      },
    });
  }
};
