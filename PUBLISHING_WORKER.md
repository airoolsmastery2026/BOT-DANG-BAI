# DHP Persistent Publishing Worker

Worker xử lý lịch đăng ngay cả khi trình duyệt đã đóng, miễn là tiến trình worker vẫn chạy. Đây là đường LIVE chính thức cho Facebook, Instagram, TikTok, LinkedIn, Pinterest và YouTube/Shorts.

Worker dùng API chính thức, selective retry, idempotency, encrypted credential vault và Dead Letter Queue. MOCK chỉ tồn tại ở runtime kiểm thử riêng của giao diện; worker 24/7 không giả lập kết quả LIVE.

## 1. Cấu hình

Tạo secret riêng và không commit vào GitHub:

```env
DHP_PUBLISHING_WORKER_HOST=127.0.0.1
DHP_PUBLISHING_WORKER_PORT=8794
DHP_PUBLISHING_WORKER_TOKEN=<random-api-token>
DHP_PUBLISHING_WORKER_ORIGIN=http://localhost:3000
DHP_PUBLISHING_WORKER_PATH=./server/dhp-publishing-worker.json
DHP_PUBLISHING_WORKER_INTERVAL_MS=30000
DHP_PUBLISHING_WORKER_TIMEOUT_MS=30000

DHP_PUBLISHING_VAULT_PATH=./server/dhp-publishing-vault.json
DHP_PUBLISHING_VAULT_KEY=<random-secret-at-least-24-characters>

DHP_META_GRAPH_API_VERSION=v25.0
DHP_LINKEDIN_VERSION=202606
DHP_YOUTUBE_MAX_SOURCE_BYTES=268435456

DHP_PUBLISHING_CONTROL_PATH=./server/dhp-publishing-control.json
```

`DHP_YOUTUBE_MAX_SOURCE_BYTES` mặc định là 256 MiB. Chỉ tăng khi máy chạy worker có đủ bộ nhớ và video nguồn thực sự cần lớn hơn.

## 2. Chạy worker

```bash
npm run dhp:publishing-worker
```

Endpoint health không trả token hoặc credential:

```text
GET http://127.0.0.1:8794/health
```

Mọi route `/v1/*` yêu cầu:

```text
Authorization: Bearer <DHP_PUBLISHING_WORKER_TOKEN>
```

## 3. Kết nối tài khoản LIVE

Lưu credential bằng `PUT /v1/accounts/:platform`.

```jsonc
// Facebook
{ "accessToken": "...", "pageId": "..." }

// Instagram Business / Creator
{ "accessToken": "...", "userId": "..." }

// TikTok
{ "accessToken": "..." }

// LinkedIn member hoặc organization
{ "accessToken": "...", "authorUrn": "urn:li:person:..." }
{ "accessToken": "...", "authorUrn": "urn:li:organization:..." }

// Pinterest
{ "accessToken": "...", "boardId": "..." }

// YouTube / Shorts
{ "accessToken": "...", "channelId": "UC..." }
```

Vault mã hóa credential bằng AES-256-GCM. Mỗi lần lưu credential mới, trạng thái xác minh được đặt lại thành `unverified`.

Sau khi lưu, gọi:

```text
POST /v1/accounts/facebook/verify
POST /v1/accounts/instagram/verify
POST /v1/accounts/tiktok/verify
POST /v1/accounts/linkedin/verify
POST /v1/accounts/pinterest/verify
POST /v1/accounts/youtube/verify
```

LinkedIn không còn được đánh dấu hợp lệ chỉ vì Author URN đúng định dạng. Worker gọi Profile API cho Person URN hoặc Organization Lookup API cho Organization URN và đối chiếu đúng ID. `/health` chỉ trả metadata an toàn: `configured`, `verificationStatus`, thời điểm kiểm tra và mã lỗi tổng quát.

Worker chỉ nhận job khi mọi nền tảng trong job đang ở trạng thái `verified`. Lúc thực thi, worker kiểm tra lại trạng thái này và buộc `targetIds.facebook`/`targetIds.instagram` phải trùng target đã xác minh trong vault. Lưu credential mới tự động vô hiệu kết quả verify cũ.

## 4. Đưa bài vào persistent queue

