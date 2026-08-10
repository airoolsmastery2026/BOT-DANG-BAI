'use strict';

const ALLOWED_TONES = new Set(['neutral', 'urgent', 'friendly']);
const ALLOWED_LENGTHS = new Set(['short', 'medium', 'long']);
const MAX_TOPIC_LENGTH = 500;
const MAX_CTA_LENGTH = 500;
const MAX_HASHTAGS = 12;

const asString = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const normalizeHashtags = (value) => {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw
    .map((item) => asString(item, 80).replace(/^#+/, ''))
    .filter(Boolean))]
    .slice(0, MAX_HASHTAGS);
};

const normalizeGenerateRequest = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Payload AI không hợp lệ.');
  }

  const topic = asString(body.topic, MAX_TOPIC_LENGTH);
  if (!topic) throw new Error('Chủ đề không được để trống.');

  const tone = ALLOWED_TONES.has(body.tone) ? body.tone : 'neutral';
  const length = ALLOWED_LENGTHS.has(body.length) ? body.length : 'medium';
  const hashtags = normalizeHashtags(body.hashtags);
  const hashtagCount = Math.min(Math.max(Number(body.hashtagCount || hashtags.length || 3), 0), 12);
  const cta = asString(body.cta, MAX_CTA_LENGTH);

  return { topic, tone, length, hashtags, hashtagCount, cta };
};

const buildContentPrompt = ({ topic, tone, length, hashtags, hashtagCount, cta }) => {
  const lengthGuide = {
    short: 'ngắn gọn, khoảng 60-100 từ',
    medium: 'vừa phải, khoảng 120-180 từ',
    long: 'chi tiết, khoảng 220-320 từ',
  }[length] || 'vừa phải';

  const toneGuide = {
    neutral: 'chuyên nghiệp, rõ ràng và đáng tin cậy',
    urgent: 'thúc đẩy hành động nhưng không giật gân hoặc gây áp lực quá mức',
    friendly: 'thân thiện, tự nhiên và dễ hiểu',
  }[tone] || 'chuyên nghiệp';

  const lines = [
    'Bạn là trợ lý nội dung mạng xã hội cho một doanh nghiệp Việt Nam.',
    `Viết 1 bài đăng bằng tiếng Việt về: ${topic}`,
    `Giọng văn: ${toneGuide}.`,
    `Độ dài: ${lengthGuide}.`,
    'Cấu trúc: hook ngắn, nội dung chính có giá trị thực tế, CTA rõ ràng, hashtag ở cuối.',
    'Không bịa đặt giá, chứng nhận, số liệu, dự án hoặc cam kết mà đầu vào không cung cấp.',
    'Không thêm phần giải thích ngoài bài đăng.',
  ];

  if (cta) lines.push(`CTA mong muốn: ${cta}`);
  if (hashtags.length) lines.push(`Ưu tiên các hashtag sau: ${hashtags.map((tag) => `#${tag}`).join(' ')}`);
  else lines.push(`Tạo tối đa ${hashtagCount} hashtag liên quan.`);

  return lines.join('\n');
};

const extractGeminiText = (payload) => {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = candidates[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part) => String(part?.text || '')).filter(Boolean).join('\n').trim()
    : '';
  if (!text) throw new Error('Gemini không trả về nội dung văn bản.');
  return text;
};

module.exports = {
  buildContentPrompt,
  extractGeminiText,
  normalizeGenerateRequest,
};
