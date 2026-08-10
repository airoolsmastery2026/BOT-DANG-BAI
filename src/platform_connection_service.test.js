import { verifyPlatformConnection } from './platform_connection_service';
import { FacebookPagePublishingAPI, InstagramPublishingAPI } from './meta_publishing_api';
import { TikTokContentPostingAPI } from './tiktok_content_posting';

jest.mock('./meta_publishing_api', () => ({
  FacebookPagePublishingAPI: jest.fn(),
  InstagramPublishingAPI: jest.fn(),
}));

jest.mock('./tiktok_content_posting', () => ({
  TikTokContentPostingAPI: jest.fn(),
}));

describe('platform connection verification', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires Facebook Page ID as well as token', async () => {
    const result = await verifyPlatformConnection('facebook', { facebook_token: 'token' });
    expect(result.ok).toBe(false);
    expect(FacebookPagePublishingAPI).not.toHaveBeenCalled();
  });

  test('verifies the exact Facebook Page account', async () => {
    const getPageIdentity = jest.fn().mockResolvedValue({ id: 'page-1', name: 'My Page' });
    FacebookPagePublishingAPI.mockImplementation(() => ({ getPageIdentity }));

    const result = await verifyPlatformConnection('facebook', {
      facebook_token: 'token',
      facebook_page_id: 'page-1',
    });

    expect(result.ok).toBe(true);
    expect(getPageIdentity).toHaveBeenCalledWith('page-1');
  });

  test('rejects Facebook token data that resolves to another Page ID', async () => {
    FacebookPagePublishingAPI.mockImplementation(() => ({
      getPageIdentity: jest.fn().mockResolvedValue({ id: 'page-other', name: 'Other Page' }),
    }));

    const result = await verifyPlatformConnection('facebook', {
      facebook_token: 'token',
      facebook_page_id: 'page-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/không trả về đúng Facebook Page ID/i);
  });

  test('verifies Instagram and TikTok posting capability', async () => {
    InstagramPublishingAPI.mockImplementation(() => ({
      getAccountIdentity: jest.fn().mockResolvedValue({ id: 'ig-1', sourceId: 'ig-1', name: 'instagram' }),
    }));
    TikTokContentPostingAPI.mockImplementation(() => ({
      getCreatorInfo: jest.fn().mockResolvedValue({
        id: 'creator-1',
        name: 'tiktok',
        privacyLevelOptions: ['SELF_ONLY'],
      }),
    }));

    const instagram = await verifyPlatformConnection('instagram', {
      instagram_token: 'ig-token',
      instagram_user_id: 'ig-1',
    });
    const tiktok = await verifyPlatformConnection('tiktok', { tiktok_token: 'tt-token' });

    expect(instagram.ok).toBe(true);
    expect(tiktok.ok).toBe(true);
    expect(TikTokContentPostingAPI).toHaveBeenCalledWith('tt-token');
  });

  test('reports TikTok video.publish capability errors', async () => {
    TikTokContentPostingAPI.mockImplementation(() => ({
      getCreatorInfo: jest.fn().mockRejectedValue(new Error('scope_not_authorized')),
    }));

    const result = await verifyPlatformConnection('tiktok', { tiktok_token: 'tt-token' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/scope_not_authorized/i);
  });

  test('rejects an Instagram token that resolves to a different Business/Creator ID', async () => {
    InstagramPublishingAPI.mockImplementation(() => ({
      getAccountIdentity: jest.fn().mockResolvedValue({ id: 'ig-other', sourceId: 'ig-other', name: 'other' }),
    }));

    const result = await verifyPlatformConnection('instagram', {
      instagram_token: 'ig-token',
      instagram_user_id: 'ig-1',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/không khớp Business\/Creator ID/i);
  });
});