```http
POST /v1/jobs
Authorization: Bearer <worker-token>
Idempotency-Key: <stable-key>
Content-Type: application/json

{
  "campaignId": "campaign-001",
  "content": "Nội dung đã duyệt",
  "title": "Tiêu đề video",
  "platforms": ["facebook", "instagram", "youtube"],
  "scheduledTime": "2026-08-10T09:00:00.000Z",
  "imageUrl": "https://cdn.example/image.jpg",
  "videoUrl": "https://cdn.example/video.mp4",
  "privacyStatus": "private",
  "targetIds": {}
}
```

Nếu `targetIds` trống, Facebook và Instagram dùng ID đã mã hóa trong vault. Instagram/Pinterest cần ảnh; TikTok/YouTube cần video. YouTube mặc định `private`.

Media URL phải là HTTP/HTTPS và không được nhúng username/password. Idempotency key vẫn được giữ khi job vào `dead_letter`; muốn chạy lại phải dùng endpoint replay bên dưới để worker giữ kết quả các nền tảng đã thành công.

## 5. Runtime và retry

```text
read queue
→ recover stuck publishing
→ select due jobs
→ publish pending platforms only
→ merge kết quả vào bản queue mới nhất
→ retry lỗi tạm thời theo exponential backoff
→ dead_letter khi lỗi vĩnh viễn hoặc hết số lần thử
```

Worker đọc lại queue trước khi ghi kết quả adapter, nên job được thêm trong lúc chờ API mạng không bị ghi đè. Nếu Facebook đã thành công nhưng Instagram lỗi, lần sau chỉ Instagram được chạy lại.

Operator có thể đưa job `failed` hoặc `dead_letter` trở lại queue:

```text
POST /v1/jobs/:id/retry
```

Manual replay đặt lại retry budget nhưng giữ nguyên kết quả các nền tảng đã thành công, tránh đăng trùng.

Nếu file Publishing Control bị hỏng hoặc sai schema, worker fail closed: health trả lỗi và scheduler không xuất bản cho tới khi operator khôi phục file trạng thái hợp lệ. Worker không tự thay file hỏng bằng trạng thái `RUNNING`.

## 6. YouTube source safety

Worker tải video YouTube về server trước khi mở resumable upload session. Vì vậy worker:

- chặn localhost, địa chỉ private/link-local/reserved và hostname nội bộ;
- kiểm tra lại mọi redirect;
- giới hạn kích thước theo `DHP_YOUTUBE_MAX_SOURCE_BYTES`;
- yêu cầu Content-Type là video hoặc `application/octet-stream`;
- chỉ gửi OAuth token đến resumable URL thuộc HTTPS `googleapis.com`.

## 7. Bảo toàn dữ liệu

Queue và vault dùng ghi file tạm rồi rename. Nếu JSON/schema bị hỏng, worker trả health `503` và từ chối ghi đè file bằng dữ liệu rỗng. Hãy sao lưu file trước khi sửa thủ công.

## 8. Pause / Resume

Worker đọc state từ `DHP_PUBLISHING_CONTROL_PATH`. Khi scheduler `PAUSED`, worker không gửi bài mới nhưng giữ nguyên queue.

## 9. API vận hành

```text
GET    /health
GET    /v1/jobs
GET    /v1/jobs?status=failed
POST   /v1/jobs
POST   /v1/jobs/process
POST   /v1/jobs/:id/retry
PUT    /v1/accounts/:platform
POST   /v1/accounts/:platform/verify
DELETE /v1/accounts/:platform
```

## 10. Bảo mật triển khai

- Worker mặc định bind `127.0.0.1`.
- Không đặt worker token, vault key hoặc platform token trong `REACT_APP_*`.
- Khi chạy qua Internet, đặt worker sau HTTPS/reverse proxy và network ACL; không mở trực tiếp cổng 8794.
- Video URL phải là nguồn công khai. Không dùng URL chứa username/password hoặc trỏ vào tài nguyên mạng nội bộ.

## 11. Kiểm thử

```bash
node --test server/publishing-worker-runtime.test.js
node --test server/publishing-worker-vault.test.js
node --test server/publishing-worker-linkedin.test.js
node --test server/publishing-worker-youtube.test.js
node --test server/publishing-worker-admin.test.js
```

Workflow `Publishing Worker CI` chạy syntax check và toàn bộ nhóm test này khi worker thay đổi.
