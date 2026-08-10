import { isAIContentServerConfigured, requestAIContent } from './ai_content_client';

const OPENERS = [
  '🔥 Tin vui cho ai đang tìm',
  '✨ Đừng bỏ lỡ',
  '📢 Thông báo:',
  '👋 Gửi đến quý khách hàng thân thiết,',
  '🎯 Hôm nay chúng tôi muốn chia sẻ về',
];

const CLOSERS = {
  neutral: [
    'Liên hệ ngay để được tư vấn chi tiết.',
    'Inbox để biết thêm thông tin nhé!',
    'Đặt hàng ngay hôm nay.',
  ],
  urgent: [
    '⏰ Số lượng có hạn, nhanh tay đặt ngay!',
    '🔥 Ưu đãi chỉ áp dụng trong hôm nay!',
    '⚡ Liên hệ ngay trước khi hết hàng!',
  ],
  friendly: [
    'Rất mong được đồng hành cùng bạn 💛',
    'Cảm ơn bạn đã luôn ủng hộ chúng tôi 🙏',
    'Hẹn gặp lại bạn ở bài viết sau nhé!',
  ],
};

const EMOJI_SETS = {
  none: [],
  light: ['✅', '👍', '📌'],
  heavy: ['🔥', '✨', '🎉', '💯', '👉', '⭐'],
};

export const generateTemplatePost = (topic, options = {}) => {
  const {
    tone = 'neutral',
    length = 'medium',
    emojiLevel = 'light',
    hashtags = [],
    cta = '',
  } = options;

  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) throw new Error('Chủ đề không được để trống.');

  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  const closerPool = CLOSERS[tone] || CLOSERS.neutral;
  const closer = String(cta || '').trim() || closerPool[Math.floor(Math.random() * closerPool.length)];
  const emojis = EMOJI_SETS[emojiLevel] || [];

  const bodyByLength = {
    short: `${normalizedTopic}.`,
    medium: `${normalizedTopic}. Sản phẩm/dịch vụ được thiết kế để đáp ứng nhu cầu thực tế, ưu tiên tính rõ ràng, phù hợp và dễ trao đổi trước khi triển khai.`,
    long: `${normalizedTopic}. Sản phẩm/dịch vụ được thiết kế để đáp ứng nhu cầu thực tế, ưu tiên tính rõ ràng, phù hợp và dễ trao đổi trước khi triển khai. Mỗi yêu cầu nên được xem xét theo kích thước, vật liệu, ngân sách và điều kiện sử dụng cụ thể để có phương án phù hợp.`,
  };

  const emojiLine = emojis.length ? emojis.join(' ') : '';
  const hashtagLine = Array.isArray(hashtags) && hashtags.length
    ? hashtags.map((tag) => String(tag || '').trim()).filter(Boolean).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
    : '';

  return [
    `${opener} ${bodyByLength[length] || bodyByLength.medium}`,
    emojiLine,
    closer,
    hashtagLine,
  ].filter(Boolean).join('\n\n');
};

export const generatePostVariants = (topic, options = {}, count = 3) => {
  const safeCount = Math.min(Math.max(Number(count) || 1, 1), 10);
  const variants = new Set();
  let attempts = 0;
  while (variants.size < safeCount && attempts < safeCount * 6) {
    variants.add(generateTemplatePost(topic, options));
    attempts += 1;
  }
  return Array.from(variants);
};

const toAIRequest = (topic, options = {}) => ({
  topic: String(topic || '').trim(),
  tone: options.tone || 'neutral',
  length: options.length || 'medium',
  hashtags: Array.isArray(options.hashtags) ? options.hashtags : [],
  hashtagCount: Number(options.hashtagCount || 3),
  cta: String(options.cta || '').trim(),
});

export const generatePostWithAI = async (topic, options = {}) => {
  if (!isAIContentServerConfigured()) {
    throw new Error('AI Content Server chưa cấu hình. Hãy chạy gateway AI server-side trước.');
  }
  const result = await requestAIContent(toAIRequest(topic, options));
  return result.text;
};

export const generatePost = async (topic, options = {}) => {
  if (isAIContentServerConfigured()) {
    try {
      return await generatePostWithAI(topic, options);
    } catch (error) {
      console.warn('AI Content Server unavailable, falling back to template:', error?.message || error);
    }
  }
  return generateTemplatePost(topic, options);
};
