import { POST_STATUS } from './post_manager';
import { inspectQueueHealth } from './queue_health';

const basePost = (overrides = {}) => ({
  id: 'post-1',
  campaignId: 'campaign-1',
  content: 'Nội dung',
  platforms: ['facebook'],
  scheduledTime: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  status: POST_STATUS.SCHEDULED,
  results: {},
  attemptCount: 0,
  ...overrides,
});

describe('queue health diagnostics', () => {
  test('reports a healthy scheduled task when requirements are met', () => {
    const result = inspectQueueHealth({
      posts: [basePost()],
      credentials: { facebook_token: 'token' },
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.healthy).toBe(true);
    expect(result.summary.total).toBe(0);
  });

  test('detects missing platform credentials and media', () => {
    const result = inspectQueueHealth({
      posts: [basePost({ platforms: ['instagram', 'tiktok'] })],
      credentials: {},
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.missing_token).toBe(2);
    expect(result.summary.byCode.missing_image).toBe(1);
    expect(result.summary.byCode.missing_video).toBe(1);
    expect(result.healthy).toBe(false);
  });

  test('detects overdue and stuck tasks', () => {
    const now = new Date('2026-08-02T00:20:00.000Z').getTime();
    const result = inspectQueueHealth({
      posts: [
        basePost(),
        basePost({ id: 'post-2', status: POST_STATUS.PUBLISHING }),
      ],
      credentials: { facebook_token: 'token' },
      now,
    });

    expect(result.summary.byCode.overdue).toBe(1);
    expect(result.summary.byCode.stuck_publishing).toBe(1);
  });

  test('detects duplicate idempotency keys and repeated failures', () => {
    const result = inspectQueueHealth({
      posts: [
        basePost({ idempotencyKey: 'duplicate' }),
        basePost({
          id: 'post-2',
          idempotencyKey: 'duplicate',
          status: POST_STATUS.FAILED,
          attemptCount: 3,
        }),
      ],
      credentials: { facebook_token: 'token' },
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.duplicate_idempotency_key).toBe(1);
    expect(result.summary.byCode.repeated_failure).toBe(1);
  });
});
