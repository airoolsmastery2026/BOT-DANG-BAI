'use strict';

const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 10_000;

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/$/, '');

const resolveWebsiteConfig = (env = process.env) => ({
  baseUrl: trimTrailingSlash(env.DHP_WEBSITE_BASE_URL),
  serviceToken: String(
    env.ECOSYSTEM_SERVICE_API_KEY || env.TELEGRAM_WEBSITE_SERVICE_TOKEN || '',
  ).trim(),
});

const buildServiceHeaders = ({ serviceToken, sourceService, extraHeaders = {} }) => ({
  Authorization: `Bearer ${serviceToken}`,
  'X-DHP-Source-Service': sourceService,
  'X-DHP-Request-Id': crypto.randomUUID(),
  ...extraHeaders,
});

const requestWebsite = async ({
  path,
  sourceService,
  method = 'GET',
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env = process.env,
}) => {
  const { baseUrl, serviceToken } = resolveWebsiteConfig(env);
  if (!baseUrl) {
    const error = new Error('DHP_WEBSITE_BASE_URL is required');
    error.code = 'DHP_WEBSITE_URL_MISSING';
    throw error;
  }
  if (!serviceToken) {
    const error = new Error('ECOSYSTEM_SERVICE_API_KEY is required');
    error.code = 'DHP_SERVICE_TOKEN_MISSING';
    throw error;
  }

  const extraHeaders = body === undefined ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: buildServiceHeaders({ serviceToken, sourceService, extraHeaders }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || `DHP Website HTTP ${response.status}`,
    );
    error.code = payload?.error?.code || `HTTP_${response.status}`;
    error.status = response.status;
    error.retryable = payload?.error?.retryable === true || response.status === 429 || response.status >= 500;
    throw error;
  }

  return payload;
};

const fetchPublishingContent = async ({
  limit = 20,
  cursor,
  updatedAfter,
  category,
  env = process.env,
} = {}) => {
  const params = new URLSearchParams({
    type: 'service',
    status: 'ready',
    locale: 'vi-VN',
    limit: String(Math.min(Math.max(Number(limit) || 20, 1), 50)),
  });
  if (cursor) params.set('cursor', cursor);
  if (updatedAfter) params.set('updatedAfter', updatedAfter);
  if (category) params.set('category', category);

  const payload = await requestWebsite({
    path: `/api/v1/integrations/publishing/content?${params.toString()}`,
    sourceService: 'publishing-bot',
    env,
  });
  return payload.data;
};

module.exports = {
  buildServiceHeaders,
  fetchPublishingContent,
  requestWebsite,
  resolveWebsiteConfig,
};
