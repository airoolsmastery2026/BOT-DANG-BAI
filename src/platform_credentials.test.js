import {
  PLATFORM_CREDENTIALS_KEY,
  clearPlatformCredentials,
  getConnectedPlatforms,
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
  test('saves normalized credentials and reports connections', () => {
    const storage = createStorage();
    const saved = savePlatformCredentials({
      facebook_token: ' fb-token ',
      instagram_token: '',
      tiktok_token: 'tt-token',
    }, storage);

    expect(saved.facebook_token).toBe('fb-token');
    expect(loadPlatformCredentials(storage)).toEqual(saved);
    expect(getConnectedPlatforms(saved)).toEqual({
      facebook: true,
      instagram: false,
      tiktok: true,
    });
  });

  test('returns empty credentials for malformed storage', () => {
    const storage = createStorage();
    storage.setItem(PLATFORM_CREDENTIALS_KEY, '{bad json');

    expect(loadPlatformCredentials(storage)).toEqual({
      facebook_token: '',
      instagram_token: '',
      tiktok_token: '',
    });
  });

  test('clears credentials from the current session', () => {
    const storage = createStorage();
    savePlatformCredentials({ facebook_token: 'token' }, storage);

    expect(clearPlatformCredentials(storage)).toBe(true);
    expect(loadPlatformCredentials(storage).facebook_token).toBe('');
  });
});
