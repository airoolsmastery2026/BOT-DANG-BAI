/**
 * Post Manager - quản lý hàng đợi bài đăng, lên lịch, và tự động đăng.
 *
 * LƯU Ý QUAN TRỌNG: đây là scheduler chạy phía trình duyệt (client-side).
 * Nó chỉ kiểm tra và đăng bài khi tab web đang mở. Nếu bạn cần đăng bài
 * đúng giờ kể cả khi không mở trình duyệt, hãy dùng server/scheduler-example.js
 * làm nền tảng để chạy trên một server/cron thật.
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

export const getScheduledPosts = () => getFromLocalStorage(STORAGE_KEY, []);

const persist = (posts) => saveToLocalStorage(STORAGE_KEY, posts);

/**
 * Thêm bài đăng vào hàng đợi.
 * @param {Object} post
 * @param {string} post.content
 * @param {string[]} post.platforms - ['facebook','instagram','tiktok']
 * @param {string} post.scheduledTime - ISO string; nếu là quá khứ/hiện tại => đăng ngay ở lần check tới
 * @param {string} [post.imageUrl]
 * @param {string} [post.videoUrl]
 * @param {'none'|'daily'|'weekly'} [post.recurrence]
 * @param {Object} [post.targetIds] - { facebook: pageId, instagram: igUserId }
 */
export const schedulePost = (post) => {
  const posts = getScheduledPosts();
  const newPost = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: post.content,
    platforms: post.platforms || [],
    scheduledTime: post.scheduledTime,
    imageUrl: post.imageUrl || '',
    videoUrl: post.videoUrl || '',
    recurrence: post.recurrence || RECURRENCE.NONE,
    targetIds: post.targetIds || {},
    status: POST_STATUS.SCHEDULED,
    createdAt: new Date().toISOString(),
    results: {},
  };
  posts.push(newPost);
  persist(posts);
  return newPost;
};

export const cancelPost = (postId) => {
  const posts = getScheduledPosts();
  const updated = posts.map(p => (p.id === postId && p.status === POST_STATUS.SCHEDULED
    ? { ...p, status: POST_STATUS.CANCELLED }
    : p));
  persist(updated);
  return updated;
};

export const deletePost = (postId) => {
  const posts = getScheduledPosts().filter(p => p.id !== postId);
  persist(posts);
  return posts;
};

/**
 * Đăng một bài lên tất cả nền tảng được chọn cho nó, dùng token đã cung cấp.
 */
const publishToPlatforms = async (post, credentials) => {
  const results = {};

  if (post.platforms.includes('facebook') && credentials.facebook_token) {
    const fb = new FacebookAPI(credentials.facebook_token);
    const pageId = post.targetIds.facebook || 'me';
    results.facebook = await fb.publishPost(pageId, post.content, {
      imageUrl: post.imageUrl || undefined,
    });
  }

  if (post.platforms.includes('instagram') && credentials.instagram_token) {
    const ig = new InstagramAPI(credentials.instagram_token);
    const igUserId = post.targetIds.instagram || 'me';
    results.instagram = await ig.publishPost(igUserId, post.imageUrl, post.content);
  }

  if (post.platforms.includes('tiktok') && credentials.tiktok_token) {
    const tt = new TikTokAPI(credentials.tiktok_token);
    results.tiktok = await tt.publishVideo(post.videoUrl, post.content);
  }

  return results;
};

/**
 * Kiểm tra hàng đợi, đăng các bài đã đến giờ. Gọi định kỳ (vd. mỗi 60s)
 * từ component với setInterval.
 * @param {Object} credentials - { facebook_token, instagram_token, tiktok_token }
 * @returns {Promise<Array>} danh sách bài vừa được xử lý
 */
export const checkAndPublishDuePosts = async (credentials) => {
  const posts = getScheduledPosts();
  const now = new Date();
  const processed = [];

  for (const post of posts) {
    if (post.status !== POST_STATUS.SCHEDULED) continue;
    if (new Date(post.scheduledTime) > now) continue;

    const results = await publishToPlatforms(post, credentials);
    const attempts = Object.values(results);
    const allOk = attempts.length > 0 && attempts.every(r => r?.success);
    const anyOk = attempts.some(r => r?.success);

    if (attempts.length === 0) {
      results.system = {
        success: false,
        error: 'Không có token hợp lệ cho các nền tảng đã chọn.',
      };
    }

    post.results = results;
    post.status = allOk || anyOk ? POST_STATUS.PUBLISHED : POST_STATUS.FAILED;
    post.publishedAt = new Date().toISOString();
    processed.push(post);

    // Nếu là bài lặp lại và đã đăng thành công ít nhất 1 nền tảng, tạo bản sao cho lần kế tiếp
    if (post.recurrence !== RECURRENCE.NONE && anyOk) {
      const clone = schedulePost({
        ...post,
        scheduledTime: nextRecurrence(post.scheduledTime, post.recurrence),
      });
      processed.push(clone);
    }
  }

  persist(getScheduledPosts().map(p => {
    const updated = processed.find(pp => pp.id === p.id);
    return updated || p;
  }));

  return processed;
};
