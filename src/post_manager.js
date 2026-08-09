/**
 * Browser-side post queue runtime.
 */
import { publishThroughAdapter } from './publisher_adapter';
import { saveToLocalStorage, getFromLocalStorage } from './utils';

const STORAGE_KEY = 'scheduled_posts';
const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);
export const MAX_PUBLISH_ATTEMPTS = 5;

export const POST_STATUS = {
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
  CANCELLED: 'cancelled',
};

export const RECURRENCE = { NONE: 'none', DAILY: 'daily', WEEKLY: 'weekly' };

const createPostId = () => `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const normalizePlatforms = (platforms) => Array.isArray(platforms)
  ? [...new Set(platforms.map((value) => String(value || '').trim().toLowerCase()).filter((value) => SUPPORTED_PLATFORMS.has(value)))]
  : [];
const normalizeRecurrence = (value) => Object.values(RECURRENCE).includes(value) ? value : RECURRENCE.NONE;
const normalizeResults = (results, platforms) => results && typeof results === 'object'
  ? Object.fromEntries(Object.entries(results).filter(([platform]) => platforms.includes(platform) || platform === 'system'))
  : {};

const normalizeStoredPost = (post) => {
  if (!post || typeof post !== 'object' || !post.id) return null;
  const platforms = normalizePlatforms(post.platforms);
  const scheduledDate = new Date(post.scheduledTime);
  if (!platforms.length || !String(post.content || '').trim() || Number.isNaN(scheduledDate.getTime())) return null;
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
    results: normalizeResults(post.results, platforms),
    attemptCount: Math.max(Number(post.attemptCount || 0), 0),
  };
};

const persist = (posts) => saveToLocalStorage(STORAGE_KEY, posts);
const nextRecurrence = (dateISO, recurrence) => {
  const date = new Date(dateISO);
  if (recurrence === RECURRENCE.DAILY) date.setDate(date.getDate() + 1);
  if (recurrence === RECURRENCE.WEEKLY) date.setDate(date.getDate() + 7);
  return date.toISOString();
};
const buildIdempotencyKey = ({ campaignId, platforms, scheduledTime, content }) => campaignId
  ? [campaignId, [...platforms].sort().join(','), scheduledTime, content.slice(0, 120)].join('|')
  : null;

export const getPendingPlatforms = (post) => normalizePlatforms(post?.platforms)
  .filter((platform) => post?.results?.[platform]?.success !== true);
export const getScheduledPosts = () => {
  const posts = getFromLocalStorage(STORAGE_KEY, []);
  return Array.isArray(posts) ? posts.map(normalizeStoredPost).filter(Boolean) : [];
};

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
  if (idempotencyKey && (existingPosts.some((item) => item.idempotencyKey === idempotencyKey) || batchKeys.has(idempotencyKey))) {
    throw new Error('Chiến dịch này đã có một bài giống hệt trong hàng đợi.');
  }
  if (idempotencyKey) batchKeys.add(idempotencyKey);
  const now = new Date().toISOString();
  return {
    id: createPostId(), campaignId, idempotencyKey, content, platforms, scheduledTime,
    imageUrl: String(post.imageUrl || '').trim(), videoUrl: String(post.videoUrl || '').trim(),
    recurrence: normalizeRecurrence(post.recurrence), targetIds: post.targetIds && typeof post.targetIds === 'object' ? post.targetIds : {},
    status: POST_STATUS.SCHEDULED, createdAt: now, updatedAt: now, results: {}, pendingPlatforms: platforms, attemptCount: 0,
  };
};

export const schedulePosts = (entries) => {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Danh sách bài cần lên lịch không được để trống.');
  if (entries.length > 1000) throw new Error('Mỗi lần chỉ được xếp tối đa 1000 bài.');
  const existingPosts = getScheduledPosts();
  const batchKeys = new Set();
  const prepared = entries.map((entry) => prepareScheduledPost(entry, existingPosts, batchKeys));
  persist([...existingPosts, ...prepared]);
  return prepared;
};
export const schedulePost = (post) => schedulePosts([post])[0];

export const cancelPost = (postId) => {
  const now = new Date().toISOString();
  const updated = getScheduledPosts().map((post) => post.id === String(postId || '') && post.status === POST_STATUS.SCHEDULED
    ? { ...post, status: POST_STATUS.CANCELLED, cancelledAt: now, updatedAt: now }
    : post);
  persist(updated);
  return updated;
};

const prepareRetry = (post, now) => {
  if (Number(post.attemptCount || 0) >= MAX_PUBLISH_ATTEMPTS) return null;
  const pendingPlatforms = getPendingPlatforms(post);
  if (!pendingPlatforms.length) return null;
  return {
    ...post, status: POST_STATUS.SCHEDULED, scheduledTime: now, updatedAt: now, publishedAt: undefined,
    pendingPlatforms, successCount: post.platforms.length - pendingPlatforms.length, failureCount: pendingPlatforms.length,
  };
};

export const retryPost = (postId) => {
  const now = new Date().toISOString();
  let retried = null;
  const updated = getScheduledPosts().map((post) => {
    if (post.id !== String(postId || '') || post.status !== POST_STATUS.FAILED) return post;
    retried = prepareRetry(post, now);
    return retried || { ...post, status: POST_STATUS.DEAD_LETTER, deadLetteredAt: now, updatedAt: now };
  });
  persist(updated);
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
    const retried = prepareRetry(post, now);
    if (!retried) return { ...post, status: POST_STATUS.DEAD_LETTER, deadLetteredAt: now, updatedAt: now };
    retriedCount += 1;
    return retried;
  });
  persist(updated);
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
    const deadLetter = Number(post.attemptCount || 0) >= MAX_PUBLISH_ATTEMPTS;
    return {
      ...post, status: deadLetter ? POST_STATUS.DEAD_LETTER : POST_STATUS.FAILED, updatedAt: nowIso,
      deadLetteredAt: deadLetter ? nowIso : post.deadLetteredAt,
      results: { ...post.results, system: { success: false, error: 'Tác vụ bị kẹt ở trạng thái đang đăng và đã được khôi phục.' } },
      failureCount: Math.max(Number(post.failureCount || 0), 1),
    };
  });
  if (recoveredCount) persist(updated);
  return recoveredCount;
};

export const getQueueSummary = () => {
  const posts = getScheduledPosts();
  const summary = { total: posts.length, scheduled: 0, publishing: 0, published: 0, failed: 0, dead_letter: 0, cancelled: 0, due: 0, campaigns: 0 };
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
  const posts = getScheduledPosts().filter((post) => post.id !== String(postId || ''));
  persist(posts);
  return posts;
};

const failedResult = (error) => ({ success: false, error: error instanceof Error ? error.message : String(error || 'Lỗi không xác định') });
const normalizePublishResult = (value) => value && typeof value === 'object' && typeof value.success === 'boolean' ? value : { success: true, data: value ?? null };
const publishToPlatforms = async (post, credentials = {}, platforms = post.platforms) => {
  const results = {};
  for (const platform of normalizePlatforms(platforms)) {
    try {
      results[platform] = normalizePublishResult(await publishThroughAdapter({ platform, post, credentials }));
    } catch (error) {
      results[platform] = failedResult(error);
    }
  }
  return results;
};

export const checkAndPublishDuePosts = async (credentials = {}) => {
  recoverStuckPosts();
  const updatedPosts = [...getScheduledPosts()];
  const recurringPosts = [];
  const processed = [];
  const now = Date.now();

  for (let index = 0; index < updatedPosts.length; index += 1) {
    const post = updatedPosts[index];
    if (post.status !== POST_STATUS.SCHEDULED) continue;
    const scheduledAt = new Date(post.scheduledTime).getTime();
    if (Number.isNaN(scheduledAt) || scheduledAt > now) continue;

    if (Number(post.attemptCount || 0) >= MAX_PUBLISH_ATTEMPTS) {
      const dead = { ...post, status: POST_STATUS.DEAD_LETTER, deadLetteredAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      updatedPosts[index] = dead;
      processed.push(dead);
      continue;
    }

    const platformsToPublish = getPendingPlatforms(post);
    if (!platformsToPublish.length) {
      updatedPosts[index] = { ...post, status: POST_STATUS.PUBLISHED, updatedAt: new Date().toISOString() };
      continue;
    }

    const publishingPost = { ...post, status: POST_STATUS.PUBLISHING, pendingPlatforms: platformsToPublish, updatedAt: new Date().toISOString(), attemptCount: Number(post.attemptCount || 0) + 1 };
    updatedPosts[index] = publishingPost;
    persist(updatedPosts);

    const results = { ...publishingPost.results, ...await publishToPlatforms(publishingPost, credentials, platformsToPublish) };
    const successCount = publishingPost.platforms.filter((platform) => results[platform]?.success === true).length;
    const failureCount = publishingPost.platforms.length - successCount;
    const exhausted = failureCount > 0 && publishingPost.attemptCount >= MAX_PUBLISH_ATTEMPTS;
    const completedPost = {
      ...publishingPost, results,
      pendingPlatforms: publishingPost.platforms.filter((platform) => results[platform]?.success !== true),
      status: failureCount === 0 ? POST_STATUS.PUBLISHED : exhausted ? POST_STATUS.DEAD_LETTER : POST_STATUS.FAILED,
      deadLetteredAt: exhausted ? new Date().toISOString() : publishingPost.deadLetteredAt,
      publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), successCount, failureCount,
    };
    updatedPosts[index] = completedPost;
    processed.push(completedPost);

    if (completedPost.recurrence !== RECURRENCE.NONE && completedPost.status === POST_STATUS.PUBLISHED) {
      const recurringScheduledTime = nextRecurrence(completedPost.scheduledTime, completedPost.recurrence);
      recurringPosts.push({
        ...completedPost, id: createPostId(),
        idempotencyKey: buildIdempotencyKey({ campaignId: completedPost.campaignId, platforms: completedPost.platforms, scheduledTime: recurringScheduledTime, content: completedPost.content }),
        scheduledTime: recurringScheduledTime, status: POST_STATUS.SCHEDULED,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), publishedAt: undefined,
        results: {}, pendingPlatforms: completedPost.platforms, successCount: undefined, failureCount: undefined, attemptCount: 0, deadLetteredAt: undefined,
      });
    }
  }
  persist([...updatedPosts, ...recurringPosts]);
  return processed;
};
