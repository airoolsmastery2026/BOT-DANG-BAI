import { FacebookAPI, InstagramAPI, TikTokAPI } from './api_handler';

export const PUBLISH_MODE = {
  MOCK: 'mock',
  LIVE: 'live',
};

export const MOCK_SCENARIO = {
  SUCCESS: 'success',
  RATE_LIMIT: 'rate_limit',
  NETWORK_TIMEOUT: 'network_timeout',
  PARTIAL_INSTAGRAM: 'partial_instagram',
  PARTIAL_TIKTOK: 'partial_tiktok',
};

const normalizeMode = (value) => (
  String(value || '').trim().toLowerCase() === PUBLISH_MODE.MOCK
    ? PUBLISH_MODE.MOCK
    : PUBLISH_MODE.LIVE
);

const normalizeScenario = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(MOCK_SCENARIO).includes(normalized)
    ? normalized
    : MOCK_SCENARIO.SUCCESS;
};

export const getPublishMode = (credentials = {}) => normalizeMode(
  credentials.__publisherMode
    || process.env.REACT_APP_PUBLISH_MODE
    || PUBLISH_MODE.LIVE,
);

export const getMockScenario = (credentials = {}) => normalizeScenario(
  credentials.__mockScenario || MOCK_SCENARIO.SUCCESS,
);

const mockFailure = (platform, post, scenario, error, errorCode, retryable = true) => ({
  success: false,
  mock: true,
  platform,
  scenario,
  error,
  errorCode,
  retryable,
  externalPostId: null,
  attemptedAt: new Date().toISOString(),
  postId: post.id || null,
});

const mockResult = (platform, post, credentials) => {
  const scenario = getMockScenario(credentials);

  if (scenario === MOCK_SCENARIO.RATE_LIMIT) {
    return mockFailure(platform, post, scenario, 'Mock API rate limit (429).', 'MOCK_429', true);
  }

  if (scenario === MOCK_SCENARIO.NETWORK_TIMEOUT) {
    return mockFailure(platform, post, scenario, 'Mock network timeout.', 'MOCK_TIMEOUT', true);
  }

  if (scenario === MOCK_SCENARIO.PARTIAL_INSTAGRAM && platform === 'instagram') {
    return mockFailure(platform, post, scenario, 'Mock Instagram publish failure.', 'MOCK_INSTAGRAM_FAILED', true);
  }

  if (scenario === MOCK_SCENARIO.PARTIAL_TIKTOK && platform === 'tiktok') {
    return mockFailure(platform, post, scenario, 'Mock TikTok publish failure.', 'MOCK_TIKTOK_FAILED', true);
  }

  return {
    success: true,
    mock: true,
    platform,
    scenario,
    externalPostId: `mock_${platform}_${post.id || Date.now()}`,
    publishedAt: new Date().toISOString(),
  };
};

const resolveTargetId = (platform, post, credentials) => {
  const explicit = String(post?.targetIds?.[platform] || '').trim();
  if (explicit) return explicit;
  if (platform === 'facebook') return String(credentials.facebook_page_id || '').trim();
  if (platform === 'instagram') return String(credentials.instagram_user_id || '').trim();
  return '';
};

const livePublish = async (platform, post, credentials) => {
  if (platform === 'facebook') {
    if (!credentials.facebook_token) throw new Error('Thiếu Facebook access token.');
    const pageId = resolveTargetId(platform, post, credentials);
    if (!pageId) throw new Error('Thiếu Facebook Page ID. Hãy cấu hình tại mục Kết nối.');
    const api = new FacebookAPI(credentials.facebook_token);
    return api.publishPost(
      pageId,
      post.content,
      { imageUrl: post.imageUrl || undefined },
    );
  }

  if (platform === 'instagram') {
    if (!credentials.instagram_token) throw new Error('Thiếu Instagram access token.');
    if (!post.imageUrl) throw new Error('Instagram yêu cầu URL ảnh.');
    const instagramUserId = resolveTargetId(platform, post, credentials);
    if (!instagramUserId) throw new Error('Thiếu Instagram Business/Creator ID. Hãy cấu hình tại mục Kết nối.');
    const api = new InstagramAPI(credentials.instagram_token);
    return api.publishPost(
      instagramUserId,
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
  if (mode === PUBLISH_MODE.MOCK) return mockResult(platform, post, credentials);
  return livePublish(platform, post, credentials);
};
