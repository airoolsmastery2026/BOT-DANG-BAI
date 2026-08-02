/**
 * Post Manager - quản lý hàng đợi bài đăng, lên lịch và tự động đăng.
 *
 * Đây là scheduler chạy phía trình duyệt. Tác vụ chỉ được kiểm tra khi ứng
 * dụng đang mở. Scheduler phía server sẽ được kết nối ở giai đoạn vận hành.
 */

import { FacebookAPI, InstagramAPI, TikTokAPI } from './api_handler';
import { saveToLocalStorage, getFromLocalStorage } from './utils';

const STORAGE_KEY = 'scheduled_posts';
const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

export const POST_STATUS = {
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const RECURRENCE = {
  NONE: 'none',
  DAILY: 'daily',
  WEEKLY: 'weekly',
};

const createPostId = () => `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const normalizePlatforms = (platforms) => {
  if (!Array.isArray(platforms)) return [];
  return [...new Set(platforms
    .map((platform) => String(platform || '').trim().toLowerCase())
    .filter((platform) => SUPPORTED_PLATFORMS.has(platform)))];
};

const normalizeRecurrence = (recurrence) => (
  Object.values(RECURRENCE).includes(recurrence) ? recurrence : RECURRENCE.NONE
);

const normalizeStoredPost = (post) => {
  if (!post || typeof post !== 'object' || !post.id) return null;
  const platforms = normalizePlatforms(post.platforms);
  const scheduledDate = new Date(post.scheduledTime);
  if (!platforms.length || !String(post.content || '').trim() || Number.isNaN(scheduledDate.getTime())) {
    return null;
  }

  return {
    ...post,
    id: String(post.id),
    campaignId: post.campaignId ? String(post.campaignId) : null,
    content: String(post.content).trim(),
    platforms,
    scheduledTime: scheduledDate.toISOString(),
    imageUrl: String(post.imageUrl || '').trim(),
    videoUrl: String(post.videoUrl || '').trim(),
    recurrence: normalizeRecurrence(post.recurrence),
    targetIds: post.targetIds && typeof post.targetIds === 'object' ? post.targetIds : {},
    status: Object.values(POST_STATUS).includes(post.status) ? post.status : POST_STATUS.SCHEDULED,
    results: post.results && typeof post.results === 'object' ? post.results : {},
  };
};

const nextRecurrence = (dateISO, recurrence) => {
  const date = new Date(dateISO);
  if (recurrence === RECURRENCE.DAILY) date.setDate(date.getDate() + 1);
  if (recurrence === RECURRENCE.WEEKLY) date.setDate(date.getDate() + 7);
  return date.toISOString();
};

const buildIdempotencyKey = ({ campaignId, platforms, scheduledTime, content }) => {
  if (!campaignId) return null;
  return [campaignId, [...platforms].sort().join(','), scheduledTime, content.slice(0, 120)].join('|');
};

export const getScheduledPosts = () => {
  const posts = getFromLocalStorage(STORAGE_KEY, []);
  if (!Array.isArray(posts)) return [];
  return posts.map(normalizeStoredPost).filter(Boolean);
};

const persist = (posts) => saveToLocalStorage(STORAGE_KEY, posts);

const prepareScheduledPost = (post, existingPosts = [], batchKeys = new Set()) => {
  const content = String(post?.content || '').trim();
  const platforms = normalizePlatforms(post?.platforms);
  const scheduledDate = new Date(post?.scheduledTime);

  if (!content) throw new Error('Nội dung bài đăng không được để trống.');
  if (!platforms.length) throw new Error('Phải chọn ít nhất một nền tảng được hỗ trợ.');
  if (Number.isNaN(scheduledDate.getTime())) throw new Error('Thời gian đăng không hợp lệ.');

  const scheduledTime = scheduledDate.toISOString();
  const campaignId = post.campaignId ? String(post.campaignId).trim() : null;
  const idempotencyKey = buildIdempotencyKey({ campaignId, platforms, scheduledTime, content });

  if (idempotencyKey && (
    existingPosts.some((item) => item.idempotencyKey === idempotencyKey)
    || batchKeys.has(idempotencyKey)
  )) {
    throw new Error('Chiến dịch này đã có một bài giống hệt trong hàng đợi.');
  }

  if (idempotencyKey) batchKeys.add(idempotencyKey);
  const now = new Date().toISOString();
  return {
    id: createPostId(),
    campaignId,
    idempotencyKey,
    content,
    platforms,
    scheduledTime,
    imageUrl: String(post.imageUrl || '').trim(),
    videoUrl: String(post.videoUrl || '').trim(),
    recurrence: normalizeRecurrence(post.recurrence),
    targetIds: post.targetIds && typeof post.targetIds === 'object' ? post.targetIds : {},
    status: POST_STATUS.SCHEDULED,
    createdAt: now,
    updatedAt: now,
    results: {},
    attemptCount: 0,
  };
};

export const schedulePosts = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Danh sách bài cần lên lịch không được để trống.');
  }
  if (entries.length > 1000) throw new Error('Mỗi lần chỉ được xếp tối đa 1000 bài.');

  const existingPosts = getScheduledPosts();
  const batchKeys = new Set();
  const prepared = entries.map((entry) => prepareScheduledPost(entry, existingPosts, batchKeys));
  persist([...existingPosts, ...prepared]);
  return prepared;
};

export const schedulePost = (post) => schedulePosts([post])[0];

export const cancelPost = (postId) => {
  const normalizedId = String(postId || '');
  const now = new Date().toISOString();
  const updated = getScheduledPosts().map((post) => (
    post.id === normalizedId && post.status === POST_STATUS.SCHEDULED
      ? { ...post, status: POST_STATUS.CANCELLED, cancelledAt: now, updatedAt: now }
      : post
  ));
  persist(updated);
  return updated;
};

export const retryPost = (postId) => {
  const normalizedId = String(postId || '');
  const now = new Date().toISOString();
  let retried = null;

  const updated = getScheduledPosts().map((post) => {
    if (post.id !== normalizedId || post.status !== POST_STATUS.FAILED) return post;
    retried = {
      ...post,
      status: POST_STATUS.SCHEDULED,
      scheduledTime: now,
      updatedAt: now,
      publishedAt: undefined,
      results: {},
      successCount: undefined,
      failureCount: undefined,
    };
    return retried;
  });

  if (retried) persist(updated);
  return retried;
};

export const retryFailedPosts = ({ campaignId = null, limit = 100 } = {}) => {
  const normalizedCampaignId = campaignId ? String(campaignId).trim() : null;
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 1000);
  const now = new Date().toISOString();
  let retriedCount = 0;

  const updated = getScheduledPosts().map((post) => {
    if (post.status !== POST_STATUS.FAILED || retriedCount >= safeLimit) return post;
    if (normalizedCampaignId && post.campaignId !== normalizedCampaignId) return post;
    retriedCount += 1;
    return {
      ...post,
      status: POST_STATUS.SCHEDULED,
      scheduledTime: now,
      updatedAt: now,
      publishedAt: undefined,
      results: {},
      successCount: undefined,
      failureCount: undefined,
    };
  });

  if (retriedCount) persist(updated);
  return retriedCount;
};

export const recoverStuckPosts = ({ timeoutMs = 10 * 60_000, now = Date.now() } = {}) => {
  const safeTimeout = Math.max(Number(timeoutMs) || 0, 60_000);
  const nowIso = new Date(now).toISOString();
  let recoveredCount = 0;

  const updated = getScheduledPosts().map((post) => {
    if (post.status !== POST_STATUS.PUBLISHING) return post;
    const lastUpdate = new Date(post.updatedAt || post.scheduledTime).getTime();
    if (!Number.isFinite(lastUpdate) || now - lastUpdate < safeTimeout) return post;

    recoveredCount += 1;
    return {
      ...post,
      status: POST_STATUS.FAILED,
      updatedAt: nowIso,
      results: {
        ...post.results,
        system: {
          success: false,
          error: 'Tác vụ bị kẹt ở trạng thái đang đăng và đã được khôi phục.',
        },
      },
      failureCount: Math.max(Number(post.failureCount || 0), 1),
    };
  });

  if (recoveredCount) persist(updated);
  return recoveredCount;
};

export const getQueueSummary = () => {
  const posts = getScheduledPosts();
  const summary = {
    total: posts.length,
    scheduled: 0,
    publishing: 0,
    published: 0,
    failed: 0,
    cancelled: 0,
    due: 0,
    campaigns: 0,
  };
  const campaigns = new Set();
  const now = Date.now();

  posts.forEach((post) => {
    if (Object.prototype.hasOwnProperty.call(summary, post.status)) summary[post.status] += 1;
    if (post.status === POST_STATUS.SCHEDULED && new Date(post.scheduledTime).getTime() <= now) summary.due += 1;
    if (post.campaignId) campaigns.add(post.campaignId);
  });

  summary.campaigns = campaigns.size;
  return summary;
};

export const deletePost = (postId) => {
  const normalizedId = String(postId || '');
  const posts = getScheduledPosts().filter((post) => post.id !== normalizedId);
  persist(posts);
  return posts;
};

const failedResult = (error) => ({
  success: false,
  error: error instanceof Error ? error.message : String(error || 'Lỗi không xác định'),
});

const normalizePublishResult = (value) => {
  if (value && typeof value === 'object' && typeof value.success === 'boolean') return value;
  return { success: true, data: value ?? null };
};

const publishToPlatforms = async (post, credentials = {}) => {
  const results = {};

  for (const platform of post.platforms) {
    try {
      if (platform === 'facebook') {
        if (!credentials.facebook_token) throw new Error('Thiếu Facebook access token.');
        const api = new FacebookAPI(credentials.facebook_token);
        results.facebook = normalizePublishResult(await api.publishPost(
          post.targetIds.facebook || 'me',
          post.content,
          { imageUrl: post.imageUrl || undefined },
        ));
      } else if (platform === 'instagram') {
        if (!credentials.instagram_token) throw new Error('Thiếu Instagram access token.');
        if (!post.imageUrl) throw new Error('Instagram yêu cầu URL ảnh.');
        const api = new InstagramAPI(credentials.instagram_token);
        results.instagram = normalizePublishResult(await api.publishPost(
          post.targetIds.instagram || 'me',
          post.imageUrl,
          post.content,
        ));
      } else if (platform === 'tiktok') {
        if (!credentials.tiktok_token) throw new Error('Thiếu TikTok access token.');
        if (!post.videoUrl) throw new Error('TikTok yêu cầu URL video.');
        const api = new TikTokAPI(credentials.tiktok_token);
        results.tiktok = normalizePublishResult(await api.publishVideo(post.videoUrl, post.content));
      }
    } catch (error) {
      results[platform] = failedResult(error);
    }
  }

  return results;
};

export const checkAndPublishDuePosts = async (credentials = {}) => {
  recoverStuckPosts();
  const posts = getScheduledPosts();
  const now = Date.now();
  const updatedPosts = [...posts];
  const recurringPosts = [];
  const processed = [];

  for (let index = 0; index < updatedPosts.length; index += 1) {
    const post = updatedPosts[index];
    if (post.status !== POST_STATUS.SCHEDULED) continue;

    const scheduledAt = new Date(post.scheduledTime).getTime();
    if (Number.isNaN(scheduledAt) || scheduledAt > now) continue;

    const publishingPost = {
      ...post,
      status: POST_STATUS.PUBLISHING,
      updatedAt: new Date().toISOString(),
      attemptCount: Number(post.attemptCount || 0) + 1,
    };
    updatedPosts[index] = publishingPost;
    persist(updatedPosts);

    const results = await publishToPlatforms(publishingPost, credentials);
    const attempts = Object.values(results);
    const successCount = attempts.filter((result) => result?.success === true).length;
    const completedPost = {
      ...publishingPost,
      results,
      status: successCount === attempts.length && attempts.length > 0
        ? POST_STATUS.PUBLISHED
        : POST_STATUS.FAILED,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      successCount,
      failureCount: attempts.length - successCount,
    };

    updatedPosts[index] = completedPost;
    processed.push(completedPost);

    if (completedPost.recurrence !== RECURRENCE.NONE && completedPost.status === POST_STATUS.PUBLISHED) {
      const recurringScheduledTime = nextRecurrence(completedPost.scheduledTime, completedPost.recurrence);
      recurringPosts.push({
        ...completedPost,
        id: createPostId(),
        idempotencyKey: buildIdempotencyKey({
          campaignId: completedPost.campaignId,
          platforms: completedPost.platforms,
          scheduledTime: recurringScheduledTime,
          content: completedPost.content,
        }),
        scheduledTime: recurringScheduledTime,
        status: POST_STATUS.SCHEDULED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: undefined,
        results: {},
        successCount: undefined,
        failureCount: undefined,
        attemptCount: 0,
      });
    }
  }

  persist([...updatedPosts, ...recurringPosts]);
  return processed;
};
