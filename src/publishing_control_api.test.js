import { getPublishingHealth, isPublishingControlConfigured } from './publishing_control_api';

const originalUrl = process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL;
const originalToken = process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN;

describe('publishing control API', () => {
  beforeEach(() => {
    delete process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL;
    delete process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL;
    else process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL = originalUrl;
    if (originalToken === undefined) delete process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN;
    else process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN = originalToken;
    delete global.fetch;
  });

  test('is disabled when no local token is configured', async () => {
    process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL = 'http://127.0.0.1:8792';

    expect(isPublishingControlConfigured()).toBe(false);
    await expect(getPublishingHealth()).resolves.toEqual({ configured: false, scheduler: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('queries scheduler state when URL and token are configured', async () => {
    process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL = 'http://127.0.0.1:8792';
    process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN = 'secret';
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: { scheduler: { paused: true } } }),
    });

    expect(isPublishingControlConfigured()).toBe(true);
    await expect(getPublishingHealth()).resolves.toEqual({
      configured: true,
      scheduler: { paused: true },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8792/api/v1/publishing/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
  });
});
