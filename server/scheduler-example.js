/**
 * VÍ DỤ backend scheduler chạy nền (không phụ thuộc trình duyệt).
 *
 * Bộ lên lịch trong src/post_manager.js chỉ chạy khi tab web đang mở.
 * Nếu bạn cần đăng bài đúng giờ ngay cả khi không mở trình duyệt, hãy
 * deploy file này lên một server Node luôn chạy (VPS, Render, Railway...).
 *
 * Đây CHỈ LÀ VÍ DỤ MINH HỌA — bạn cần:
 *   npm install node-cron dotenv
 * và thay phần đọc "hàng đợi bài đăng" bằng một database thật
 * (Postgres/MongoDB/Redis...) thay vì localStorage của trình duyệt,
 * vì server không có quyền truy cập localStorage.
 *
 * Chạy: node server/scheduler-example.js
 */

require('dotenv').config();
const cron = require('node-cron');

// TODO: thay bằng driver DB thật. Đây chỉ là mảng in-memory để minh họa cấu trúc dữ liệu.
let scheduledPosts = [
  // {
  //   id: 'post_123',
  //   content: 'Nội dung bài đăng...',
  //   platforms: ['facebook'],
  //   scheduledTime: '2026-08-01T09:00:00.000Z',
  //   targetIds: { facebook: 'YOUR_PAGE_ID' },
  //   status: 'scheduled',
  // },
];

async function publishToFacebook(pageId, message, accessToken) {
  const params = new URLSearchParams({ access_token: accessToken, message });
  const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
    method: 'POST',
    body: params,
  });
  return res.json();
}

async function checkAndPublish() {
  const now = new Date();
  for (const post of scheduledPosts) {
    if (post.status !== 'scheduled') continue;
    if (new Date(post.scheduledTime) > now) continue;

    console.log(`Đang đăng bài ${post.id}...`);

    try {
      if (post.platforms.includes('facebook')) {
        const result = await publishToFacebook(
          post.targetIds.facebook,
          post.content,
          process.env.FACEBOOK_TOKEN
        );
        console.log('Kết quả Facebook:', result);
      }
      // Tương tự cho Instagram / TikTok — xem src/api_handler.js để tham khảo logic.

      post.status = 'published';
    } catch (error) {
      console.error(`Lỗi khi đăng bài ${post.id}:`, error);
      post.status = 'failed';
    }
  }
}

// Kiểm tra mỗi phút
cron.schedule('* * * * *', () => {
  checkAndPublish();
});

console.log('Scheduler đang chạy nền, kiểm tra hàng đợi mỗi phút...');
