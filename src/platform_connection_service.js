import { FacebookAPI, InstagramAPI } from './api_handler';
import { TikTokContentPostingAPI } from './tiktok_content_posting';
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

const normalizeRemoteId = (value, prefix = '') => {
  const raw = String(value || '').trim();
  return prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
};

export async function verifyPlatformConnection(platform, credentials) {
  const normalized = normalizeCredentials(credentials);

  try {
    if (platform === 'facebook') {
      if (!normalized.facebook_token || !normalized.facebook_page_id) {
        return failure(platform, 'Cần Facebook Page Access Token và Page ID.');
      }
      const api = new FacebookAPI(normalized.facebook_token);
      const account = await api.getPageDetails(normalized.facebook_page_id);
      if (!account) return failure(platform, 'Không đọc được Facebook Page. Kiểm tra token, Page ID và quyền.');
      if (String(account.id || '').trim() !== normalized.facebook_page_id) {
        return failure(platform, 'Token không trả về đúng Facebook Page ID đã cấu hình.');
      }
      return success(platform, account);
    }

    if (platform === 'instagram') {
      if (!normalized.instagram_token || !normalized.instagram_user_id) {
        return failure(platform, 'Cần Instagram Access Token và Business/Creator ID.');
      }
      const api = new InstagramAPI(normalized.instagram_token);
      const accounts = await api.searchAccounts([], { limit: 1 });
      const account = Array.isArray(accounts) ? accounts[0] : null;
      if (!account) return failure(platform, 'Không đọc được tài khoản Instagram. Kiểm tra token và quyền.');

      const remoteId = normalizeRemoteId(account.sourceId || account.id, 'ig_');
      if (remoteId !== normalized.instagram_user_id) {
        return failure(platform, 'Token Instagram không khớp Business/Creator ID đã cấu hình.');
      }
      return success(platform, account);
    }

    if (platform === 'tiktok') {
      if (!normalized.tiktok_token) return failure(platform, 'Cần TikTok Access Token.');
      const api = new TikTokContentPostingAPI(normalized.tiktok_token);
      const account = await api.getCreatorInfo();
      return account
        ? success(platform, account)
        : failure(platform, 'Không đọc được quyền Content Posting của TikTok. Kiểm tra token và scope video.publish.');
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
