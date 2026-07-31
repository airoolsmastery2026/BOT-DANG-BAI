/**
 * Post Manager - quản lý hàng đợi bài đăng, lên lịch và tự động đăng.
 *
 * Đây là scheduler chạy phía trình duyệt. Tác vụ chỉ được kiểm tra khi ứng
 * dụng đang mở. Scheduler phía server sẽ được kết nối ở giai đoạn vận hành.
 */

import { FacebookAPI, InstagramAPI, TikTokAPI } from './api_handler';
import { saveToLocalStorage, getFromLocalStorage } from './utils';

const STORAGE_KEY = 'scheduled_posts';

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

const nextRecurrence = (dateISO, recurrence) => {
  const date = new Date(dateISO);
  if (recurrence === RECURRENCE.DAILY) date.setDate(date.getDate() + 1);
  if (recurrence === RECURRENCE.WEEKLY) date.setDate(date.getDate() + 7);
  return date.toISOString();
};

export const getScheduledPosts = () => {
  const posts = getFromLocalStorage(STORAGE_KEY, []);
  return Array.isArray(posts) ? posts : [];
};

const persist = (posts) => saveToLocalStorage(STORAGE_KEY, posts);

export const schedulePost = (post) => {
  const scheduledDate = new Date(post.scheduledTime);
  if (!post.content?.trim()) throw new Error('Nội dung bài đăng không được để trống.');
  if (!Array.isArray(post.platforms) || post.platforms.length === 0) {
    throw new Error('Phải chọn ít nhất một nền tảng.');
  }
  if (Number.isNaN(scheduledDate.getTime())) throw new Error('Thời gian đăng không hợp lệ.');

  const posts = getScheduledPosts();
  const newPost = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: post.content.trim(),
    platforms: [...new Set(post.platforms)],
    scheduledTime: scheduledDate.toISOString(),
    imageUrl: post.imageUrl?.trim() || '',
    videoUrl: post.videoUrl?.trim() || '',
    recurrence: post.recurrence || RECURRENCE.NONE,
    targetIds: post.targetIds || {},
    status: POST_STATUS.SCHEDULED,
    createdAt: new Date().toISOString(),
    results: {},
  };

  persist([...posts, newPost]);
  return newPost;
};

export const cancelPost = (postId) => {
  const updated = getScheduledPosts().map((post) => (
    post.id === postId && post.status === POST_STATUS.SCHEDULED
      ? { ...post, status: POST_STATUS.CANCELLED, cancelledAt: new Date().toISOString() }
      : post
  ));
  persist(updated);
  return updated;
};

export const deletePost = (postId) => {
  const posts = getScheduledPosts().filter((post) => post.id !== postId);
  persist(posts);
  return posts;
};

const failedResult = (error) => ({
  success: false,
  error: error instanceof Error ? error.message : String(error || 'Lỗi không xác định'),
});

const publishToPlatforms = async (post, credentials = {}) => {
  const results = {};

  for (const platform of post.platforms) {
    try {
      if (platform === 'facebook') {
        if (!credentials.facebook_token) throw new Error('Thiếu Facebook access token.');
        const api = new FacebookAPI(credentials.facebook_token);
        results.facebook = await api.publishPost(post.targetIds.facebook || 'me', post.content, {
          imageUrl: post.imageUrl || undefined,
        });
      } else if (platform === 'instagram') {
        if (!credentials.instagram_token) throw new Error('Thiếu Instagram access token.');
        if (!post.imageUrl) throw new Error('Instagram yêu cầu URL ảnh.');
        const api = new InstagramAPI(credentials.instagram_token);
        results.instagram = await api.publishPost(
          post.targetIds.instagram || 'me',
          post.imageUrl,
          post.content,
        );
      } else if (platform === 'tiktok') {
        if (!credentials.tiktok_token) throw new Error('Thiếu TikTok access token.');
        if (!post.videoUrl) throw new Error('TikTok yêu cầu URL video.');
        const api = new TikTokAPI(credentials.tiktok_token);
        results.tiktok = await api.publishVideo(post.videoUrl, post.content);
      } else {
        results[platform] = failedResult(`Nền tảng chưa được hỗ trợ: ${platform}`);
      }
    } catch (error) {
      results[platform] = failedResult(error);
    }
  }

  return results;
};

export const checkAndPublishDuePosts = async (credentials = {}) => {
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

    const publishingPost = { ...post, status: POST_STATUS.PUBLISHING };
    updatedPosts[index] = publishingPost;
    persist(updatedPosts);

    const results = await publishToPlatforms(publishingPost, credentials);
    const attempts = Object.values(results);
    const successCount = attempts.filter((result) => result?.success).length;
    const completedPost = {
      ...publishingPost,
      results,
      status: successCount === attempts.length && attempts.length > 0
        ? POST_STATUS.PUBLISHED
        : POST_STATUS.FAILED,
      publishedAt: new Date().toISOString(),
      successCount,
      failureCount: attempts.length - successCount,
    };

    updatedPosts[index] = completedPost;
    processed.push(completedPost);

    if (completedPost.recurrence !== RECURRENCE.NONE && successCount > 0) {
      recurringPosts.push({
        ...completedPost,
        id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        scheduledTime: nextRecurrence(completedPost.scheduledTime, completedPost.recurrence),
        status: POST_STATUS.SCHEDULED,
        createdAt: new Date().toISOString(),
        publishedAt: undefined,
        results: {},
        successCount: undefined,
        failureCount: undefined,
      });
    }
  }

  persist([...updatedPosts, ...recurringPosts]);
  return processed;
};
