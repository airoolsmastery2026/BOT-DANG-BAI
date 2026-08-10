import {
  MAX_PUBLISH_ATTEMPTS,
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
import { __resetQueueRuntimeLockForTests } from './queue_runtime_lock';
import { FacebookAPI, InstagramAPI } from './api_handler';

jest.mock('./api_handler', () => ({
  FacebookAPI: jest.fn(),
  InstagramAPI: jest.fn(),
  TikTokAPI: jest.fn(),
}));

jest.mock('./utils', () => {
  let store = {};
  return {
    saveToLocalStorage: (key, value) => { store[key] = value; return true; },
    getFromLocalStorage: (key, fallback) => store[key] ?? fallback,
    __resetStorage: () => { store = {}; },
    __setStorage: (key, value) => { store[key] = value; },
  };
});

const utils = require('./utils');
const validPost = (overrides = {}) => ({
  campaignId: 'campaign-1', content: 'Bài viết thử nghiệm', platforms: ['facebook'],
  scheduledTime: new Date(Date.now() + 60_000).toISOString(), recurrence: RECURRENCE.NONE, ...overrides,
});

beforeEach(() => {
  utils.__resetStorage();
  __resetQueueRuntimeLockForTests();
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
    expect(() => schedulePost(validPost({ platforms: ['unknown'] }))).toThrow('nền tảng được hỗ trợ');
  });

  test('prevents an identical campaign post from being queued twice', () => {
    const input = validPost(); schedulePost(input);
    expect(() => schedulePost(input)).toThrow('đã có một bài giống hệt');
    expect(getScheduledPosts()).toHaveLength(1);
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
    expect(() => schedulePosts([validPost(), validPost({ content: '' })])).toThrow('không được để trống');
    expect(getScheduledPosts()).toHaveLength(0);
  });

  test('cancels only scheduled posts', () => {
    const post = schedulePost(validPost()); cancelPost(post.id);
    expect(getScheduledPosts()[0].status).toBe(POST_STATUS.CANCELLED);
  });

  test('requeues a failed post while preserving prior platform results', () => {
    const scheduled = schedulePost(validPost({ platforms: ['facebook', 'instagram'], imageUrl: 'https://example.com/a.jpg' }));
    utils.__setStorage('scheduled_posts', [{
      ...scheduled, status: POST_STATUS.FAILED,
      results: { facebook: { success: true, id: 'fb-1' }, instagram: { success: false, error: 'token' } },
      successCount: 1, failureCount: 1,
    }]);
    const retried = retryPost(scheduled.id);
    expect(retried.status).toBe(POST_STATUS.SCHEDULED);
    expect(retried.results.facebook.success).toBe(true);
    expect(getPendingPlatforms(retried)).toEqual(['instagram']);
  });

  test('publishes only platforms that have not succeeded', async () => {
    const scheduled = schedulePost(validPost({
      platforms: ['facebook', 'instagram'], imageUrl: 'https://example.com/a.jpg',
      scheduledTime: new Date(Date.now() - 60_000).toISOString(),
    }));
    utils.__setStorage('scheduled_posts', [{
      ...scheduled, status: POST_STATUS.SCHEDULED,
      results: { facebook: { success: true, id: 'fb-1' }, instagram: { success: false, error: 'old' } },
    }]);
    const instagramPublish = jest.fn().mockResolvedValue({ success: true, id: 'ig-1' });
    InstagramAPI.mockImplementation(() => ({ publishPost: instagramPublish }));
    FacebookAPI.mockImplementation(() => ({ publishPost: jest.fn() }));
    const processed = await checkAndPublishDuePosts({
      facebook_token: 'fb',
      instagram_token: 'ig',
      instagram_user_id: 'ig-1',
    });
    expect(FacebookAPI).not.toHaveBeenCalled();
    expect(InstagramAPI).toHaveBeenCalledTimes(1);
    expect(processed[0].status).toBe(POST_STATUS.PUBLISHED);
  });

  test('serializes concurrent queue runs so a due post is published once', async () => {
    schedulePost(validPost({ scheduledTime: new Date(Date.now() - 60_000).toISOString() }));
    let resolvePublish;
    const publishPost = jest.fn(() => new Promise((resolve) => { resolvePublish = resolve; }));
    FacebookAPI.mockImplementation(() => ({ publishPost }));

    const first = checkAndPublishDuePosts({ facebook_token: 'fb', facebook_page_id: 'page-1' });
    const second = checkAndPublishDuePosts({ facebook_token: 'fb', facebook_page_id: 'page-1' });

    await Promise.resolve();
    expect(publishPost).toHaveBeenCalledTimes(1);
    resolvePublish({ success: true, postId: 'fb-1' });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult[0].status).toBe(POST_STATUS.PUBLISHED);
    expect(secondResult[0].status).toBe(POST_STATUS.PUBLISHED);
    expect(publishPost).toHaveBeenCalledTimes(1);
  });

  test('free mock partial failure preserves successes for selective retry', async () => {
    const scheduled = schedulePost(validPost({
      platforms: ['facebook', 'instagram'],
      scheduledTime: new Date(Date.now() - 60_000).toISOString(),
    }));

    const firstRun = await checkAndPublishDuePosts({
      __publisherMode: 'mock',
      __mockScenario: 'partial_instagram',
    });

    expect(firstRun[0].status).toBe(POST_STATUS.FAILED);
    expect(firstRun[0].publishedAt).toBeUndefined();
    expect(firstRun[0].lastAttemptAt).toBeTruthy();
    expect(firstRun[0].results.facebook.success).toBe(true);
    expect(firstRun[0].results.instagram.success).toBe(false);
    expect(firstRun[0].pendingPlatforms).toEqual(['instagram']);

    const retried = retryPost(scheduled.id);
    expect(retried.pendingPlatforms).toEqual(['instagram']);

    const secondRun = await checkAndPublishDuePosts({
      __publisherMode: 'mock',
      __mockScenario: 'success',
    });

    expect(secondRun[0].status).toBe(POST_STATUS.PUBLISHED);
    expect(secondRun[0].publishedAt).toBeTruthy();
    expect(secondRun[0].results.facebook.success).toBe(true);
    expect(secondRun[0].results.instagram.success).toBe(true);
  });

  test('moves exhausted failed posts to dead letter instead of retrying forever', () => {
    const scheduled = schedulePost(validPost());
    utils.__setStorage('scheduled_posts', [{
      ...scheduled, status: POST_STATUS.FAILED, attemptCount: MAX_PUBLISH_ATTEMPTS,
      results: { facebook: { success: false, error: 'permanent' } },
    }]);
    expect(retryPost(scheduled.id)).toBeNull();
    const stored = getScheduledPosts()[0];
    expect(stored.status).toBe(POST_STATUS.DEAD_LETTER);
    expect(stored.deadLetteredAt).toBeTruthy();
  });

  test('moves a final failed publish attempt to dead letter without publishedAt', async () => {
    const scheduled = schedulePost(validPost({ scheduledTime: new Date(Date.now() - 60_000).toISOString() }));
    utils.__setStorage('scheduled_posts', [{ ...scheduled, attemptCount: MAX_PUBLISH_ATTEMPTS - 1 }]);
    FacebookAPI.mockImplementation(() => ({ publishPost: jest.fn().mockRejectedValue(new Error('permanent')) }));
    const processed = await checkAndPublishDuePosts({ facebook_token: 'fb', facebook_page_id: 'page-1' });
    expect(processed[0].status).toBe(POST_STATUS.DEAD_LETTER);
    expect(processed[0].attemptCount).toBe(MAX_PUBLISH_ATTEMPTS);
    expect(processed[0].publishedAt).toBeUndefined();
    expect(processed[0].lastAttemptAt).toBeTruthy();
  });

  test('recovers stale publishing posts as failed', () => {
    const scheduled = schedulePost(validPost()); const now = Date.now();
    utils.__setStorage('scheduled_posts', [{ ...scheduled, status: POST_STATUS.PUBLISHING, updatedAt: new Date(now - 15 * 60_000).toISOString() }]);
    expect(recoverStuckPosts({ now, timeoutMs: 10 * 60_000 })).toBe(1);
    expect(getScheduledPosts()[0].status).toBe(POST_STATUS.FAILED);
  });

  test('returns queue summary including dead letter count', () => {
    const due = schedulePost(validPost({ scheduledTime: new Date(Date.now() - 60_000).toISOString() }));
    const dead = schedulePost(validPost({ content: 'Dead', campaignId: 'campaign-2' }));
    utils.__setStorage('scheduled_posts', [due, { ...dead, status: POST_STATUS.DEAD_LETTER }]);
    expect(getQueueSummary()).toMatchObject({ total: 2, scheduled: 1, dead_letter: 1, due: 1, campaigns: 2 });
  });

  test('filters malformed persisted records and orphan platform results', () => {
    utils.__setStorage('scheduled_posts', [
      null, {}, validPost({ id: 'legacy-post', results: { facebook: { success: true }, tiktok: { success: true } } }),
      validPost({ id: 'bad-time', scheduledTime: 'not-a-date' }),
    ]);
    const posts = getScheduledPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].results.tiktok).toBeUndefined();
  });
});
