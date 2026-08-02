import {
  POST_STATUS,
  RECURRENCE,
  cancelPost,
  checkAndPublishDuePosts,
  getPendingPlatforms,
  getQueueSummary,
  getScheduledPosts,
  recoverStuckPosts,
  retryFailedPosts,
  retryPost,
  schedulePost,
  schedulePosts,
} from './post_manager';
import { FacebookAPI, InstagramAPI } from './api_handler';

jest.mock('./api_handler', () => ({
  FacebookAPI: jest.fn(),
  InstagramAPI: jest.fn(),
  TikTokAPI: jest.fn(),
}));

jest.mock('./utils', () => {
  let store = {};
  return {
    saveToLocalStorage: (key, value) => { store[key] = value; },
    getFromLocalStorage: (key, fallback) => store[key] ?? fallback,
    __resetStorage: () => { store = {}; },
    __setStorage: (key, value) => { store[key] = value; },
  };
});

const utils = require('./utils');

const validPost = (overrides = {}) => ({
  campaignId: 'campaign-1',
  content: 'Bài viết thử nghiệm',
  platforms: ['facebook'],
  scheduledTime: new Date(Date.now() + 60_000).toISOString(),
  recurrence: RECURRENCE.NONE,
  ...overrides,
});

beforeEach(() => {
  utils.__resetStorage();
  jest.clearAllMocks();
});

