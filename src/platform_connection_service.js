import { FacebookPagePublishingAPI, InstagramPublishingAPI } from './meta_publishing_api';
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

export async function verifyPlatformConnection(platform, credentials) {
  const normalized = normalizeCredentials(credentials);

  try {
    if (platform === 'facebook') {
      if (!normalized.facebook_token || !normalized.facebook_page_id) {
        return failure(platform, 'Cần Facebook Page Access Token và Page ID.');
      }
      const api = new FacebookPagePublishingAPI(normalized.facebook_token);
      const account = await api.getPageIdentity(normalized.facebook_page_id);
      if (!account?.id) return failure(platform, 'Không đọc được Facebook Page. Kiểm tra token, Page ID và quyền.');
      if (String(account.id).trim() !== normalized.facebook_page_id) {
        return failure(platform, 'Token không trả về đúng Facebook Page ID đã cấu hình.');
      }
      return success(platform, account);
    }

    if (platform === 'instagram') {
      if (!normalized.instagram_token || !normalized.instagram_user_id) {
        return failure(platform, 'Cần Instagram Access Token và Business/Creator ID.');
      }
      const api = new InstagramPublishingAPI(normalized.instagram_token);
      const account = await api.getAccountIdentity(normalized.instagram_user_id);
      if (!account?.id) return failure(platform, 'Không đọc được tài khoản Instagram. Kiểm tra token, ID và quyền.');
      if (String(account.id).trim() !== normalized.instagram_user_id) {
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
