const skills = [
  {
    id: 'master-strategy-architect', stageId: 'strategy', name: 'Master Strategy Architect', version: '1.0.0',
    summary: 'Biến mục tiêu kinh doanh thành brief, trụ cột, KPI và lịch có thể kiểm chứng.',
    qualityGates: ['Mục tiêu đo lường được', 'Audience insight gắn dữ liệu', 'KPI và lịch không mâu thuẫn'],
  },
  {
    id: 'master-evidence-researcher', stageId: 'research', name: 'Master Evidence Researcher', version: '1.0.0',
    summary: 'Tách sự thật, giả định và claim rủi ro trước khi viết nội dung.',
    qualityGates: ['Nguồn thật tách khỏi giả định', 'Claim rủi ro được chặn', 'Thiếu dữ liệu được nêu rõ'],
  },
  {
    id: 'master-conversion-copywriter', stageId: 'copy', name: 'Master Conversion Copywriter', version: '1.0.0',
    summary: 'Viết nội dung ngành cơ khí/nội thất rõ lợi ích, có bằng chứng và CTA.',
    qualityGates: ['Hook đúng nhu cầu', 'Không bịa thông số', 'CTA cụ thể nhưng không ép buộc'],
  },
  {
    id: 'master-channel-adapter', stageId: 'adapt', name: 'Master Channel Adapter', version: '1.0.0',
    summary: 'Chuyển thể độc lập cho từng nền tảng theo hành vi, độ dài và media.',
    qualityGates: ['Không sao chép một bài cho mọi kênh', 'Giới hạn ký tự hợp lệ', 'CTA phù hợp từng kênh'],
  },
  {
    id: 'master-creative-director', stageId: 'creative', name: 'Master Creative Director', version: '1.0.0',
    summary: 'Tạo brief ảnh/video giữ nguyên cấu tạo, vật liệu và hiện trạng công trình.',
    qualityGates: ['Có asset requirement', 'Đúng tỉ lệ nền tảng', 'Không thay đổi hiện trạng thật'],
  },
  {
    id: 'master-brand-risk-auditor', stageId: 'quality', name: 'Master Brand & Risk Auditor', version: '1.0.0',
    summary: 'Chấm điểm thương hiệu, claim, link, CTA, định dạng và rủi ro xuất bản.',
    qualityGates: ['Điểm tối thiểu 80', 'Mọi lỗi blocking được liệt kê', 'Chỉ passed khi không còn claim cấm'],
  },
  {
    id: 'master-publishing-operator', stageId: 'publish', name: 'Master Publishing Operator', version: '1.0.0',
    summary: 'Tạo job idempotent chỉ cho nội dung duyệt và tài khoản đã xác minh.',
    qualityGates: ['Human approval bắt buộc', 'Media preflight đạt', 'Retry và dead-letter rõ ràng'],
  },
  {
    id: 'master-performance-coach', stageId: 'analytics', name: 'Master Performance Coach', version: '1.0.0',
    summary: 'Đánh giá theo KPI và đề xuất học lại có kiểm soát, không chạy theo vanity metrics.',
    qualityGates: ['Kết luận gắn KPI', 'Tách pattern thắng/yếu', 'Cập nhật memory chỉ là đề xuất'],
  },
];

export const MASTER_SKILLS = Object.freeze(skills.map((skill) => Object.freeze({ ...skill })));

export const getMasterSkillForStage = (stageId) => MASTER_SKILLS.find((skill) => skill.stageId === stageId) || null;

const isMeaningful = (value) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return true;
  return value !== null && typeof value === 'object' ? Object.keys(value).length > 0 : value !== undefined;
};

const collectText = (value) => {
  try { return JSON.stringify(value).toLowerCase(); } catch { return ''; }
};

const CLAIM_PATTERNS = [
  { pattern: /\b100%\b/, label: 'claim tuyệt đối 100%' },
  { pattern: /\bsố 1\b|\bnumber one\b/, label: 'claim số 1' },
  { pattern: /rẻ nhất|tốt nhất|bảo hành trọn đời/, label: 'claim so sánh/bảo hành chưa có bằng chứng' },
];

export function evaluateMasterSkillOutput(stageId, output, requiredKeys = []) {
  const masterSkill = getMasterSkillForStage(stageId);
  if (!masterSkill || !output || typeof output !== 'object' || Array.isArray(output)) {
    return { valid: false, score: 0, errors: ['Đầu ra không phải object JSON hợp lệ.'], warnings: [], checks: [] };
  }

  const errors = [];
  const warnings = [];
  const checks = requiredKeys.map((key) => {
    const passed = Object.prototype.hasOwnProperty.call(output, key) && isMeaningful(output[key]);
    if (!passed) errors.push(`Thiếu hoặc rỗng trường ${key}.`);
    return { name: `required:${key}`, passed };
  });

  const text = collectText(output);
  CLAIM_PATTERNS.forEach(({ pattern, label }) => {
    if (pattern.test(text)) warnings.push(`Phát hiện ${label}; cần bằng chứng hoặc loại bỏ trước khi duyệt.`);
  });

  if (stageId === 'adapt' && Array.isArray(output.variants)) {
    const channels = output.variants.map((variant) => String(variant?.channel || '').trim()).filter(Boolean);
    if (new Set(channels).size !== channels.length) errors.push('Channel variants bị trùng nền tảng.');
    if (output.variants.some((variant) => !variant?.content || variant?.valid !== true)) errors.push('Có channel variant thiếu nội dung hoặc vượt giới hạn.');
  }
  if (stageId === 'quality') {
    if (Number(output.score) < 80) errors.push('QA score phải đạt tối thiểu 80.');
    if (output.passed === true && Array.isArray(output.requiredFixes) && output.requiredFixes.length) errors.push('Không thể passed khi vẫn còn requiredFixes.');
  }
  if (stageId === 'publish' && Array.isArray(output.jobs)
    && output.jobs.some((job) => job?.preflight?.passed !== true)) {
    errors.push('Mọi publishing job phải vượt qua preflight.');
  }

  const score = Math.max(0, 100 - (errors.length * 15) - (warnings.length * 5));
  return {
    valid: errors.length === 0 && score >= 80,
    score,
    errors,
    warnings,
    checks: [
      ...checks,
      ...masterSkill.qualityGates.map((gate) => ({ name: gate, passed: errors.length === 0 })),
    ],
  };
}
