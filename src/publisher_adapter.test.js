import { FacebookPagePublishingAPI, InstagramPublishingAPI } from './meta_publishing_api';
import { TikTokContentPostingAPI } from './tiktok_content_posting';
import {
  MOCK_SCENARIO,
  PUBLISH_MODE,
  getMockScenario,
  getPublishMode,
  publishThroughAdapter,
} from './publisher_adapter';

jest.mock('./meta_publishing_api', () => ({
  FacebookPagePublishingAPI: jest.fn(),
  InstagramPublishingAPI: jest.fn(),
}));

jest.mock('./tiktok_content_posting', () => ({
  TikTokContentPostingAPI: jest.fn(),
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
    expect(FacebookPagePublishingAPI).not.toHaveBeenCalled();
    expect(InstagramPublishingAPI).not.toHaveBeenCalled();
    expect(TikTokContentPostingAPI).not.toHaveBeenCalled();
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
    expect(FacebookPagePublishingAPI).not.toHaveBeenCalled();
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

  test('uses explicit post target for live Facebook publish', async () => {
    const publishPost = jest.fn().mockResolvedValue({ success: true, postId: 'fb-1' });
    FacebookPagePublishingAPI.mockImplementation(() => ({ publishPost }));

    const result = await publishThroughAdapter({
      platform: 'facebook',
      post: { id: 'post-1', content: 'Test', targetIds: { facebook: 'page-explicit' } },
      credentials: { __publisherMode: 'live', facebook_token: 'token', facebook_page_id: 'page-default' },
    });

    expect(FacebookPagePublishingAPI).toHaveBeenCalledWith('token');
    expect(publishPost).toHaveBeenCalledWith('page-explicit', 'Test', { imageUrl: undefined, linkUrl: undefined });
    expect(result.postId).toBe('fb-1');
  });

  test('falls back to connected Facebook Page ID when post target is empty', async () => {
    const publishPost = jest.fn().mockResolvedValue({ success: true, postId: 'fb-2' });
    FacebookPagePublishingAPI.mockImplementation(() => ({ publishPost }));

    await publishThroughAdapter({
      platform: 'facebook',
      post: { id: 'post-2', content: 'Test', targetIds: {} },
      credentials: { __publisherMode: 'live', facebook_token: 'token', facebook_page_id: 'page-connected' },
    });

    expect(publishPost).toHaveBeenCalledWith('page-connected', 'Test', { imageUrl: undefined, linkUrl: undefined });
  });

  test('publishes Instagram image through focused Meta client', async () => {
    const publishImage = jest.fn().mockResolvedValue({ success: true, postId: 'ig-1' });
    InstagramPublishingAPI.mockImplementation(() => ({ publishImage }));

    const result = await publishThroughAdapter({
      platform: 'instagram',
      post: { id: 'post-ig', content: 'IG test', imageUrl: 'https://example.com/a.jpg', targetIds: {} },
      credentials: { __publisherMode: 'live', instagram_token: 'ig-token', instagram_user_id: 'ig-user' },
    });

    expect(InstagramPublishingAPI).toHaveBeenCalledWith('ig-token');
    expect(publishImage).toHaveBeenCalledWith('ig-user', 'https://example.com/a.jpg', 'IG test');
    expect(result.postId).toBe('ig-1');
  });

  test('queries TikTok creator info before live video init', async () => {
    const creatorInfo = { id: 'creator', name: 'Creator', privacyLevelOptions: ['SELF_ONLY'] };
    const getCreatorInfo = jest.fn().mockResolvedValue(creatorInfo);
    const publishVideo = jest.fn().mockResolvedValue({ success: true, publishId: 'tt-1' });
    TikTokContentPostingAPI.mockImplementation(() => ({ getCreatorInfo, publishVideo }));

    const result = await publishThroughAdapter({
      platform: 'tiktok',
      post: { id: 'post-tt', content: 'TikTok test', videoUrl: 'https://example.com/video.mp4' },
      credentials: { __publisherMode: 'live', tiktok_token: 'tt-token' },
    });

    expect(TikTokContentPostingAPI).toHaveBeenCalledWith('tt-token');
    expect(getCreatorInfo).toHaveBeenCalledTimes(1);
    expect(publishVideo).toHaveBeenCalledWith(
      'https://example.com/video.mp4',
      'TikTok test',
      { privacyLevel: 'SELF_ONLY', creatorInfo },
    );
    expect(result.publishId).toBe('tt-1');
  });

  test('blocks live adapter call when verified account state is required but missing', async () => {
    await expect(publishThroughAdapter({
      platform: 'facebook',
      post: { id: 'post-live', content: 'Test' },
      credentials: {
        __publisherMode: 'live',
        __requireVerification: true,
        __verifiedPlatforms: {},
        facebook_token: 'token',
        facebook_page_id: 'page-1',
      },
    })).rejects.toThrow(/chưa được kiểm tra thành công/i);

    expect(FacebookPagePublishingAPI).not.toHaveBeenCalled();
  });
});
