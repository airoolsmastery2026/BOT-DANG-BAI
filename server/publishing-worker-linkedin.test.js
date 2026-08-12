'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLinkedInAdapter } = require('./publishing-worker-linkedin');

const response = ({ status = 200, json = {}, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[String(name).toLowerCase()] || null },
  json: async () => json,
});

test('verifies a person author against the authenticated LinkedIn member', async () => {
  const calls = [];
  const adapter = createLinkedInAdapter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ json: { id: 'member-1', localizedFirstName: 'Lan', localizedLastName: 'Anh' } });
    },
  });

  const result = await adapter.verify({ accessToken: 'token', authorUrn: 'urn:li:person:member-1' });
  assert.equal(result.ok, true);
  assert.equal(result.account.name, 'Lan Anh');
  assert.equal(calls[0].url, 'https://api.linkedin.com/v2/me');
  assert.equal(calls[0].options.headers['Linkedin-Version'], undefined);
});

test('rejects a person token that does not match the configured author', async () => {
  const adapter = createLinkedInAdapter({
    fetchImpl: async () => response({ json: { id: 'different-member' } }),
  });
  await assert.rejects(
    adapter.verify({ accessToken: 'token', authorUrn: 'urn:li:person:member-1' }),
    /không khớp Person URN/,
  );
});

test('verifies an organization author through the versioned organization API', async () => {
  const calls = [];
  const adapter = createLinkedInAdapter({
    apiVersion: '202607',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ json: { id: 12345, localizedName: 'Studio AI' } });
    },
  });

  const result = await adapter.verify({ accessToken: 'token', authorUrn: 'urn:li:organization:12345' });
  assert.equal(result.account.name, 'Studio AI');
  assert.equal(calls[0].url, 'https://api.linkedin.com/rest/organizations/12345');
  assert.equal(calls[0].options.headers['Linkedin-Version'], '202607');
});

test('publishes through the official posts endpoint and returns the response id', async () => {
  const calls = [];
  const adapter = createLinkedInAdapter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ status: 201, headers: { 'x-restli-id': 'urn:li:share:99' } });
    },
  });

  const result = await adapter.publish({ content: 'Bài đăng' }, {
    accessToken: 'token',
    authorUrn: 'urn:li:organization:12345',
  });
  assert.equal(result.externalPostId, 'urn:li:share:99');
  assert.equal(calls[0].url, 'https://api.linkedin.com/rest/posts');
  assert.equal(calls[0].options.method, 'POST');
});

test('marks rate limits as retryable', async () => {
  const adapter = createLinkedInAdapter({
    fetchImpl: async () => response({ status: 429, json: { message: 'slow down' } }),
  });
  await assert.rejects(
    adapter.publish({ content: 'Bài đăng' }, { accessToken: 'token', authorUrn: 'urn:li:person:member-1' }),
    (error) => error.retryable === true && error.code === 'HTTP_429',
  );
});
