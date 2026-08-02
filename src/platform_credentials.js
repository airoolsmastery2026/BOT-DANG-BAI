export const PLATFORM_CREDENTIALS_KEY = 'bot_dang_bai_platform_credentials';

const EMPTY_CREDENTIALS = Object.freeze({
  facebook_token: '',
  instagram_token: '',
  tiktok_token: '',
});

const normalizeCredentials = (value) => ({
  facebook_token: String(value?.facebook_token || '').trim(),
  instagram_token: String(value?.instagram_token || '').trim(),
  tiktok_token: String(value?.tiktok_token || '').trim(),
});

export function loadPlatformCredentials(storage) {
  const target = storage || (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!target) return { ...EMPTY_CREDENTIALS };

  try {
    return normalizeCredentials(JSON.parse(target.getItem(PLATFORM_CREDENTIALS_KEY) || '{}'));
  } catch {
    return { ...EMPTY_CREDENTIALS };
  }
}

export function savePlatformCredentials(credentials, storage) {
  const target = storage || (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!target) throw new Error('Trình duyệt không hỗ trợ lưu thông tin phiên.');

  const normalized = normalizeCredentials(credentials);
  target.setItem(PLATFORM_CREDENTIALS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearPlatformCredentials(storage) {
  const target = storage || (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!target) return false;
  target.removeItem(PLATFORM_CREDENTIALS_KEY);
  return true;
}

export function getConnectedPlatforms(credentials) {
  const normalized = normalizeCredentials(credentials);
  return {
    facebook: Boolean(normalized.facebook_token),
    instagram: Boolean(normalized.instagram_token),
    tiktok: Boolean(normalized.tiktok_token),
  };
}

export { EMPTY_CREDENTIALS };
