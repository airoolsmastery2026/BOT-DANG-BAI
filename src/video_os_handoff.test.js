import { SCHEDULER_HANDOFF_STORAGE_KEY } from './scheduler_handoff';
import { consumeVideoOsHandoff } from './video_os_handoff';

const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

const encodeBase64Url = (value) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '#/scheduler');
});

test('consumes a valid handoff and removes it from the browser URL', () => {
  const encoded = encodeBase64Url({
    campaignId: 'campaign-1',
    topic: 'Video test',
    platforms: ['TikTok', 'facebook', 'unknown'],
    content: 'Caption',
    videoUrl: 'https://example.com/video.mp4',
    sourceJobId: 'job-1',
  });
  window.history.replaceState(null, '', `#/scheduler?videoos=${encoded}`);

  const handoff = consumeVideoOsHandoff();

  expect(handoff).toMatchObject({
    campaignId: 'campaign-1',
    topic: 'Video test',
    platforms: ['tiktok', 'facebook'],
    content: 'Caption',
    source: 'video-os',
    sourceJobId: 'job-1',
  });
  expect(window.location.hash).toBe('#/scheduler');
  expect(JSON.parse(window.localStorage.getItem(SCHEDULER_HANDOFF_STORAGE_KEY))).toMatchObject({
    campaignId: 'campaign-1',
    source: 'video-os',
  });
});

test('never persists access tokens or callback credentials from URL payloads', () => {
  const encoded = encodeBase64Url({
    campaignId: 'campaign-2',
    topic: 'Secure handoff',
    platforms: ['facebook'],
    sourceAccessToken: 'secret-access-token',
    sourceCallbackUrl: 'https://attacker.example/callback?token=secret',
    arbitrarySecret: 'do-not-store',
  });
  window.history.replaceState(null, '', `#/scheduler?videoos=${encoded}`);

  const handoff = consumeVideoOsHandoff();
  const stored = window.localStorage.getItem(SCHEDULER_HANDOFF_STORAGE_KEY) || '';

  expect(handoff.sourceAccessToken).toBeUndefined();
  expect(handoff.sourceCallbackUrl).toBeUndefined();
  expect(stored).not.toContain('secret-access-token');
  expect(stored).not.toContain('attacker.example');
  expect(stored).not.toContain('do-not-store');
});

test('rejects unsupported platforms and non-http media URLs', () => {
  const encoded = encodeBase64Url({
    campaignId: 'campaign-3',
    topic: 'Invalid media',
    platforms: ['linkedin'],
    videoUrl: 'javascript:alert(1)',
  });
  window.history.replaceState(null, '', `#/scheduler?videoos=${encoded}`);

  expect(consumeVideoOsHandoff()).toBeNull();
  expect(window.location.hash).toBe('#/scheduler');
  expect(window.localStorage.getItem(SCHEDULER_HANDOFF_STORAGE_KEY)).toBeNull();
});
