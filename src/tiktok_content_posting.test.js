import { TikTokContentPostingAPI } from './tiktok_content_posting';

const response = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue(body),
});

describe('TikTok Content Posting client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('queries creator posting capability using bearer token', async () => {
    global.fetch.mockResolvedValue(response({
      data: {
        creator_username: 'creator-id',
        creator_nickname: 'Creator',
        creator_avatar_url: 'https://example.com/avatar.jpg',
        privacy_level_options: ['SELF_ONLY'],
        comment_disabled: false,
        duet_disabled: true,
        stitch_disabled: true,
        max_video_post_duration_sec: 300,
      },
      error: { code: 'ok', message: '' },
    }));

    const api = new TikTokContentPostingAPI('access-token');
    const creator = await api.getCreatorInfo();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
    expect(creator).toMatchObject({
      id: 'creator-id',
      name: 'Creator',
      privacyLevelOptions: ['SELF_ONLY'],
      maxVideoPostDurationSec: 300,
    });
  });

  test('surfaces TikTok scope errors from creator info', async () => {
    global.fetch.mockResolvedValue(response({
      error: { code: 'scope_not_authorized', message: 'Missing video.publish' },
    }, { ok: false, status: 401 }));

    const api = new TikTokContentPostingAPI('access-token');
    await expect(api.getCreatorInfo()).rejects.toMatchObject({
      message: 'Missing video.publish',
      code: 'scope_not_authorized',
      retryable: false,
    });
  });

  test('requires privacy option returned by creator info before direct post', async () => {
    const api = new TikTokContentPostingAPI('access-token');
    await expect(api.publishVideo(
      'https://example.com/video.mp4',
      'Caption',
      { privacyLevel: 'SELF_ONLY', creatorInfo: { privacyLevelOptions: ['PUBLIC_TO_EVERYONE'] } },
    )).rejects.toThrow(/không cho phép privacy level SELF_ONLY/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('initializes direct post only after creator capability is known', async () => {
    global.fetch.mockResolvedValue(response({
      data: { publish_id: 'publish-1' },
      error: { code: 'ok', message: '' },
    }));

    const api = new TikTokContentPostingAPI('access-token');
    const result = await api.publishVideo(
      'https://example.com/video.mp4',
      'Caption',
      {
        privacyLevel: 'SELF_ONLY',
        creatorInfo: { id: 'creator', privacyLevelOptions: ['SELF_ONLY'] },
      },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          post_info: { title: 'Caption', privacy_level: 'SELF_ONLY' },
          source_info: { source: 'PULL_FROM_URL', video_url: 'https://example.com/video.mp4' },
        }),
      }),
    );
    expect(result).toMatchObject({ success: true, publishId: 'publish-1', privacyLevel: 'SELF_ONLY' });
  });
});
