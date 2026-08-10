# Persistent campaign handoff

Các script trong thư mục này chuyển một campaign workflow đã duyệt sang queue 24/7 của DHP Publishing Worker.

## Điều kiện

Workflow phải:

- có `campaign.id`;
- có `workflowStatus` là `approved` hoặc `scheduled`;
- có `schedulePlan.slots` hợp lệ;
- có nội dung theo từng channel;
- Instagram phải có image URL đã render và truy cập công khai;
- TikTok phải có video URL đã render và truy cập công khai.

Facebook, Instagram và TikTok được chuyển sang persistent worker. Các channel khác như YouTube/Zalo/LinkedIn/Pinterest được báo trong `skippedPlatforms` và không bị gửi nhầm vào worker hiện tại.

## Import campaign JSON

Cấu hình worker token trong môi trường shell, không ghi token vào file campaign:

```bash
export DHP_PUBLISHING_WORKER_URL=http://127.0.0.1:8794
export DHP_PUBLISHING_WORKER_TOKEN=...
node scripts/publishing/import-campaign.js ./campaign.json
```

Importer tạo một job riêng cho mỗi `platform × schedule slot` để giữ đúng nội dung theo nền tảng và selective retry.

Mỗi job có idempotency key SHA-256 ổn định. Nếu chạy lại cùng campaign, worker trả `409` cho job trùng và importer ghi nhận là `duplicate` thay vì tạo bài mới.

## Không chứa secret trong campaign JSON

Campaign export không nên chứa:

- access token;
- refresh token;
- worker API token;
- vault key;
- provider API key.

Credential LIVE được lấy từ encrypted worker vault khi đến thời điểm publish.
