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
        return response({ headers: { location: 'https://upload.youtube.example/session' } });
      }
      if (url === 'https://upload.youtube.example/session') {
        return response({ status: 201, json: { id: 'abc123' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
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
  });
  await assert.rejects(
    adapter.publish({ content: 'x', videoUrl: 'https://example.com/page' }, { accessToken: 'token', channelId: 'UCabcdefghijklmnopqrstuv' }),
    /Content-Type không hợp lệ/,
  );
});
