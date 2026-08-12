'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createYouTubeAdapter } = require('./publishing-worker-youtube');

const response = ({ status = 200, json = {}, headers = {}, bytes = null }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[String(name).toLowerCase()] || null },
  json: async () => json,
  arrayBuffer: async () => bytes || new Uint8Array([1, 2, 3]).buffer,
});

test('verify requires authenticated channel to match vault channelId', async () => {
  const adapter = createYouTubeAdapter({
    fetchImpl: async () => response({ json: { items: [{ id: 'UCabcdefghijklmnopqrstuv', snippet: { title: 'Demo' } }] } }),
  });
  const result = await adapter.verify({ accessToken: 'token', channelId: 'UCabcdefghijklmnopqrstuv' });
  assert.equal(result.ok, true);
  assert.equal(result.account.name, 'Demo');
});

test('publish downloads source, creates resumable session and uploads bytes', async () => {
  const calls = [];
  const adapter = createYouTubeAdapter({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === 'https://cdn.example/video.mp4') {
        return response({ headers: { 'content-type': 'video/mp4' }, bytes: new Uint8Array([1, 2, 3, 4]).buffer });
      }
      if (String(url).includes('uploadType=resumable')) {
        return response({ headers: { location: 'https://www.googleapis.com/upload/session' } });
      }
      if (url === 'https://www.googleapis.com/upload/session') {
        return response({ status: 201, json: { id: 'abc123' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
    resolveHost: async () => [{ address: '8.8.8.8' }],
  });

  const result = await adapter.publish({ content: 'Short demo', videoUrl: 'https://cdn.example/video.mp4' }, {
    accessToken: 'token', channelId: 'UCabcdefghijklmnopqrstuv',
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, 'abc123');
  assert.equal(result.privacyStatus, 'private');
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.method, 'PUT');
});

test('publish rejects non-video source content type', async () => {
  const adapter = createYouTubeAdapter({
    fetchImpl: async () => response({ headers: { 'content-type': 'text/html' } }),
    resolveHost: async () => [{ address: '8.8.8.8' }],
  });
  await assert.rejects(
    adapter.publish({ content: 'x', videoUrl: 'https://example.com/page' }, { accessToken: 'token', channelId: 'UCabcdefghijklmnopqrstuv' }),
    /Content-Type không hợp lệ/,
  );
});

test('publish rejects private source addresses before making a request', async () => {
  let called = false;
  const adapter = createYouTubeAdapter({
    fetchImpl: async () => { called = true; return response(); },
  });
  await assert.rejects(
    adapter.publish({ content: 'x', videoUrl: 'http://127.0.0.1/private.mp4' }, { accessToken: 'token' }),
    (error) => error.code === 'UNSAFE_SOURCE_URL',
  );
  assert.equal(called, false);
});

test('publish validates every redirect and blocks redirects to metadata services', async () => {
  const adapter = createYouTubeAdapter({
    fetchImpl: async () => response({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    resolveHost: async () => [{ address: '8.8.8.8' }],
  });
  await assert.rejects(
    adapter.publish({ content: 'x', videoUrl: 'https://cdn.example/video.mp4' }, { accessToken: 'token' }),
    (error) => error.code === 'UNSAFE_SOURCE_URL',
  );
});

test('publish rejects a declared source larger than the configured memory limit', async () => {
  const adapter = createYouTubeAdapter({
    maxSourceBytes: 3,
    resolveHost: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async () => response({
      headers: { 'content-type': 'video/mp4', 'content-length': '4' },
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    }),
  });
  await assert.rejects(
    adapter.publish({ content: 'x', videoUrl: 'https://cdn.example/video.mp4' }, { accessToken: 'token' }),
    (error) => error.code === 'SOURCE_TOO_LARGE',
  );
});

test('publish does not send the OAuth token to an untrusted resumable location', async () => {
  const adapter = createYouTubeAdapter({
    resolveHost: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async (url) => {
      if (url === 'https://cdn.example/video.mp4') {
        return response({ headers: { 'content-type': 'video/mp4' } });
      }
      return response({ headers: { location: 'https://attacker.example/upload' } });
    },
  });
  await assert.rejects(
    adapter.publish({ content: 'x', videoUrl: 'https://cdn.example/video.mp4' }, { accessToken: 'token' }),
    /đáng tin cậy/,
  );
});
