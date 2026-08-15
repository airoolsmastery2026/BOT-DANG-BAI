'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  fetchPublishingContent,
  resolveWebsiteConfig,
} = require('./dhp-website-client');

test('resolveWebsiteConfig prefers canonical ecosystem token', () => {
  assert.deepEqual(
    resolveWebsiteConfig({
      DHP_WEBSITE_BASE_URL: 'https://example.test/',
      ECOSYSTEM_SERVICE_API_KEY: 'shared-secret',
      TELEGRAM_WEBSITE_SERVICE_TOKEN: 'legacy-secret',
    }),
    {
      baseUrl: 'https://example.test',
      serviceToken: 'shared-secret',
    },
  );
});

test('resolveWebsiteConfig preserves legacy Telegram token as fallback', () => {
  assert.equal(
    resolveWebsiteConfig({
      DHP_WEBSITE_BASE_URL: 'https://example.test',
      TELEGRAM_WEBSITE_SERVICE_TOKEN: 'legacy-secret',
    }).serviceToken,
    'legacy-secret',
  );
});

test('fetchPublishingContent sends publishing-bot service auth headers', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  global.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/v1\/integrations\/publishing\/content\?/);
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'Bearer shared-secret');
    assert.equal(init.headers['X-DHP-Source-Service'], 'publishing-bot');
    assert.ok(init.headers['X-DHP-Request-Id']);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: '1.0',
        requestId: 'request-1',
        data: { items: [{ id: 'service:test' }], nextCursor: null, total: 1 },
      }),
    };
  };

  const page = await fetchPublishingContent({
    limit: 1,
    env: {
      DHP_WEBSITE_BASE_URL: 'https://example.test',
      ECOSYSTEM_SERVICE_API_KEY: 'shared-secret',
    },
  });

  assert.equal(page.total, 1);
  assert.equal(page.items[0].id, 'service:test');
});
