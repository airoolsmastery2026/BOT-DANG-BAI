import { POST_STATUS } from './post_manager';
import { inspectPublisherPreflight, validatePostForPublishing } from './publisher_preflight';

const post = (overrides = {}) => ({
  id: 'post-1',
  campaignId: 'campaign-1',
  content: 'Nội dung hợp lệ',
  platforms: ['facebook'],
  scheduledTime: '2026-08-02T00:00:00.000Z',
  status: POST_STATUS.SCHEDULED,
  imageUrl: '',
  videoUrl: '',
  targetIds: {},
  results: {},
  ...overrides,
});

describe('publisher preflight', () => {
  test('accepts a due Facebook post with token', () => {
    const result = validatePostForPublishing(post(), { facebook_token: 'token' });
    expect(result.ready).toBe(true);
    expect(result.pendingPlatforms).toEqual(['facebook']);
  });

  test('blocks missing token and required media', () => {
    const result = validatePostForPublishing(post({ platforms: ['instagram', 'tiktok'] }), {});
    expect(result.ready).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      'missing_token',
      'missing_image',
      'missing_video',
    ]));
  });

  test('does not republish platforms that already succeeded', () => {
    const result = validatePostForPublishing(post({
      platforms: ['facebook', 'instagram'],
      imageUrl: 'https://example.com/image.jpg',
      results: { facebook: { success: true } },
    }), { instagram_token: 'token' });

    expect(result.ready).toBe(true);
    expect(result.pendingPlatforms).toEqual(['instagram']);
  });

  test('summarizes runnable and blocked due tasks', () => {
    const result = inspectPublisherPreflight({
      posts: [
        post(),
        post({ id: 'post-2', platforms: ['tiktok'] }),
        post({ id: 'future', scheduledTime: '2026-08-03T00:00:00.000Z' }),
      ],
      credentials: { facebook_token: 'token' },
      now: new Date('2026-08-02T01:00:00.000Z').getTime(),
    });

    expect(result.dueCount).toBe(2);
    expect(result.runnableCount).toBe(1);
    expect(result.blockedCount).toBe(1);
    expect(result.runnablePostIds).toEqual(['post-1']);
  });
});
