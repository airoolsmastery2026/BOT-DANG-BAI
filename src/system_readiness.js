import { getConnectedPlatforms } from './platform_credentials';
import { getScheduledPosts } from './post_manager';
import { inspectPublisherPreflight } from './publisher_preflight';
import { inspectQueueHealth } from './queue_health';

const createBlocker = (code, message, details = null) => ({ code, message, details });

export function inspectSystemReadiness({
  credentials = {},
  posts = getScheduledPosts(),
  now = Date.now(),
} = {}) {
  const connected = getConnectedPlatforms(credentials);
  const connectedPlatforms = Object.entries(connected)
    .filter(([, value]) => value)
    .map(([platform]) => platform);
  const health = inspectQueueHealth({ posts, credentials, now });
  const preflight = inspectPublisherPreflight({ posts, credentials, now });
  const blockers = [];

  if (connectedPlatforms.length === 0) {
    blockers.push(createBlocker(
      'no_connected_account',
      'Chưa có tài khoản mạng xã hội nào đủ cấu hình để đăng LIVE.',
    ));
  }

  if (health.summary.error > 0) {
    blockers.push(createBlocker(
      'queue_health_errors',
      `Hàng đợi còn ${health.summary.error} lỗi cần xử lý.`,
      health.summary.byCode,
    ));
  }

  if (preflight.blockedCount > 0) {
    blockers.push(createBlocker(
      'publisher_preflight_blocked',
      `${preflight.blockedCount} bài đến hạn chưa đủ điều kiện đăng LIVE.`,
      preflight.issues.map((issue) => issue.code),
    ));
  }

  return {
    readyForLive: blockers.length === 0,
    connected,
    connectedPlatforms,
    connectedCount: connectedPlatforms.length,
    queueHealth: health,
    preflight,
    blockers,
    checkedAt: new Date(now).toISOString(),
  };
}
