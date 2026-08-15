'use strict';

const { fetchPublishingContent } = require('../../server/dhp-website-client');

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req-${Date.now()}`;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, {
      schemaVersion: '1.0',
      requestId,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed.',
        retryable: false,
      },
    });
  }

  try {
    const page = await fetchPublishingContent({ limit: 1 });
    if (!page || !Array.isArray(page.items)) {
      throw new Error('Unexpected DHP Website content response.');
    }

    return send(res, 200, {
      schemaVersion: '1.0',
      requestId,
      data: {
        status: 'ok',
        service: 'dhp-website',
        authenticated: true,
        contentReachable: true,
      },
    });
  } catch (error) {
    console.warn('DHP Website health check failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: error?.code || 'UNKNOWN',
    });

    return send(res, 503, {
      schemaVersion: '1.0',
      requestId,
      error: {
        code: 'DHP_WEBSITE_UNAVAILABLE',
        message: 'DHP Website integration is unavailable.',
        retryable: true,
      },
    });
  }
};
