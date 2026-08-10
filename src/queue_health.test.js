import { MAX_PUBLISH_ATTEMPTS, POST_STATUS } from './post_manager';
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

const facebookCredentials = { facebook_token: 'token', facebook_page_id: 'page-1' };

describe('queue health diagnostics', () => {
  test('reports a healthy scheduled task when requirements are met', () => {
    const result = inspectQueueHealth({
      posts: [basePost()],
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.healthy).toBe(true);
    expect(result.summary.total).toBe(0);
  });

  test('detects missing platform credentials, targets and media', () => {
    const result = inspectQueueHealth({
      posts: [basePost({ platforms: ['instagram', 'tiktok'] })],
      credentials: {},
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.missing_token).toBe(2);
    expect(result.summary.byCode.missing_target).toBe(1);
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
      credentials: facebookCredentials,
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
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.duplicate_idempotency_key).toBe(1);
    expect(result.summary.byCode.repeated_failure).toBe(1);
  });

  test('detects unsafe retry after a partial multi-platform publish', () => {
    const result = inspectQueueHealth({
      posts: [basePost({
        platforms: ['facebook', 'instagram'],
        status: POST_STATUS.FAILED,
        results: {
          facebook: { success: true, data: { id: 'fb-post' } },
          instagram: { success: false, error: 'token expired' },
        },
      })],
      credentials: {
        facebook_token: 'token',
        facebook_page_id: 'page-1',
        instagram_token: 'token',
        instagram_user_id: 'ig-1',
      },
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.partial_publish_requires_selective_retry).toBe(1);
    expect(result.healthy).toBe(false);
  });

  test('detects scheduled tasks that still contain successful results', () => {
    const result = inspectQueueHealth({
      posts: [basePost({
        status: POST_STATUS.SCHEDULED,
        results: { facebook: { success: true } },
      })],
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.scheduled_with_successful_results).toBe(1);
  });

  test('detects results that do not belong to the task platforms', () => {
    const result = inspectQueueHealth({
      posts: [basePost({
        results: { linkedin: { success: false, error: 'unexpected' } },
      })],
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.orphaned_platform_result).toBe(1);
    expect(result.summary.warning).toBe(1);
  });

  test('detects scheduled and failed tasks that exceeded max attempts', () => {
    const result = inspectQueueHealth({
      posts: [
        basePost({ attemptCount: MAX_PUBLISH_ATTEMPTS }),
        basePost({ id: 'post-2', status: POST_STATUS.FAILED, attemptCount: MAX_PUBLISH_ATTEMPTS }),
      ],
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.summary.byCode.scheduled_exhausted_attempts).toBe(1);
    expect(result.summary.byCode.failed_exhausted_attempts).toBe(1);
    expect(result.healthy).toBe(false);
  });

  test('surfaces dead letter queue items for manual handling', () => {
    const result = inspectQueueHealth({
      posts: [basePost({
        status: POST_STATUS.DEAD_LETTER,
        attemptCount: MAX_PUBLISH_ATTEMPTS,
        deadLetteredAt: '2026-08-02T00:02:00.000Z',
      })],
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:03:00.000Z').getTime(),
    });

    expect(result.summary.byCode.dead_letter_item).toBe(1);
    expect(result.summary.warning).toBe(1);
    expect(result.healthy).toBe(true);
  });

  test('detects dead letter tasks without audit timestamp', () => {
    const result = inspectQueueHealth({
      posts: [basePost({ status: POST_STATUS.DEAD_LETTER })],
      credentials: facebookCredentials,
      now: new Date('2026-08-02T00:03:00.000Z').getTime(),
    });

    expect(result.summary.byCode.dead_letter_item).toBe(1);
    expect(result.summary.byCode.dead_letter_missing_timestamp).toBe(1);
  });

  test('mock mode does not report missing live credentials or targets', () => {
    const result = inspectQueueHealth({
      posts: [basePost()],
      credentials: { __publisherMode: 'mock' },
      now: new Date('2026-08-02T00:01:00.000Z').getTime(),
    });

    expect(result.mode).toBe('mock');
    expect(result.summary.byCode.missing_token).toBeUndefined();
    expect(result.summary.byCode.missing_target).toBeUndefined();
  });
});
