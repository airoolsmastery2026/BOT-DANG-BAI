const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildDhpLeadWebhookRequest,
  forwardSocialLead,
  normalizeSocialLeadInput,
} = require('./dhp-social-lead-bridge');

const config = {
  websiteBaseUrl: 'https://dai-hai-phat.example.com',
  webhookSecret: 'shared-webhook-secret',
};

test('normalizes a minimal provider lead into the DHP social lead envelope', () => {
  const lead = normalizeSocialLeadInput({
    platform: 'Facebook',
    externalLeadId: 'fb-123',
    publicationId: 'pub-456',
    sourceContentId: 'service-cua-cong',
    customer: {
      displayName: 'Nguyen Van A',
      platformUserId: 'user-789',
    },
    message: 'Tôi muốn tư vấn mẫu cổng này.',
    consentContext: 'platform-message',
    metadata: { campaign: 'gates-2026' },
  }, {
    eventId: 'evt-1',
    occurredAt: '2026-08-09T01:45:00.000Z',
  });

  assert.deepEqual(lead, {
    schemaVersion: '1.0',
    eventId: 'evt-1',
    eventType: 'social.lead.created',
    occurredAt: '2026-08-09T01:45:00.000Z',
    sourceService: 'publishing-bot',
    data: {
      platform: 'facebook',
      externalLeadId: 'fb-123',
      publicationId: 'pub-456',
      sourceContentId: 'service-cua-cong',
      customer: {
        displayName: 'Nguyen Van A',
        platformUserId: 'user-789',
      },
      message: 'Tôi muốn tư vấn mẫu cổng này.',
      consentContext: 'platform-message',
      metadata: { campaign: 'gates-2026' },
    },
  });
});

test('builds an exact signed request for the Website webhook', () => {
  const envelope = normalizeSocialLeadInput({
    platform: 'facebook',
    externalLeadId: 'fb-123',
    customer: { displayName: 'A', platformUserId: 'u-1' },
    message: 'Need a quote',
    consentContext: 'platform-message',
    metadata: {},
  }, {
    eventId: 'evt-2',
    occurredAt: '2026-08-09T01:46:00.000Z',
  });

  const request = buildDhpLeadWebhookRequest(config, envelope, 1786240000);
  const parsedBody = JSON.parse(request.init.body);

  assert.equal(request.url, 'https://dai-hai-phat.example.com/api/v1/webhooks/social/lead');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['content-type'], 'application/json');
  assert.equal(request.init.headers['x-dhp-event-id'], 'evt-2');
  assert.equal(request.init.headers['idempotency-key'], 'evt-2');
  assert.equal(request.init.headers['x-dhp-timestamp'], '1786240000');
  assert.match(request.init.headers['x-dhp-signature'], /^v1=[0-9a-f]{64}$/);
  assert.deepEqual(parsedBody, envelope);
});

test('rejects unsafe configuration and malformed social leads', () => {
  assert.throws(
    () => buildDhpLeadWebhookRequest(
      { websiteBaseUrl: 'http://dai-hai-phat.example.com', webhookSecret: 'x' },
      normalizeSocialLeadInput({
        platform: 'facebook',
        externalLeadId: 'fb-1',
        customer: { displayName: 'A', platformUserId: 'u-1' },
        message: 'hello',
        consentContext: 'platform-message',
        metadata: {},
      }, { eventId: 'evt-3', occurredAt: '2026-08-09T01:46:00.000Z' }),
      1786240000,
    ),
    /HTTPS/,
  );

  assert.throws(
    () => normalizeSocialLeadInput({
      platform: '',
      externalLeadId: 'fb-1',
      customer: { displayName: 'A', platformUserId: 'u-1' },
      message: 'hello',
      consentContext: 'platform-message',
      metadata: {},
    }, { eventId: 'evt-4', occurredAt: '2026-08-09T01:46:00.000Z' }),
    /platform/,
  );
});

test('forwards once and preserves Website ecosystem errors without leaking response internals', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: false,
      status: 409,
      async json() {
        return {
          schemaVersion: '1.0',
          requestId: 'req-website-1',
          error: {
            code: 'WEBHOOK_REPLAYED',
            message: 'Webhook already processed.',
            retryable: false,
          },
        };
      },
    };
  };

  const result = await forwardSocialLead({
    config,
    input: {
      platform: 'facebook',
      externalLeadId: 'fb-999',
      customer: { displayName: 'A', platformUserId: 'u-9' },
      message: 'Need advice',
      consentContext: 'platform-message',
      metadata: {},
    },
    eventId: 'evt-5',
    occurredAt: '2026-08-09T01:47:00.000Z',
    nowSeconds: 1786240000,
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(result, {
    ok: false,
    status: 409,
    requestId: 'req-website-1',
    error: {
      code: 'WEBHOOK_REPLAYED',
      message: 'Webhook already processed.',
      retryable: false,
    },
  });
});
