const { createHmac, randomUUID } = require('node:crypto');

const MAX_TEXT = {
  eventId: 100,
  platform: 40,
  externalLeadId: 160,
  publicationId: 160,
  sourceContentId: 160,
  displayName: 160,
  platformUserId: 160,
  message: 4000,
  consentContext: 160,
};

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw new Error(`${field} is required.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} is invalid.`);
  }
  return normalized;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return undefined;
  return boundedText(value, field, maxLength);
}

function normalizeConfig(config) {
  if (!isRecord(config)) throw new Error('DHP Website configuration is required.');
  const secret = boundedText(config.webhookSecret, 'webhookSecret', 512);

  let websiteUrl;
  try {
    websiteUrl = new URL(config.websiteBaseUrl);
  } catch {
    throw new Error('DHP Website base URL is invalid.');
  }

  if (websiteUrl.protocol !== 'https:') {
    throw new Error('DHP Website base URL must use HTTPS.');
  }
  if (websiteUrl.username || websiteUrl.password || websiteUrl.search || websiteUrl.hash) {
    throw new Error('DHP Website base URL is invalid.');
  }

  return {
    websiteBaseUrl: websiteUrl.toString().replace(/\/$/, ''),
    webhookSecret: secret,
  };
}

function normalizeSocialLeadInput(input, context = {}) {
  if (!isRecord(input) || !isRecord(input.customer)) {
    throw new Error('Social lead payload is invalid.');
  }

  const occurredAt = boundedText(
    context.occurredAt || new Date().toISOString(),
    'occurredAt',
    40,
  );
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new Error('occurredAt is invalid.');
  }

  const metadata = input.metadata === undefined ? {} : input.metadata;
  if (!isRecord(metadata) || JSON.stringify(metadata).length > 8192) {
    throw new Error('metadata is invalid.');
  }

  const eventId = boundedText(
    context.eventId || randomUUID(),
    'eventId',
    MAX_TEXT.eventId,
  );

  return {
    schemaVersion: '1.0',
    eventId,
    eventType: 'social.lead.created',
    occurredAt,
    sourceService: 'publishing-bot',
    data: {
      platform: boundedText(input.platform, 'platform', MAX_TEXT.platform).toLowerCase(),
      externalLeadId: boundedText(
        input.externalLeadId,
        'externalLeadId',
        MAX_TEXT.externalLeadId,
      ),
      ...(optionalText(input.publicationId, 'publicationId', MAX_TEXT.publicationId)
        ? { publicationId: optionalText(input.publicationId, 'publicationId', MAX_TEXT.publicationId) }
        : {}),
      ...(optionalText(input.sourceContentId, 'sourceContentId', MAX_TEXT.sourceContentId)
        ? { sourceContentId: optionalText(input.sourceContentId, 'sourceContentId', MAX_TEXT.sourceContentId) }
        : {}),
      customer: {
        displayName: boundedText(
          input.customer.displayName,
          'customer.displayName',
          MAX_TEXT.displayName,
        ),
        platformUserId: boundedText(
          input.customer.platformUserId,
          'customer.platformUserId',
          MAX_TEXT.platformUserId,
        ),
      },
      message: boundedText(input.message, 'message', MAX_TEXT.message),
      consentContext: boundedText(
        input.consentContext,
        'consentContext',
        MAX_TEXT.consentContext,
      ),
      metadata,
    },
  };
}

function buildDhpLeadWebhookRequest(rawConfig, envelope, nowSeconds = Math.floor(Date.now() / 1000)) {
  const config = normalizeConfig(rawConfig);
  if (!isRecord(envelope) || envelope.eventType !== 'social.lead.created') {
    throw new Error('Social lead envelope is invalid.');
  }

  const eventId = boundedText(envelope.eventId, 'eventId', MAX_TEXT.eventId);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new Error('Webhook timestamp is invalid.');
  }

  const timestamp = String(nowSeconds);
  const body = JSON.stringify(envelope);
  const signature = `v1=${createHmac('sha256', config.webhookSecret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex')}`;

  return {
    url: `${config.websiteBaseUrl}/api/v1/webhooks/social/lead`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dhp-event-id': eventId,
        'x-dhp-timestamp': timestamp,
        'x-dhp-signature': signature,
        'idempotency-key': eventId,
      },
      body,
    },
  };
}

function parseWebsiteResponse(value) {
  if (!isRecord(value) || value.schemaVersion !== '1.0' || typeof value.requestId !== 'string') {
    throw new Error('DHP Website returned an invalid response envelope.');
  }

  const requestId = boundedText(value.requestId, 'requestId', 160);
  const hasData = Object.prototype.hasOwnProperty.call(value, 'data');
  const hasError = Object.prototype.hasOwnProperty.call(value, 'error');
  if (hasData === hasError) {
    throw new Error('DHP Website returned an invalid response envelope.');
  }

  if (hasData) {
    return { ok: true, requestId, data: value.data };
  }

  if (!isRecord(value.error)) {
    throw new Error('DHP Website returned an invalid response envelope.');
  }

  const code = boundedText(value.error.code, 'error.code', 160);
  const message = boundedText(value.error.message, 'error.message', 500);
  if (typeof value.error.retryable !== 'boolean') {
    throw new Error('DHP Website returned an invalid response envelope.');
  }

  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable: value.error.retryable,
    },
  };
}

async function forwardSocialLead({
  config,
  input,
  eventId,
  occurredAt,
  nowSeconds,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is unavailable.');
  }

  const envelope = normalizeSocialLeadInput(input, { eventId, occurredAt });
  const request = buildDhpLeadWebhookRequest(config, envelope, nowSeconds);
  const response = await fetchImpl(request.url, request.init);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('DHP Website returned a non-JSON response.');
  }

  const parsed = parseWebsiteResponse(payload);
  return {
    ...parsed,
    status: response.status,
  };
}

module.exports = {
  buildDhpLeadWebhookRequest,
  forwardSocialLead,
  normalizeSocialLeadInput,
};
