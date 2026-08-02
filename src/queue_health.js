import { POST_STATUS, getScheduledPosts } from './post_manager';

const REQUIRED_TOKEN = {
  facebook: 'facebook_token',
  instagram: 'instagram_token',
  tiktok: 'tiktok_token',
};

const issue = (code, severity, message, post = null, platform = null) => ({
  code,
  severity,
  message,
  postId: post?.id || null,
  campaignId: post?.campaignId || null,
  platform,
});

const summarizeResults = (post) => {
  const platformSet = new Set(Array.isArray(post?.platforms) ? post.platforms : []);
  const entries = Object.entries(post?.results || {})
    .filter(([platform]) => platformSet.has(platform));

  return entries.reduce((summary, [platform, result]) => {
    if (result?.success === true) summary.success.push(platform);
    if (result?.success === false) summary.failed.push(platform);
    return summary;
  }, { success: [], failed: [] });
};

export const inspectQueueHealth = ({
  posts = getScheduledPosts(),
  credentials = {},
  now = Date.now(),
  stuckAfterMs = 10 * 60_000,
  overdueAfterMs = 5 * 60_000,
} = {}) => {
  const issues = [];
  const idempotencyKeys = new Map();

  posts.forEach((post) => {
    const scheduledAt = new Date(post.scheduledTime).getTime();
    const updatedAt = new Date(post.updatedAt || post.scheduledTime).getTime();
    const resultSummary = summarizeResults(post);

    if (post.idempotencyKey) {
      const previous = idempotencyKeys.get(post.idempotencyKey);
      if (previous) {
        issues.push(issue(
          'duplicate_idempotency_key',
          'error',
          `Trùng khóa chống đăng lặp với tác vụ ${previous.id}.`,
          post,
        ));
      } else {
        idempotencyKeys.set(post.idempotencyKey, post);
      }
    }

    if (post.status === POST_STATUS.SCHEDULED && Number.isFinite(scheduledAt)) {
      if (now - scheduledAt >= overdueAfterMs) {
        issues.push(issue('overdue', 'warning', 'Tác vụ đã quá thời gian dự kiến nhưng chưa được xử lý.', post));
      }

      if (resultSummary.success.length > 0) {
        issues.push(issue(
          'scheduled_with_successful_results',
          'error',
          `Tác vụ đang chờ nhưng đã có nền tảng đăng thành công (${resultSummary.success.join(', ')}). Không được đăng lại toàn bộ nền tảng.`,
          post,
        ));
      }

      post.platforms.forEach((platform) => {
        const tokenKey = REQUIRED_TOKEN[platform];
        if (tokenKey && !String(credentials[tokenKey] || '').trim()) {
          issues.push(issue('missing_token', 'error', `Thiếu token ${platform}.`, post, platform));
        }
        if (platform === 'instagram' && !post.imageUrl) {
          issues.push(issue('missing_image', 'error', 'Instagram yêu cầu URL ảnh.', post, platform));
        }
        if (platform === 'tiktok' && !post.videoUrl) {
          issues.push(issue('missing_video', 'error', 'TikTok yêu cầu URL video.', post, platform));
        }
      });
    }

    if (
      post.status === POST_STATUS.PUBLISHING
      && Number.isFinite(updatedAt)
      && now - updatedAt >= stuckAfterMs
    ) {
      issues.push(issue('stuck_publishing', 'error', 'Tác vụ đang đăng đã vượt quá thời gian cho phép.', post));
    }

    if (post.status === POST_STATUS.FAILED) {
      if (Number(post.attemptCount || 0) >= 3) {
        issues.push(issue('repeated_failure', 'warning', 'Tác vụ đã thất bại từ 3 lần trở lên.', post));
      }

      if (resultSummary.success.length > 0 && resultSummary.failed.length > 0) {
        issues.push(issue(
          'partial_publish_requires_selective_retry',
          'error',
          `Đăng một phần: thành công ${resultSummary.success.join(', ')}; thất bại ${resultSummary.failed.join(', ')}. Chỉ được thử lại nền tảng thất bại.`,
          post,
        ));
      }
    }

    Object.keys(post.results || {}).forEach((platform) => {
      if (platform !== 'system' && !post.platforms.includes(platform)) {
        issues.push(issue(
          'orphaned_platform_result',
          'warning',
          `Kết quả của ${platform} không thuộc danh sách nền tảng của tác vụ.`,
          post,
          platform,
        ));
      }
    });
  });

  const summary = issues.reduce((acc, item) => {
    acc.total += 1;
    acc[item.severity] += 1;
    acc.byCode[item.code] = (acc.byCode[item.code] || 0) + 1;
    return acc;
  }, { total: 0, error: 0, warning: 0, info: 0, byCode: {} });

  return {
    healthy: summary.error === 0,
    summary,
    issues,
    checkedAt: new Date(now).toISOString(),
  };
};
