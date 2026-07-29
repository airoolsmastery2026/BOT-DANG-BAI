/**
 * Content Generator - "Bot tự động viết bài"
 * Hỗ trợ 2 chế độ:
 *  1) Template mode (mặc định, không cần API key) - ghép câu theo mẫu + từ khóa
 *  2) AI mode (tuỳ chọn) - gọi API của bạn (OpenAI-compatible hoặc Anthropic)
 *     bằng chính API key do bạn nhập vào, không có key nào được nhúng sẵn.
 */

// ============= TEMPLATE-BASED GENERATOR =============

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

/**
 * Tinh chỉnh: topic, tone (neutral|urgent|friendly), length (short|medium|long),
 * emojiLevel (none|light|heavy), hashtags (array), cta (string tuỳ chỉnh override closer)
 */
export const generateTemplatePost = (topic, options = {}) => {
  const {
    tone = 'neutral',
    length = 'medium',
    emojiLevel = 'light',
    hashtags = [],
    cta = '',
  } = options;

  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  const closerPool = CLOSERS[tone] || CLOSERS.neutral;
  const closer = cta.trim() || closerPool[Math.floor(Math.random() * closerPool.length)];
  const emojis = EMOJI_SETS[emojiLevel] || [];

  const bodyByLength = {
    short: `${topic}.`,
    medium: `${topic}. Sản phẩm/dịch vụ được thiết kế riêng để đáp ứng nhu cầu của bạn, đảm bảo chất lượng và giá cả hợp lý.`,
    long: `${topic}. Sản phẩm/dịch vụ được thiết kế riêng để đáp ứng nhu cầu của bạn, đảm bảo chất lượng và giá cả hợp lý. Với đội ngũ giàu kinh nghiệm, chúng tôi cam kết mang lại trải nghiệm tốt nhất cho từng khách hàng, từ tư vấn đến hậu mãi.`,
  };

  const emojiLine = emojis.length ? emojis.join(' ') : '';
  const hashtagLine = hashtags.length ? hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ') : '';

  const parts = [
    `${opener} ${bodyByLength[length] || bodyByLength.medium}`,
    emojiLine,
    closer,
    hashtagLine,
  ].filter(Boolean);

  return parts.join('\n\n');
};

/**
 * Sinh nhiều biến thể để chọn (giúp bài đăng không bị lặp lại khi đăng thường xuyên)
 */
export const generatePostVariants = (topic, options = {}, count = 3) => {
  const variants = new Set();
  let attempts = 0;
  while (variants.size < count && attempts < count * 4) {
    variants.add(generateTemplatePost(topic, options));
    attempts += 1;
  }
  return Array.from(variants);
};

// ============= OPTIONAL AI-BACKED GENERATOR =============
// Người dùng tự nhập API key của họ (OpenAI hoặc Anthropic), không có key
// nào được nhúng sẵn trong ứng dụng. Nếu không cấu hình, hệ thống tự dùng
// template mode ở trên.

export class AIContentGenerator {
  /**
   * @param {Object} config
   * @param {'openai'|'anthropic'} config.provider
   * @param {string} config.apiKey - API key của chính người dùng
   * @param {string} [config.model]
   */
  constructor(config) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.model = config.model || (config.provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-mini');
  }

  buildPrompt(topic, options = {}) {
    const { tone = 'neutral', length = 'medium', hashtagCount = 3 } = options;
    return `Viết một bài đăng mạng xã hội bằng tiếng Việt về chủ đề: "${topic}".
Giọng văn: ${tone}. Độ dài: ${length}.
Kèm ${hashtagCount} hashtag liên quan ở cuối bài.
Chỉ trả về nội dung bài đăng, không thêm giải thích.`;
  }

  async generate(topic, options = {}) {
    if (!this.apiKey) {
      throw new Error('Chưa cấu hình API key cho AI mode');
    }

    const prompt = this.buildPrompt(topic, options);

    if (this.provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.content?.map(b => b.text).filter(Boolean).join('\n') || '';
    }

    // Default: OpenAI-compatible
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || '';
  }
}

/**
 * Điểm vào chung: dùng AI mode nếu có cấu hình, ngược lại fallback template.
 */
export const generatePost = async (topic, options = {}, aiConfig = null) => {
  if (aiConfig && aiConfig.apiKey) {
    try {
      const generator = new AIContentGenerator(aiConfig);
      const text = await generator.generate(topic, options);
      if (text && text.trim()) return text.trim();
    } catch (error) {
      console.warn('AI generation failed, falling back to template:', error.message);
    }
  }
  return generateTemplatePost(topic, options);
};
