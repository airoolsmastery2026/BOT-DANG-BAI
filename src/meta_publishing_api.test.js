import {
  DEFAULT_META_GRAPH_API_VERSION,
  FacebookPagePublishingAPI,
  InstagramPublishingAPI,
  getMetaGraphApiVersion,
} from './meta_publishing_api';

const response = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue(body),
});

const originalVersion = process.env.REACT_APP_META_GRAPH_API_VERSION;

describe('Meta publishing API', () => {
  beforeEach(() => {
    delete process.env.REACT_APP_META_GRAPH_API_VERSION;
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalVersion === undefined) delete process.env.REACT_APP_META_GRAPH_API_VERSION;
    else process.env.REACT_APP_META_GRAPH_API_VERSION = originalVersion;
    delete global.fetch;
  });

  test('uses current default API contract and validates override format', () => {
    expect(getMetaGraphApiVersion()).toBe(DEFAULT_META_GRAPH_API_VERSION);
    process.env.REACT_APP_META_GRAPH_API_VERSION = 'v24.0';
    expect(getMetaGraphApiVersion()).toBe('v24.0');
    process.env.REACT_APP_META_GRAPH_API_VERSION = 'latest';
    expect(getMetaGraphApiVersion()).toBe(DEFAULT_META_GRAPH_API_VERSION);
  });

  test('reads Facebook Page identity using Bearer auth', async () => {
    global.fetch.mockResolvedValue(response({ id: 'page-1', name: 'DHP', picture: { data: { url: 'https://example.com/p.jpg' } } }));
    const api = new FacebookPagePublishingAPI('fb-token');
    const account = await api.getPageIdentity('page-1');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/page-1?fields='),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fb-token' }) }),
    );
    expect(account).toMatchObject({ id: 'page-1', name: 'DHP', platform: 'Facebook' });
  });

  test('publishes a Facebook photo without putting token in URL', async () => {
    global.fetch.mockResolvedValue(response({ id: 'photo-1', post_id: 'post-1' }));
    const api = new FacebookPagePublishingAPI('fb-token');
    const result = await api.publishPost('page-1', 'Nội dung', { imageUrl: 'https://example.com/a.jpg' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/page-1/photos');
    expect(url).not.toContain('fb-token');
    expect(options.headers.Authorization).toBe('Bearer fb-token');
    expect(options.body.get('url')).toBe('https://example.com/a.jpg');
    expect(options.body.get('caption')).toBe('Nội dung');
    expect(result.success).toBe(true);
  });

  test('reads exact Instagram identity from configured business account ID', async () => {
    global.fetch.mockResolvedValue(response({ id: 'ig-1', username: 'daihaiphat' }));
    const api = new InstagramPublishingAPI('ig-token');
    const account = await api.getAccountIdentity('ig-1');

    expect(account).toMatchObject({ id: 'ig-1', sourceId: 'ig-1', username: 'daihaiphat' });
    expect(global.fetch.mock.calls[0][0]).not.toContain('ig-token');
  });

  test('publishes Instagram image through container then media_publish', async () => {
    global.fetch
      .mockResolvedValueOnce(response({ id: 'container-1' }))
      .mockResolvedValueOnce(response({ id: 'ig-post-1' }));

    const api = new InstagramPublishingAPI('ig-token');
    const result = await api.publishImage('ig-1', 'https://example.com/a.jpg', 'Caption');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain('/ig-1/media');
    expect(global.fetch.mock.calls[0][1].body.get('image_url')).toBe('https://example.com/a.jpg');
    expect(global.fetch.mock.calls[1][0]).toContain('/ig-1/media_publish');
    expect(global.fetch.mock.calls[1][1].body.get('creation_id')).toBe('container-1');
    expect(result).toMatchObject({ success: true, postId: 'ig-post-1' });
  });

  test('normalizes Meta API errors with retryability', async () => {
    global.fetch.mockResolvedValue(response({ error: { message: 'Rate limit', code: 4 } }, { ok: false, status: 429 }));
    const api = new FacebookPagePublishingAPI('fb-token');

    await expect(api.getPageIdentity('page-1')).rejects.toMatchObject({
      message: 'Rate limit',
      code: 4,
      retryable: true,
    });
  });
});
