const DOMAIN_PROFILES = Object.freeze([
  {
    id: 'interior',
    name: 'Nội thất và không gian sống',
    keywords: ['tủ bếp', 'nội thất', 'veneer', 'phòng khách', 'phòng ngủ', 'cửa', 'cầu thang'],
    goal: 'lead_generation',
    audience: 'Chủ nhà, gia đình trẻ và khách hàng đang cải tạo không gian sống',
    tone: 'professional',
  },
  {
    id: 'construction',
    name: 'Cơ khí dân dụng và xây dựng',
    keywords: ['cổng sắt', 'lan can', 'mái che', 'khung sắt', 'cơ khí', 'inox', 'nhôm kính'],
    goal: 'lead_generation',
    audience: 'Chủ nhà, chủ cửa hàng và khách hàng cần thi công dân dụng',
    tone: 'trustworthy',
  },
  {
    id: 'general',
    name: 'Sản phẩm và dịch vụ',
    keywords: [],
    goal: 'engagement',
    audience: 'Khách hàng tiềm năng',
    tone: 'professional',
  },
]);

const PLATFORM_ALIASES = Object.freeze({
  facebook: ['facebook', 'fb'],
  instagram: ['instagram', 'insta'],
  tiktok: ['tiktok', 'tik tok'],
  youtube: ['youtube', 'shorts', 'youtube shorts'],
  pinterest: ['pinterest', 'pin'],
  linkedin: ['linkedin'],
  zalo: ['zalo', 'zalo oa'],
});

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export function detectCampaignDomain(command) {
  const normalized = normalizeText(command);
  return DOMAIN_PROFILES.find((profile) => (
    profile.id !== 'general' && profile.keywords.some((keyword) => normalized.includes(keyword))
  )) || DOMAIN_PROFILES.find((profile) => profile.id === 'general');
}

export function detectPlatforms(command) {
  const normalized = normalizeText(command);
  return Object.entries(PLATFORM_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))
    .map(([platform]) => platform);
}

export function detectMediaTypes(command) {
  const normalized = normalizeText(command);
  const mediaTypes = [];
  // Do not use ASCII-style word boundaries around Vietnamese words such as "ảnh".
  if (/(ảnh|hình|image|thumbnail)/u.test(normalized)) mediaTypes.push('image');
  if (/(video|reel|short|storyboard|kịch bản)/u.test(normalized)) mediaTypes.push('video');
  return mediaTypes.length ? mediaTypes : ['image'];
}

export function detectDurationDays(command) {
  const normalized = normalizeText(command);
  const match = normalized.match(/(\d{1,3})\s*(ngày|days?)/);
  if (!match) return 1;
  return Math.min(Math.max(Number(match[1]), 1), 365);
}

export function detectPostsPerDay(command) {
  const normalized = normalizeText(command);
  const explicit = normalized.match(/(\d{1,2})\s*(bài|post|video|ảnh)\s*(mỗi|\/)?\s*(ngày|day)/);
  if (explicit) return Math.min(Math.max(Number(explicit[1]), 1), 10);
  if (/hai\s+(bài|post|video|ảnh)\s+(mỗi|\/)?\s*(ngày|day)/.test(normalized)) return 2;
  if (/ba\s+(bài|post|video|ảnh)\s+(mỗi|\/)?\s*(ngày|day)/.test(normalized)) return 3;
  return 1;
}

export function analyzeCampaignCommand(command) {
  const topic = String(command || '').trim();
  if (!topic) throw new Error('Câu lệnh chiến dịch không được để trống.');

  const domain = detectCampaignDomain(topic);
  return {
    topic,
    domain: { id: domain.id, name: domain.name },
    goal: domain.goal,
    audience: domain.audience,
    tone: domain.tone,
    suggestedPlatforms: detectPlatforms(topic),
    suggestedMediaTypes: detectMediaTypes(topic),
    durationDays: detectDurationDays(topic),
    postsPerDay: detectPostsPerDay(topic),
  };
}

export { DOMAIN_PROFILES, PLATFORM_ALIASES };
