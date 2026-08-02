import { POST_STATUS, getPendingPlatforms, getScheduledPosts } from './post_manager';

const TOKEN_KEY = {
  facebook: 'facebook_token',
  instagram: 'instagram_token',
  tiktok: 'tiktok_token',
};

const createIssue = (post, platform, code, message) => ({
  postId: post.id,
  campaignId: post.campaignId || null,
  platform,
  code,
  message,
});

export const validatePostForPublishing = (post, credentials = {}) => {
  const issues = [];
  const pendingPlatforms = getPendingPlatforms(post);

  if (!post || typeof post !== 'object') {
    return { ready: false, pendingPlatforms: [], issues: [{ code: 'invalid_post', message: 'Tác vụ không hợp lệ.' }] };
  }

  if (post.status !== POST_STATUS.SCHEDULED) {
    issues.push(createIssue(post, null, 'invalid_status', 'Chỉ tác vụ đã lên lịch mới được phép xuất bản.'));
  }

  if (!String(post.content || '').trim()) {
    issues.push(createIssue(post, null, 'missing_content', 'Tác vụ chưa có nội dung.'));
  }

  if (!pendingPlatforms.length) {
    issues.push(createIssue(post, null, 'nothing_to_publish', 'Tất cả nền tảng của tác vụ đã hoàn tất.'));
  }

  pendingPlatforms.forEach((platform) => {
    const tokenKey = TOKEN_KEY[platform];
    if (!tokenKey || !String(credentials[tokenKey] || '').trim()) {
      issues.push(createIssue(post, platform, 'missing_token', `Thiếu token ${platform}.`));
    }

    if (platform === 'instagram' && !String(post.imageUrl || '').trim()) {
      issues.push(createIssue(post, platform, 'missing_image', 'Instagram yêu cầu URL ảnh công khai.'));
    }

    if (platform === 'tiktok' && !String(post.videoUrl || '').trim()) {
      issues.push(createIssue(post, platform, 'missing_video', 'TikTok yêu cầu URL video công khai.'));
    }

    const targetId = post.targetIds?.[platform];
    if (platform !== 'tiktok' && targetId !== undefined && !String(targetId || '').trim()) {
      issues.push(createIssue(post, platform, 'invalid_target', `Target ID ${platform} không hợp lệ.`));
    }
  });

  return {
    ready: issues.length === 0,
    pendingPlatforms,
    issues,
  };
};

export const inspectPublisherPreflight = ({
  posts = getScheduledPosts(),
  credentials = {},
  now = Date.now(),
} = {}) => {
  const duePosts = posts.filter((post) => (
    post.status === POST_STATUS.SCHEDULED
    && new Date(post.scheduledTime).getTime() <= now
  ));

  const results = duePosts.map((post) => ({
    post,
    ...validatePostForPublishing(post, credentials),
  }));

  const runnable = results.filter((result) => result.ready);
  const blocked = results.filter((result) => !result.ready);

  return {
    dueCount: duePosts.length,
    runnableCount: runnable.length,
    blockedCount: blocked.length,
    runnablePostIds: runnable.map((result) => result.post.id),
    issues: blocked.flatMap((result) => result.issues),
  };
};
