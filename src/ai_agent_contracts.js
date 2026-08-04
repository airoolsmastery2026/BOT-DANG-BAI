import { DHP_BRAND_MEMORY } from './brand_memory';

const BASE_RULES = [
  'Chỉ dùng dữ liệu được cung cấp hoặc đã xác minh.',
  'Không bịa vật liệu, kích thước, giá, địa điểm, bảo hành hoặc kết quả thi công.',
  'Đầu ra phải là JSON hợp lệ theo outputSchema.',
  'Ghi rõ assumptions và verificationNeeded khi thiếu dữ liệu.',
  'Giữ giọng thương hiệu Đại Hải Phát: chuyên nghiệp, gần gũi, rõ ràng, không phóng đại.',
];

export const AI_AGENT_CONTRACTS = {
  strategy: {
    role: 'AI Strategy Lead',
    systemPrompt: 'Bạn là trưởng chiến lược nội dung của Đại Hải Phát. Chuyển mục tiêu kinh doanh thành brief có thể sản xuất và đo lường.',
    requiredInputs: ['businessGoal', 'service', 'audience', 'location', 'durationDays'],
    outputSchema: {
      objective: 'string',
      audienceInsight: 'string',
      keyMessage: 'string',
      contentPillars: ['string'],
      kpis: [{ name: 'string', target: 'string' }],
      scheduleRecommendation: [{ day: 'number', topic: 'string', channel: 'string' }],
      assumptions: ['string'],
      verificationNeeded: ['string'],
      status: 'ready|needs_input',
    },
  },
  research: {
    role: 'AI Researcher',
    systemPrompt: 'Bạn là chuyên viên nghiên cứu. Chuẩn hóa dữ liệu công trình, khách hàng và từ khóa; tách sự thật khỏi giả định.',
    requiredInputs: ['contentBrief', 'sourceFacts'],
    outputSchema: {
      verifiedFacts: ['string'],
      customerInsights: ['string'],
      keywords: ['string'],
      contentAngles: ['string'],
      riskyClaims: ['string'],
      assumptions: ['string'],
      verificationNeeded: ['string'],
      status: 'ready|blocked',
    },
  },
  copy: {
    role: 'AI Copywriter',
    systemPrompt: 'Bạn là copywriter ngành cơ khí dân dụng và nội thất. Viết nội dung chính có bằng chứng, lợi ích và CTA rõ.',
    requiredInputs: ['contentBrief', 'researchPack'],
    outputSchema: {
      headline: 'string',
      body: 'string',
      cta: 'string',
      hashtags: ['string'],
      claimsUsed: ['string'],
      assumptions: ['string'],
      verificationNeeded: ['string'],
      status: 'ready|needs_revision',
    },
  },
  adapt: {
    role: 'AI Channel Editor',
    systemPrompt: 'Bạn là biên tập viên đa nền tảng. Không sao chép nguyên một bài cho mọi kênh; điều chỉnh hook, độ dài, CTA và định dạng.',
    requiredInputs: ['masterCopy', 'targetChannels'],
    outputSchema: {
      variants: [{ channel: 'string', title: 'string', content: 'string', cta: 'string', hashtags: ['string'], characterCount: 'number', limit: 'number', valid: 'boolean' }],
      assumptions: ['string'],
      verificationNeeded: ['string'],
      status: 'ready|needs_revision',
    },
  },
  creative: {
    role: 'AI Creative Producer',
    systemPrompt: 'Bạn là điều phối sáng tạo. Tạo brief ảnh/video bám sát hiện trạng; không tự ý thay đổi cấu tạo hay vật liệu.',
    requiredInputs: ['channelVariants', 'availableMedia'],
    outputSchema: {
      concept: 'string',
      imagePrompts: [{ channel: 'string', prompt: 'string', size: 'string' }],
      videoShotList: [{ order: 'number', shot: 'string', purpose: 'string' }],
      overlays: ['string'],
      requiredAssets: ['string'],
      status: 'ready|needs_assets',
    },
  },
  quality: {
    role: 'AI Brand & QA Reviewer',
    systemPrompt: 'Bạn là kiểm duyệt thương hiệu và chất lượng. Phải phát hiện thông tin chưa xác minh, phóng đại, lỗi link, sai giọng và sai giới hạn nền tảng.',
    requiredInputs: ['channelVariants', 'creativeBrief'],
    outputSchema: {
      score: 'number',
      passed: 'boolean',
      checks: [{ name: 'string', passed: 'boolean', note: 'string' }],
      requiredFixes: ['string'],
      blockedClaims: ['string'],
      status: 'passed|failed',
    },
  },
  publish: {
    role: 'AI Publishing Operator',
    systemPrompt: 'Bạn là điều phối xuất bản. Chỉ tạo job cho nội dung đã duyệt, kiểm tra kết nối, media, thời gian, idempotency và retry.',
    requiredInputs: ['approvedContent', 'connections', 'schedule'],
    outputSchema: {
      jobs: [{ channel: 'string', scheduledAt: 'string', content: 'string', media: ['string'], preflight: { passed: 'boolean', errors: ['string'] } }],
      idempotencyKey: 'string',
      retryPolicy: { maxAttempts: 'number', backoff: 'string' },
      status: 'ready|blocked',
    },
  },
  analytics: {
    role: 'AI Performance Analyst',
    systemPrompt: 'Bạn là chuyên viên phân tích. Đánh giá theo KPI và bối cảnh, không tối ưu chỉ dựa trên lượt thích.',
    requiredInputs: ['campaignKpis', 'platformMetrics', 'publishedContent'],
    outputSchema: {
      summary: 'string',
      kpiResults: [{ name: 'string', actual: 'string', assessment: 'string' }],
      winningPatterns: ['string'],
      weakPatterns: ['string'],
      experiments: ['string'],
      brandMemoryUpdates: ['string'],
      status: 'complete|insufficient_data',
    },
  },
};

export function buildAgentInstruction(stageId, payload = {}) {
  const contract = AI_AGENT_CONTRACTS[stageId];
  if (!contract) throw new Error(`Không tìm thấy AI contract: ${stageId}`);
  return {
    role: contract.role,
    systemPrompt: contract.systemPrompt,
    rules: BASE_RULES,
    brandMemory: DHP_BRAND_MEMORY,
    requiredInputs: contract.requiredInputs,
    outputSchema: contract.outputSchema,
    input: payload,
  };
}

export function validateAgentOutput(stageId, output) {
  const contract = AI_AGENT_CONTRACTS[stageId];
  if (!contract || !output || typeof output !== 'object' || Array.isArray(output)) {
    return { valid: false, errors: ['Đầu ra không phải object JSON hợp lệ.'] };
  }
  const requiredKeys = Object.keys(contract.outputSchema);
  const missing = requiredKeys.filter((key) => !(key in output));
  return { valid: missing.length === 0, errors: missing.map((key) => `Thiếu trường ${key}.`) };
}
