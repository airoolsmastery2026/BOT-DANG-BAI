import { FacebookAPI } from './api_handler';
import { PUBLISH_MODE, getPublishMode, publishThroughAdapter } from './publisher_adapter';

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
    expect(result.externalPostId).toContain('mock_facebook_post-1');
    expect(FacebookAPI).not.toHaveBeenCalled();
  });

  test('normalizes unknown mode to live for safety', () => {
    expect(getPublishMode({ __publisherMode: 'anything' })).toBe(PUBLISH_MODE.LIVE);
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
