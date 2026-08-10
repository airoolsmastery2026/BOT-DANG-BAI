import {
  PLATFORM_CREDENTIALS_KEY,
  clearPlatformCredentials,
  getConnectedPlatforms,
  getDefaultTargetIds,
  getPlatformConnectionIssues,
  loadPlatformCredentials,
  savePlatformCredentials,
} from './platform_credentials';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('platform credentials', () => {
  test('saves normalized credentials and only reports complete account connections', () => {
    const storage = createStorage();
    const saved = savePlatformCredentials({
      facebook_token: ' fb-token ',
      facebook_page_id: ' page-1 ',
      instagram_token: 'ig-token',
      instagram_user_id: '',
      tiktok_token: ' tt-token ',
    }, storage);

    expect(saved.facebook_token).toBe('fb-token');
    expect(saved.facebook_page_id).toBe('page-1');
    expect(loadPlatformCredentials(storage)).toEqual(saved);
    expect(getConnectedPlatforms(saved)).toEqual({
      facebook: true,
      instagram: false,
      tiktok: true,
    });
    expect(getDefaultTargetIds(saved)).toEqual({ facebook: 'page-1', instagram: '' });
    expect(getPlatformConnectionIssues(saved).instagram).toContain('Thiếu Instagram Business/Creator ID');
  });

  test('does not mark Facebook or Instagram connected from token alone', () => {
    expect(getConnectedPlatforms({
      facebook_token: 'fb',
      instagram_token: 'ig',
      tiktok_token: '',
    })).toEqual({ facebook: false, instagram: false, tiktok: false });
  });

  test('returns empty credentials for malformed storage', () => {
    const storage = createStorage();
    storage.setItem(PLATFORM_CREDENTIALS_KEY, '{bad json');

    expect(loadPlatformCredentials(storage)).toEqual({
      facebook_token: '',
      facebook_page_id: '',
      instagram_token: '',
      instagram_user_id: '',
      tiktok_token: '',
    });
  });

  test('clears credentials from the current session', () => {
    const storage = createStorage();
    savePlatformCredentials({ facebook_token: 'token', facebook_page_id: 'page' }, storage);

    expect(clearPlatformCredentials(storage)).toBe(true);
    expect(loadPlatformCredentials(storage).facebook_token).toBe('');
  });
});
