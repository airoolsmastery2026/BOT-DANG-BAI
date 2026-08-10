import { FacebookAPI, InstagramAPI, TikTokAPI } from './api_handler';
import { normalizeCredentials } from './platform_credentials';

const failure = (platform, message) => ({
  platform,
  ok: false,
  account: null,
  message,
  checkedAt: new Date().toISOString(),
});

const success = (platform, account) => ({
  platform,
  ok: true,
  account,
  message: 'Kết nối hợp lệ.',
  checkedAt: new Date().toISOString(),
});

export async function verifyPlatformConnection(platform, credentials) {
  const normalized = normalizeCredentials(credentials);

  try {
    if (platform === 'facebook') {
      if (!normalized.facebook_token || !normalized.facebook_page_id) {
        return failure(platform, 'Cần Facebook Page Access Token và Page ID.');
      }
      const api = new FacebookAPI(normalized.facebook_token);
      const account = await api.getPageDetails(normalized.facebook_page_id);
      return account ? success(platform, account) : failure(platform, 'Không đọc được Facebook Page. Kiểm tra token, Page ID và quyền.');
    }

    if (platform === 'instagram') {
      if (!normalized.instagram_token || !normalized.instagram_user_id) {
        return failure(platform, 'Cần Instagram Access Token và Business/Creator ID.');
      }
      const api = new InstagramAPI(normalized.instagram_token);
      const accounts = await api.searchAccounts([], { limit: 1 });
      const account = Array.isArray(accounts) ? accounts[0] : null;
      return account ? success(platform, account) : failure(platform, 'Không đọc được tài khoản Instagram. Kiểm tra token và quyền.');
    }

    if (platform === 'tiktok') {
      if (!normalized.tiktok_token) return failure(platform, 'Cần TikTok Access Token.');
      const api = new TikTokAPI(normalized.tiktok_token);
      const account = await api.getUserInfo();
      return account ? success(platform, account) : failure(platform, 'Không đọc được tài khoản TikTok. Kiểm tra token và scope OAuth.');
    }

    return failure(platform, 'Nền tảng chưa được hỗ trợ.');
  } catch (error) {
    return failure(platform, error?.message || 'Không thể kiểm tra kết nối.');
  }
}

export async function verifyAllPlatformConnections(credentials) {
  const platforms = ['facebook', 'instagram', 'tiktok'];
  const results = await Promise.all(platforms.map((platform) => verifyPlatformConnection(platform, credentials)));
  return Object.fromEntries(results.map((result) => [result.platform, result]));
}
