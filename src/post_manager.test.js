import {
  POST_STATUS,
  RECURRENCE,
  cancelPost,
  getScheduledPosts,
  retryPost,
  schedulePost,
  schedulePosts,
} from './post_manager';

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

  test('requeues a failed post and clears prior results', () => {
    const scheduled = schedulePost(validPost());
    utils.__setStorage('scheduled_posts', [{
      ...scheduled,
      status: POST_STATUS.FAILED,
      results: { facebook: { success: false, error: 'token' } },
      failureCount: 1,
    }]);

    const retried = retryPost(getScheduledPosts()[0].id);
    expect(retried.status).toBe(POST_STATUS.SCHEDULED);
    expect(retried.results).toEqual({});
    expect(retried.failureCount).toBeUndefined();
  });

  test('filters malformed persisted records', () => {
    utils.__setStorage('scheduled_posts', [
      null,
      {},
      validPost({ id: 'legacy-post' }),
      validPost({ id: 'bad-time', scheduledTime: 'not-a-date' }),
    ]);
    const posts = getScheduledPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('legacy-post');
  });
});
