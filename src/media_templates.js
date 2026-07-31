export const PLATFORM_MEDIA_PROFILES = Object.freeze({
  facebook: {
    image: { width: 1200, height: 630, aspectRatio: '1.91:1' },
    portrait: { width: 1080, height: 1350, aspectRatio: '4:5' },
    video: { width: 1080, height: 1920, aspectRatio: '9:16', maxDurationSeconds: 90 },
  },
  instagram: {
    image: { width: 1080, height: 1080, aspectRatio: '1:1' },
    portrait: { width: 1080, height: 1350, aspectRatio: '4:5' },
    video: { width: 1080, height: 1920, aspectRatio: '9:16', maxDurationSeconds: 90 },
  },
  tiktok: {
    image: { width: 1080, height: 1920, aspectRatio: '9:16' },
    video: { width: 1080, height: 1920, aspectRatio: '9:16', maxDurationSeconds: 180 },
  },
  youtube: {
    image: { width: 1280, height: 720, aspectRatio: '16:9' },
    short: { width: 1080, height: 1920, aspectRatio: '9:16', maxDurationSeconds: 60 },
    video: { width: 1920, height: 1080, aspectRatio: '16:9' },
  },
  pinterest: {
    image: { width: 1000, height: 1500, aspectRatio: '2:3' },
    video: { width: 1080, height: 1920, aspectRatio: '9:16', maxDurationSeconds: 60 },
  },
  linkedin: {
    image: { width: 1200, height: 627, aspectRatio: '1.91:1' },
    portrait: { width: 1080, height: 1350, aspectRatio: '4:5' },
    video: { width: 1920, height: 1080, aspectRatio: '16:9' },
  },
  zalo: {
    image: { width: 1200, height: 628, aspectRatio: '1.91:1' },
    portrait: { width: 1080, height: 1350, aspectRatio: '4:5' },
    video: { width: 1080, height: 1920, aspectRatio: '9:16', maxDurationSeconds: 60 },
  },
});

export const IMAGE_TEMPLATES = Object.freeze({
  premium_product: {
    id: 'premium_product',
    name: 'Sản phẩm cao cấp',
    requiredFields: ['headline', 'productImage'],
    optionalFields: ['subheadline', 'price', 'cta', 'logo', 'phone'],
    layers: ['background', 'productImage', 'overlay', 'headline', 'subheadline', 'price', 'cta', 'logo', 'phone'],
  },
  promotion: {
    id: 'promotion',
    name: 'Khuyến mãi',
    requiredFields: ['headline', 'offer'],
    optionalFields: ['productImage', 'deadline', 'cta', 'logo', 'phone'],
    layers: ['background', 'productImage', 'offerBadge', 'headline', 'deadline', 'cta', 'logo', 'phone'],
  },
  before_after: {
    id: 'before_after',
    name: 'Trước và sau',
    requiredFields: ['headline', 'beforeImage', 'afterImage'],
    optionalFields: ['caption', 'cta', 'logo'],
    layers: ['background', 'beforeImage', 'afterImage', 'divider', 'headline', 'caption', 'cta', 'logo'],
  },
  portfolio: {
    id: 'portfolio',
    name: 'Hồ sơ công trình',
    requiredFields: ['headline', 'projectImages'],
    optionalFields: ['location', 'materials', 'cta', 'logo'],
    layers: ['background', 'projectImages', 'headline', 'location', 'materials', 'cta', 'logo'],
  },
});

export const VIDEO_TEMPLATES = Object.freeze({
  short_sales: {
    id: 'short_sales',
    name: 'Video bán hàng ngắn',
    defaultDurationSeconds: 30,
    scenes: [
      { type: 'hook', durationSeconds: 3 },
      { type: 'problem', durationSeconds: 5 },
      { type: 'solution', durationSeconds: 8 },
      { type: 'benefits', durationSeconds: 8 },
      { type: 'cta', durationSeconds: 6 },
    ],
  },
  project_showcase: {
    id: 'project_showcase',
    name: 'Giới thiệu công trình',
    defaultDurationSeconds: 45,
    scenes: [
      { type: 'intro', durationSeconds: 4 },
      { type: 'overview', durationSeconds: 8 },
      { type: 'detail', durationSeconds: 12 },
      { type: 'materials', durationSeconds: 8 },
      { type: 'result', durationSeconds: 8 },
      { type: 'cta', durationSeconds: 5 },
    ],
  },
  before_after: {
    id: 'before_after',
    name: 'Video trước và sau',
    defaultDurationSeconds: 25,
    scenes: [
      { type: 'hook', durationSeconds: 3 },
      { type: 'before', durationSeconds: 6 },
      { type: 'process', durationSeconds: 7 },
      { type: 'after', durationSeconds: 6 },
      { type: 'cta', durationSeconds: 3 },
    ],
  },
});

export function getPlatformMediaProfile(platform) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const profile = PLATFORM_MEDIA_PROFILES[normalizedPlatform];

  if (!profile) {
    throw new Error(`Nền tảng không được hỗ trợ: ${platform}`);
  }

  return profile;
}

export function getImageTemplate(templateId) {
  const template = IMAGE_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Không tìm thấy template ảnh: ${templateId}`);
  }
  return template;
}

export function getVideoTemplate(templateId) {
  const template = VIDEO_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Không tìm thấy template video: ${templateId}`);
  }
  return template;
}
