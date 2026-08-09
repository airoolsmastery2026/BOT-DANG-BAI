import { FacebookAPI } from './api_handler';
import {
  MOCK_SCENARIO,
  PUBLISH_MODE,
  getMockScenario,
  getPublishMode,
  publishThroughAdapter,
} from './publisher_adapter';

jest.mock('./api_handler', () => ({
  FacebookAPI: jest.fn(),
  InstagramAPI: jest.fn(),
  TikTokAPI: jest.fn(),
}));

describe('publisher adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses mock mode without platform credentials or network adapters', async () => {
    const result = await publishThroughAdapter({
      platform: 'facebook',
      post: { id: 'post-1', content: 'Test' },
      credentials: { __publisherMode: 'mock' },
    });

    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.platform).toBe('facebook');
    expect(result.scenario).toBe(MOCK_SCENARIO.SUCCESS);
    expect(result.externalPostId).toContain('mock_facebook_post-1');
    expect(FacebookAPI).not.toHaveBeenCalled();
  });

  test('normalizes unknown mode to live for safety', () => {
    expect(getPublishMode({ __publisherMode: 'anything' })).toBe(PUBLISH_MODE.LIVE);
  });

  test('normalizes unknown mock scenario to success', () => {
    expect(getMockScenario({ __mockScenario: 'unknown' })).toBe(MOCK_SCENARIO.SUCCESS);
  });

  test('simulates rate limiting without any network call', async () => {
    const result = await publishThroughAdapter({
      platform: 'facebook',
      post: { id: 'post-rate', content: 'Test' },
      credentials: { __publisherMode: 'mock', __mockScenario: MOCK_SCENARIO.RATE_LIMIT },
    });

    expect(result).toMatchObject({
      success: false,
      mock: true,
      platform: 'facebook',
      scenario: MOCK_SCENARIO.RATE_LIMIT,
      errorCode: 'MOCK_429',
      retryable: true,
    });
    expect(FacebookAPI).not.toHaveBeenCalled();
  });

  test('partial Instagram scenario fails only Instagram', async () => {
    const credentials = { __publisherMode: 'mock', __mockScenario: MOCK_SCENARIO.PARTIAL_INSTAGRAM };
    const post = { id: 'post-partial', content: 'Test' };
    const facebook = await publishThroughAdapter({ platform: 'facebook', post, credentials });
    const instagram = await publishThroughAdapter({ platform: 'instagram', post, credentials });

    expect(facebook.success).toBe(true);
    expect(instagram).toMatchObject({ success: false, errorCode: 'MOCK_INSTAGRAM_FAILED' });
  });

  test('partial TikTok scenario fails only TikTok', async () => {
    const credentials = { __publisherMode: 'mock', __mockScenario: MOCK_SCENARIO.PARTIAL_TIKTOK };
    const post = { id: 'post-partial', content: 'Test' };
    const facebook = await publishThroughAdapter({ platform: 'facebook', post, credentials });
    const tiktok = await publishThroughAdapter({ platform: 'tiktok', post, credentials });

    expect(facebook.success).toBe(true);
    expect(tiktok).toMatchObject({ success: false, errorCode: 'MOCK_TIKTOK_FAILED' });
  });

  test('uses live adapter when live mode is explicit', async () => {
    const publishPost = jest.fn().mockResolvedValue({ success: true, postId: 'fb-1' });
    FacebookAPI.mockImplementation(() => ({ publishPost }));

    const result = await publishThroughAdapter({
      platform: 'facebook',
      post: { id: 'post-1', content: 'Test', targetIds: { facebook: 'page-1' } },
      credentials: { __publisherMode: 'live', facebook_token: 'token' },
    });

    expect(FacebookAPI).toHaveBeenCalledWith('token');
    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(result.postId).toBe('fb-1');
  });
});
