export const DHP_BRAND_MEMORY = {
  brand: {
    name: 'Đại Hải Phát',
    positioning: 'Đơn vị cơ khí dân dụng và nội thất đáng tin cậy, tư vấn rõ ràng, thi công thực tế và ưu tiên độ bền.',
    audience: ['Chủ nhà', 'Chủ cửa hàng', 'Nhà thầu dân dụng', 'Khách hàng cần cải tạo nhà ở'],
    services: ['Cửa cổng', 'Lan can', 'Cầu thang', 'Mái che', 'Tủ bếp', 'Nội thất dân dụng'],
    tone: ['Chuyên nghiệp', 'Gần gũi', 'Rõ ràng', 'Không phóng đại', 'Ưu tiên tính thực tế'],
    visual: {
      primary: '#07182e',
      secondary: '#102846',
      accent: '#d6a84b',
      surface: '#0d213b',
      text: '#f8fafc',
      muted: '#94a3b8',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  messaging: {
    defaultCta: 'Liên hệ Đại Hải Phát để được tư vấn, khảo sát và báo giá phù hợp.',
    proofPoints: ['Tư vấn theo hiện trạng', 'Vật liệu và cấu tạo được mô tả rõ', 'Thi công dân dụng thực tế', 'Ưu tiên độ bền và an toàn'],
    forbiddenClaims: ['Rẻ nhất thị trường', 'Tốt nhất Việt Nam', 'Bảo hành trọn đời', 'Cam kết tuyệt đối khi chưa có căn cứ'],
    requiredChecks: ['Đúng tên dịch vụ', 'Không tự suy đoán vật liệu', 'Không bịa kích thước hoặc giá', 'Có CTA phù hợp', 'Link và số liên hệ phải hợp lệ'],
  },
  channels: {
    facebook: { objective: 'Tạo tin cậy và khuyến khích nhắn tin', style: 'Có bối cảnh, lợi ích, chi tiết công trình và CTA', maxCharacters: 5000 },
    instagram: { objective: 'Trình bày hình ảnh và nhận diện', style: 'Ngắn, trực quan, hashtag có chọn lọc', maxCharacters: 2200 },
    tiktok: { objective: 'Tăng khả năng xem và tương tác', style: 'Hook nhanh, câu ngắn, tập trung một điểm nổi bật', maxCharacters: 2200 },
    youtube: { objective: 'Tìm kiếm và xem dài hạn', style: 'Tiêu đề rõ, mô tả có từ khóa, nêu nội dung video', maxCharacters: 5000 },
    pinterest: { objective: 'Khám phá mẫu và tìm kiếm hình ảnh', style: 'Tiêu đề mô tả, từ khóa thiết kế và vật liệu đã xác minh', maxCharacters: 500 },
    zalo: { objective: 'Trao đổi trực tiếp và chăm sóc khách hàng', style: 'Ngắn, rõ, có hành động tiếp theo', maxCharacters: 2000 },
    linkedin: { objective: 'Xây dựng uy tín doanh nghiệp', style: 'Case study, quy trình, bài học và năng lực triển khai', maxCharacters: 3000 },
  },
};

export function buildBrandContext(overrides = {}) {
  return {
    ...DHP_BRAND_MEMORY,
    ...overrides,
    brand: { ...DHP_BRAND_MEMORY.brand, ...(overrides.brand || {}) },
    messaging: { ...DHP_BRAND_MEMORY.messaging, ...(overrides.messaging || {}) },
    channels: { ...DHP_BRAND_MEMORY.channels, ...(overrides.channels || {}) },
  };
}
