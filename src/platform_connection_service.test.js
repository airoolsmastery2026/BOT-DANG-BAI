import { verifyPlatformConnection } from './platform_connection_service';
import { FacebookAPI, InstagramAPI, TikTokAPI } from './api_handler';

jest.mock('./api_handler', () => ({
  FacebookAPI: jest.fn(),
  InstagramAPI: jest.fn(),
  TikTokAPI: jest.fn(),
}));

describe('platform connection verification', () => {
  beforeEach(() => jest.clearAllMocks());

  test('requires Facebook Page ID as well as token', async () => {
    const result = await verifyPlatformConnection('facebook', { facebook_token: 'token' });
    expect(result.ok).toBe(false);
    expect(FacebookAPI).not.toHaveBeenCalled();
  });

  test('verifies a Facebook Page account', async () => {
    const getPageDetails = jest.fn().mockResolvedValue({ id: 'page-1', name: 'My Page' });
    FacebookAPI.mockImplementation(() => ({ getPageDetails }));

    const result = await verifyPlatformConnection('facebook', {
      facebook_token: 'token',
      facebook_page_id: 'page-1',
    });

    expect(result.ok).toBe(true);
    expect(getPageDetails).toHaveBeenCalledWith('page-1');
  });

  test('verifies Instagram and TikTok through their account APIs', async () => {
    InstagramAPI.mockImplementation(() => ({
      searchAccounts: jest.fn().mockResolvedValue([{ id: 'ig-1', name: 'instagram' }]),
    }));
    TikTokAPI.mockImplementation(() => ({
      getUserInfo: jest.fn().mockResolvedValue({ id: 'tt-1', name: 'tiktok' }),
    }));

    const instagram = await verifyPlatformConnection('instagram', {
      instagram_token: 'ig-token',
      instagram_user_id: 'ig-1',
    });
    const tiktok = await verifyPlatformConnection('tiktok', { tiktok_token: 'tt-token' });

    expect(instagram.ok).toBe(true);
    expect(tiktok.ok).toBe(true);
  });
});
