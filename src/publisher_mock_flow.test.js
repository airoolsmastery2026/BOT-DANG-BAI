import { inspectPublisherPreflight } from './publisher_preflight';
import { checkAndPublishDuePosts, getScheduledPosts, schedulePost, POST_STATUS } from './post_manager';

jest.mock('./utils', () => {
  let store = {};
  return {
    saveToLocalStorage: (key, value) => { store[key] = value; },
    getFromLocalStorage: (key, fallback) => store[key] ?? fallback,
    __resetStorage: () => { store = {}; },
  };
});

const utils = require('./utils');

describe('free mock publisher flow', () => {
  beforeEach(() => utils.__resetStorage());

  test('preflight allows facebook, instagram and tiktok without tokens/media in mock mode', () => {
    const post = schedulePost({
      campaignId: 'mock-campaign',
      content: 'Kiểm thử miễn phí',
      platforms: ['facebook', 'instagram', 'tiktok'],
      scheduledTime: new Date(Date.now() - 1000).toISOString(),
    });

    const report = inspectPublisherPreflight({
      posts: [post],
      credentials: { __publisherMode: 'mock' },
      now: Date.now(),
    });

    expect(report.mode).toBe('mock');
    expect(report.runnableCount).toBe(1);
    expect(report.blockedCount).toBe(0);
  });

  test('mock processing completes queue item without external credentials', async () => {
    schedulePost({
      campaignId: 'mock-campaign',
      content: 'Kiểm thử miễn phí',
      platforms: ['facebook', 'instagram', 'tiktok'],
      scheduledTime: new Date(Date.now() - 1000).toISOString(),
    });

    const processed = await checkAndPublishDuePosts({ __publisherMode: 'mock' });
    expect(processed).toHaveLength(1);
    expect(processed[0].status).toBe(POST_STATUS.PUBLISHED);
    expect(processed[0].results.facebook.mock).toBe(true);
    expect(processed[0].results.instagram.mock).toBe(true);
    expect(processed[0].results.tiktok.mock).toBe(true);
    expect(getScheduledPosts()[0].status).toBe(POST_STATUS.PUBLISHED);
  });
});
