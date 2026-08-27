import { PERSISTENT_PLATFORM_CONNECTIONS } from './persistent_platform_connection_catalog';

test('catalog covers every remaining persistent worker platform', () => {
  expect(PERSISTENT_PLATFORM_CONNECTIONS.map((platform) => platform.id)).toEqual([
    'linkedin',
    'pinterest',
    'youtube',
  ]);
});

test('credential acquisition links point only to official HTTPS portals and docs', () => {
  const officialHosts = new Set([
    'www.linkedin.com',
    'learn.microsoft.com',
    'developers.pinterest.com',
    'console.cloud.google.com',
    'developers.google.com',
  ]);

  PERSISTENT_PLATFORM_CONNECTIONS.forEach((platform) => {
    ['portal', 'tokenHelp', 'targetHelp', 'docs'].forEach((key) => {
      const url = new URL(platform[key].href);
      expect(url.protocol).toBe('https:');
      expect(officialHosts.has(url.hostname)).toBe(true);
      expect(url.username).toBe('');
      expect(url.password).toBe('');
      expect(url.search).toBe('');
    });
    expect(platform.steps.length).toBeGreaterThanOrEqual(3);
  });
});