describe('post manager queue', () => {
  test('normalizes platforms and stores campaign metadata', () => {
    const post = schedulePost(validPost({ platforms: ['Facebook', 'facebook', 'unknown'] }));
    expect(post.platforms).toEqual(['facebook']);
    expect(post.campaignId).toBe('campaign-1');
    expect(post.idempotencyKey).toContain('campaign-1');
    expect(post.status).toBe(POST_STATUS.SCHEDULED);
    expect(post.attemptCount).toBe(0);
  });

  test('rejects unsupported-only platform selections', () => {
    expect(() => schedulePost(validPost({ platforms: ['unknown'] })))
      .toThrow('nền tảng được hỗ trợ');
  });

  test('prevents an identical campaign post from being queued twice', () => {
    const input = validPost();
    schedulePost(input);
    expect(() => schedulePost(input)).toThrow('đã có một bài giống hệt');
    expect(getScheduledPosts()).toHaveLength(1);
  });

  test('allows the same content at a different scheduled time', () => {
    schedulePost(validPost());
    schedulePost(validPost({ scheduledTime: new Date(Date.now() + 120_000).toISOString() }));
    expect(getScheduledPosts()).toHaveLength(2);
  });

  test('schedules a full batch atomically', () => {
    const posts = schedulePosts([
      validPost({ scheduledTime: '2026-08-03T01:00:00.000Z' }),
      validPost({ scheduledTime: '2026-08-04T01:00:00.000Z' }),
    ]);
    expect(posts).toHaveLength(2);
    expect(getScheduledPosts()).toHaveLength(2);
  });

  test('does not persist a partial batch when one entry is invalid', () => {
    expect(() => schedulePosts([
      validPost({ scheduledTime: '2026-08-03T01:00:00.000Z' }),
      validPost({ content: '' }),
    ])).toThrow('không được để trống');
    expect(getScheduledPosts()).toHaveLength(0);
  });

  test('detects duplicates inside one batch', () => {
    const entry = validPost({ scheduledTime: '2026-08-03T01:00:00.000Z' });
    expect(() => schedulePosts([entry, entry])).toThrow('đã có một bài giống hệt');
    expect(getScheduledPosts()).toHaveLength(0);
  });

  test('cancels only scheduled posts', () => {
    const post = schedulePost(validPost());
    cancelPost(post.id);
    expect(getScheduledPosts()[0].status).toBe(POST_STATUS.CANCELLED);
    expect(getScheduledPosts()[0].cancelledAt).toBeTruthy();
  });

  test('requeues a failed post while preserving prior platform results', () => {
    const scheduled = schedulePost(validPost({ platforms: ['facebook', 'instagram'], imageUrl: 'https://example.com/a.jpg' }));
    utils.__setStorage('scheduled_posts', [{
      ...scheduled,
      status: POST_STATUS.FAILED,
      results: {
        facebook: { success: true, id: 'fb-1' },
        instagram: { success: false, error: 'token' },
      },
      successCount: 1,
      failureCount: 1,
    }]);

    const retried = retryPost(getScheduledPosts()[0].id);
    expect(retried.status).toBe(POST_STATUS.SCHEDULED);
    expect(retried.results.facebook.success).toBe(true);
    expect(retried.pendingPlatforms).toEqual(['instagram']);
    expect(getPendingPlatforms(retried)).toEqual(['instagram']);
  });

  test('publishes only platforms that have not succeeded', async () => {
    const scheduled = schedulePost(validPost({
      platforms: ['facebook', 'instagram'],
      imageUrl: 'https://example.com/a.jpg',
      scheduledTime: new Date(Date.now() - 60_000).toISOString(),
    }));
    utils.__setStorage('scheduled_posts', [{
      ...scheduled,
      status: POST_STATUS.SCHEDULED,
      results: {
        facebook: { success: true, id: 'fb-1' },
        instagram: { success: false, error: 'old error' },
      },
    }]);

    const instagramPublish = jest.fn().mockResolvedValue({ success: true, id: 'ig-1' });
    InstagramAPI.mockImplementation(() => ({ publishPost: instagramPublish }));
    FacebookAPI.mockImplementation(() => ({ publishPost: jest.fn() }));

    const processed = await checkAndPublishDuePosts({
      facebook_token: 'fb-token',
      instagram_token: 'ig-token',
    });

    expect(FacebookAPI).not.toHaveBeenCalled();
    expect(InstagramAPI).toHaveBeenCalledTimes(1);
    expect(instagramPublish).toHaveBeenCalledTimes(1);
    expect(processed[0].status).toBe(POST_STATUS.PUBLISHED);
    expect(processed[0].results.facebook.id).toBe('fb-1');
    expect(processed[0].results.instagram.id).toBe('ig-1');
  });

  test('retries failed posts by campaign with a limit', () => {
    const first = schedulePost(validPost({ content: 'Bài 1' }));
    const second = schedulePost(validPost({ content: 'Bài 2', campaignId: 'campaign-2' }));
    const third = schedulePost(validPost({ content: 'Bài 3', scheduledTime: new Date(Date.now() + 120_000).toISOString() }));
    utils.__setStorage('scheduled_posts', [first, second, third].map((post) => ({
      ...post,
      status: POST_STATUS.FAILED,
      results: { facebook: { success: false, error: 'failed' } },
    })));

    expect(retryFailedPosts({ campaignId: 'campaign-1', limit: 1 })).toBe(1);
    const posts = getScheduledPosts();
    expect(posts.filter((post) => post.status === POST_STATUS.SCHEDULED)).toHaveLength(1);
    expect(posts.find((post) => post.campaignId === 'campaign-2').status).toBe(POST_STATUS.FAILED);
  });

  test('recovers stale publishing posts as failed', () => {
    const scheduled = schedulePost(validPost());
    const now = Date.now();
    utils.__setStorage('scheduled_posts', [{
      ...scheduled,
      status: POST_STATUS.PUBLISHING,
      updatedAt: new Date(now - 15 * 60_000).toISOString(),
    }]);

    expect(recoverStuckPosts({ now, timeoutMs: 10 * 60_000 })).toBe(1);
    const recovered = getScheduledPosts()[0];
    expect(recovered.status).toBe(POST_STATUS.FAILED);
    expect(recovered.results.system.success).toBe(false);
  });

  test('returns queue summary and unique campaign count', () => {
    const due = schedulePost(validPost({ scheduledTime: new Date(Date.now() - 60_000).toISOString() }));
    const future = schedulePost(validPost({ content: 'Tương lai', campaignId: 'campaign-2' }));
    utils.__setStorage('scheduled_posts', [due, { ...future, status: POST_STATUS.FAILED }]);

    expect(getQueueSummary()).toMatchObject({
      total: 2,
      scheduled: 1,
      failed: 1,
      due: 1,
      campaigns: 2,
    });
  });

  test('filters malformed persisted records and orphan platform results', () => {
    utils.__setStorage('scheduled_posts', [
      null,
      {},
      validPost({ id: 'legacy-post', results: { facebook: { success: true }, tiktok: { success: true } } }),
      validPost({ id: 'bad-time', scheduledTime: 'not-a-date' }),
    ]);
    const posts = getScheduledPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('legacy-post');
    expect(posts[0].results.tiktok).toBeUndefined();
  });
});
