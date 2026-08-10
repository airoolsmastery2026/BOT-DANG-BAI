# DHP Persistent Publishing Worker

Worker này giải quyết giới hạn quan trọng của browser scheduler: bài đã lên lịch vẫn có thể được xử lý khi tab trình duyệt đóng, miễn là máy/server chạy worker vẫn hoạt động.

## Phạm vi

Worker hiện hỗ trợ LIVE cho:

- Facebook Page;
- Instagram Business / Creator;
- TikTok Content Posting.

Worker dùng API chính thức, selective retry, idempotency, encrypted credential vault và Dead Letter Queue. Không có cơ chế né anti-bot hoặc mô phỏng người dùng.

## 1. Cấu hình

Tạo secret riêng, không commit vào GitHub:

```env
DHP_PUBLISHING_WORKER_HOST=127.0.0.1
DHP_PUBLISHING_WORKER_PORT=8794
DHP_PUBLISHING_WORKER_TOKEN=<random-api-token>
DHP_PUBLISHING_VAULT_KEY=<random-secret-at-least-24-characters>
DHP_PUBLISHING_WORKER_ORIGIN=http://localhost:3000
DHP_PUBLISHING_WORKER_PATH=./server/dhp-publishing-worker.json
DHP_PUBLISHING_VAULT_PATH=./server/dhp-publishing-vault.json
DHP_PUBLISHING_WORKER_INTERVAL_MS=30000
DHP_PUBLISHING_WORKER_TIMEOUT_MS=30000
DHP_META_GRAPH_API_VERSION=v25.0
DHP_PUBLISHING_CONTROL_PATH=./server/dhp-publishing-control.json
```

`DHP_PUBLISHING_VAULT_KEY` chỉ tồn tại ở server. Credential mạng xã hội trong file vault được mã hóa AES-256-GCM và không lưu plaintext.

## 2. Chạy worker

```bash
node server/publishing-worker.js
```

Health endpoint không trả token:

```text
GET http://127.0.0.1:8794/health
```

Các route còn lại yêu cầu:

```text
Authorization: Bearer <DHP_PUBLISHING_WORKER_TOKEN>
```

## 3. Lưu tài khoản cho worker

Facebook:

```http
PUT /v1/accounts/facebook
Authorization: Bearer <worker-token>
Content-Type: application/json

{
  "accessToken": "...",
  "pageId": "..."
}
```

Instagram:

```json
{
  "accessToken": "...",
  "userId": "..."
}
```

TikTok:

```json
{
  "accessToken": "..."
}
```

Kiểm tra credential đã lưu:

```text
POST /v1/accounts/facebook/verify
POST /v1/accounts/instagram/verify
POST /v1/accounts/tiktok/verify
```

Credential trả về từ vault không được đưa vào response. `/health` chỉ hiển thị metadata `configured/updatedAt`.

## 4. Đưa bài vào persistent queue

```http
POST /v1/jobs
Authorization: Bearer <worker-token>
Idempotency-Key: <stable-key>
Content-Type: application/json

{
  "campaignId": "campaign-001",
  "content": "Nội dung đã duyệt",
  "platforms": ["facebook", "instagram"],
  "scheduledTime": "2026-08-10T09:00:00.000Z",
  "imageUrl": "https://.../image.jpg",
  "targetIds": {}
}
```

Nếu `targetIds` trống, worker dùng Page ID / Instagram ID trong encrypted vault.

## 5. Runtime

Worker tự chạy mỗi 30 giây theo mặc định:

```text
read queue
→ recover stuck publishing
→ select due jobs
→ publish pending platforms only
→ persist result after each job
→ retry retryable errors with exponential delay
→ dead_letter for permanent/exhausted errors
```

Nếu Facebook thành công nhưng Instagram lỗi, lần sau chỉ Instagram được retry.

## 6. Pause / Resume

Worker đọc state của Publishing Control từ:

```env
DHP_PUBLISHING_CONTROL_PATH=./server/dhp-publishing-control.json
```

Khi scheduler bị `PAUSED`, worker không gửi bài mới nhưng queue vẫn được giữ nguyên.

## 7. API vận hành

```text
GET  /health
GET  /v1/jobs
GET  /v1/jobs?status=failed
POST /v1/jobs
POST /v1/jobs/process
POST /v1/jobs/:id/retry
PUT  /v1/accounts/:platform
POST /v1/accounts/:platform/verify
DELETE /v1/accounts/:platform
```

## 8. Dữ liệu và bảo mật

- Worker mặc định bind `127.0.0.1`, không public Internet.
- API quản trị yêu cầu Bearer token riêng.
- Vault key không đi vào browser hoặc request body.
- Credential file được mã hóa bằng AES-256-GCM.
- Worker job store không chứa platform access token.
- Không đặt `DHP_PUBLISHING_WORKER_TOKEN` hay `DHP_PUBLISHING_VAULT_KEY` trong `REACT_APP_*`.
- Nếu deploy worker lên server Internet, đặt sau HTTPS/reverse proxy và network ACL; không mở trực tiếp cổng 8794.

## 9. Kiểm thử

```bash
node --test server/publishing-worker-runtime.test.js
node --test server/publishing-worker-vault.test.js
```

GitHub workflow `Publishing Worker CI` chạy tự động cho mọi PR thay đổi worker.

## 10. Trạng thái tích hợp frontend

Account Connection Center trong web hiện vẫn dùng `sessionStorage` cho LIVE trong phiên. Persistent Worker là lớp vận hành 24/7 độc lập và đã có API/vault để nhận credential + job. Bước nối UI trực tiếp vào worker cần dùng một pairing/session credential, không nhúng worker token vào bundle frontend.
