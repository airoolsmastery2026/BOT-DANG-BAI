import { POST_STATUS } from './post_manager';
import { inspectSystemReadiness } from './system_readiness';

const post = (overrides = {}) => ({
  id: 'post-1',
  campaignId: 'campaign-1',
  content: 'Nội dung hợp lệ',
  platforms: ['facebook'],
  scheduledTime: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  status: POST_STATUS.SCHEDULED,
  imageUrl: '',
  videoUrl: '',
  targetIds: {},
  results: {},
  attemptCount: 0,
  ...overrides,
});

const now = new Date('2026-08-10T00:01:00.000Z').getTime();

describe('system live readiness', () => {
  test('blocks live mode when no social account is connected', () => {
    const result = inspectSystemReadiness({ credentials: {}, posts: [], now });
    expect(result.readyForLive).toBe(false);
    expect(result.blockers.map((item) => item.code)).toContain('no_connected_account');
  });

  test('is live-ready with a configured account and clean queue when verification is optional', () => {
    const result = inspectSystemReadiness({
      credentials: { facebook_token: 'token', facebook_page_id: 'page-1' },
      posts: [],
      now,
    });

    expect(result.readyForLive).toBe(true);
    expect(result.connectedPlatforms).toEqual(['facebook']);
    expect(result.blockers).toHaveLength(0);
  });

  test('blocks configured but unverified accounts when verification is required', () => {
    const result = inspectSystemReadiness({
      credentials: {
        facebook_token: 'token',
        facebook_page_id: 'page-1',
        __requireVerification: true,
        __verifiedPlatforms: {},
      },
      posts: [],
      now,
    });

    expect(result.readyForLive).toBe(false);
    expect(result.connectedCount).toBe(1);
    expect(result.verifiedCount).toBe(0);
    expect(result.unverifiedPlatforms).toEqual(['facebook']);
    expect(result.blockers.map((item) => item.code)).toContain('unverified_accounts');
  });

  test('is live-ready after the connected account is verified', () => {
    const result = inspectSystemReadiness({
      credentials: {
        facebook_token: 'token',
        facebook_page_id: 'page-1',
        __requireVerification: true,
        __verifiedPlatforms: { facebook: true },
      },
      posts: [],
      now,
    });

    expect(result.readyForLive).toBe(true);
    expect(result.verifiedCount).toBe(1);
  });

  test('blocks live mode when a due post fails preflight', () => {
    const result = inspectSystemReadiness({
      credentials: { facebook_token: 'token', facebook_page_id: 'page-1' },
      posts: [post({ platforms: ['instagram'], imageUrl: '' })],
      now,
    });

    expect(result.readyForLive).toBe(false);
    expect(result.blockers.map((item) => item.code)).toEqual(expect.arrayContaining([
      'queue_health_errors',
      'publisher_preflight_blocked',
    ]));
  });
});
