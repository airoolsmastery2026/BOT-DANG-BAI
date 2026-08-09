import { FacebookAPI, InstagramAPI, TikTokAPI } from './api_handler';

export const PUBLISH_MODE = {
  MOCK: 'mock',
  LIVE: 'live',
};

const normalizeMode = (value) => (
  String(value || '').trim().toLowerCase() === PUBLISH_MODE.MOCK
    ? PUBLISH_MODE.MOCK
    : PUBLISH_MODE.LIVE
);

export const getPublishMode = (credentials = {}) => normalizeMode(
  credentials.__publisherMode
    || process.env.REACT_APP_PUBLISH_MODE
    || PUBLISH_MODE.LIVE,
);

const mockResult = (platform, post) => ({
  success: true,
  mock: true,
  platform,
  externalPostId: `mock_${platform}_${post.id || Date.now()}`,
  publishedAt: new Date().toISOString(),
});

const livePublish = async (platform, post, credentials) => {
  if (platform === 'facebook') {
    if (!credentials.facebook_token) throw new Error('Thiếu Facebook access token.');
    const api = new FacebookAPI(credentials.facebook_token);
    return api.publishPost(
      post.targetIds?.facebook || 'me',
      post.content,
      { imageUrl: post.imageUrl || undefined },
    );
  }

  if (platform === 'instagram') {
    if (!credentials.instagram_token) throw new Error('Thiếu Instagram access token.');
    if (!post.imageUrl) throw new Error('Instagram yêu cầu URL ảnh.');
    const api = new InstagramAPI(credentials.instagram_token);
    return api.publishPost(
      post.targetIds?.instagram || 'me',
      post.imageUrl,
      post.content,
    );
  }

  if (platform === 'tiktok') {
    if (!credentials.tiktok_token) throw new Error('Thiếu TikTok access token.');
    if (!post.videoUrl) throw new Error('TikTok yêu cầu URL video.');
    const api = new TikTokAPI(credentials.tiktok_token);
    return api.publishVideo(post.videoUrl, post.content);
  }

  throw new Error(`Nền tảng ${platform} chưa có publisher adapter.`);
};

export const publishThroughAdapter = async ({ platform, post, credentials = {} }) => {
  const mode = getPublishMode(credentials);
  if (mode === PUBLISH_MODE.MOCK) return mockResult(platform, post);
  return livePublish(platform, post, credentials);
};
