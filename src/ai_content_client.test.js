import {
  getAIContentHealth,
  isAIContentServerConfigured,
  requestAIContent,
} from './ai_content_client';

const originalUrl = process.env.REACT_APP_DHP_AI_CONTENT_URL;

describe('AI content browser client', () => {
  beforeEach(() => {
    delete process.env.REACT_APP_DHP_AI_CONTENT_URL;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.REACT_APP_DHP_AI_CONTENT_URL;
    else process.env.REACT_APP_DHP_AI_CONTENT_URL = originalUrl;
    delete global.fetch;
  });

  test('stays disabled when gateway URL is not configured', async () => {
    expect(isAIContentServerConfigured()).toBe(false);
    await expect(getAIContentHealth()).resolves.toEqual({
      gatewayConfigured: false,
      serverConfigured: false,
      status: 'disabled',
      provider: null,
      model: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sends only content request fields to configured gateway', async () => {
    process.env.REACT_APP_DHP_AI_CONTENT_URL = 'http://127.0.0.1:8793';
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: { text: 'Nội dung AI', model: 'gemini-2.5-flash' } }),
    });

    const result = await requestAIContent({
      topic: 'Tủ bếp veneer',
      tone: 'friendly',
      length: 'medium',
    });

    expect(result.text).toBe('Nội dung AI');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8793/api/v1/content/generate');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options.body).not.toMatch(/api[_-]?key|gemini[_-]?api[_-]?key|authorization/i);
  });

  test('reports gateway and server provider readiness without browser credentials', async () => {
    process.env.REACT_APP_DHP_AI_CONTENT_URL = 'http://127.0.0.1:8793';
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        status: 'ok',
        configured: true,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      }),
    });

    const result = await getAIContentHealth();
    expect(result).toEqual({
      gatewayConfigured: true,
      serverConfigured: true,
      status: 'ok',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    expect(global.fetch.mock.calls[0][1].headers).toBeUndefined();
  });

  test('distinguishes reachable gateway from missing server-side provider key', async () => {
    process.env.REACT_APP_DHP_AI_CONTENT_URL = 'http://127.0.0.1:8793';
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        status: 'ok',
        configured: false,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      }),
    });

    await expect(getAIContentHealth()).resolves.toMatchObject({
      gatewayConfigured: true,
      serverConfigured: false,
      status: 'ok',
    });
  });
});
