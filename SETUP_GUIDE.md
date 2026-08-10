# Hướng dẫn cấu hình BOT ĐĂNG BÀI

Mục tiêu của tài liệu này là đưa hệ thống từ MOCK sang LIVE với số bước ít nhất.

## 1. Kiểm thử trước bằng MOCK

Không cần đăng ký API để kiểm tra Queue Runtime.

Trong ứng dụng:

1. Mở **Đăng bài** và tạo bài thử.
2. Mở **Hàng đợi**.
3. Chọn một kịch bản MOCK.
4. Bấm **Chạy MOCK**.
5. Kiểm tra kết quả, retry và Dead Letter.

Chỉ chuyển sang LIVE sau khi MOCK hoạt động đúng.

## 2. Nơi kết nối tài khoản

Mở tab:

```text
Kết nối
```

Đây là Account Connection Center duy nhất cho Facebook, Instagram và TikTok.

Sau khi nhập credential:

1. Bấm **Kiểm tra kết nối** trên từng tài khoản; hoặc
2. Bấm **Kiểm tra tất cả**;
3. Khi hợp lệ, cấu hình được lưu trong phiên trình duyệt.

Không cần nhập lại Page ID/Instagram ID cho từng bài nếu đã cấu hình tại đây; Publisher dùng target tài khoản đã kết nối làm mặc định.

## 3. Facebook Page

Cần hai giá trị:

```text
Facebook Page Access Token
Facebook Page ID
```

Token phải thuộc Page mà bạn có quyền quản lý và phải có quyền cần thiết cho chức năng đăng Page mà ứng dụng sử dụng.

Sau khi nhập, bấm **Kiểm tra kết nối**. Hệ thống chỉ xác nhận khi Page mà token đọc được khớp đúng Page ID đã cấu hình.

## 4. Instagram Business / Creator

Cần:

```text
Instagram Access Token
Instagram Business / Creator ID
```

Tài khoản phải là loại được API chính thức hỗ trợ cho publishing và token phải có quyền phù hợp.

Ứng dụng kiểm tra tài khoản trả về từ token có khớp ID bạn nhập hay không.

Instagram LIVE yêu cầu media URL phù hợp; publisher preflight sẽ chặn bài thiếu media trước khi gửi API.

## 5. TikTok

Cần:

```text
TikTok User Access Token
```

Token phải được cấp qua OAuth của ứng dụng TikTok Developer và có scope phù hợp với chức năng Content Posting đang dùng.

Video dùng `PULL_FROM_URL` cần URL có thể được TikTok truy cập và phải đáp ứng yêu cầu domain/URL của TikTok Developer.

Trong giai đoạn chưa hoàn tất phê duyệt ứng dụng, nên tiếp tục dùng MOCK để kiểm thử toàn bộ workflow trước khi thử LIVE.

## 6. Bảo mật credential

Frontend hiện lưu credential mạng xã hội trong:

```text
sessionStorage
```

Điều này có nghĩa:

- đóng phiên trình duyệt thì credential mất;
- credential không được ghi vào repository;
- không đưa credential vào URL handoff;
- không dùng `REACT_APP_*` để chứa client secret.

Không commit các giá trị sau:

```text
access token
refresh token
client secret
API key production
Control Plane secret
```

Khi triển khai nhiều người dùng, chuyển OAuth/token exchange và lưu secret sang backend.

## 7. DHP Media Inbox / Control Plane

Các biến server-side tùy chọn:

```env
DHP_MEDIA_INGRESS_TOKEN=
DHP_MEDIA_INGRESS_HOST=127.0.0.1
DHP_MEDIA_INGRESS_PORT=8791
DHP_MEDIA_ALLOWED_ORIGIN=http://localhost:3000
DHP_MEDIA_INBOX_PATH=./server/dhp-media-inbox.json

DHP_CONTROL_PLANE_URL=
DHP_CONTROL_PLANE_KEY_ID=
DHP_CONTROL_PLANE_SECRET=
DHP_MEDIA_CLOUD_SYNC_INTERVAL_MS=30000
DHP_MEDIA_CLOUD_TIMEOUT_MS=15000
```

Không chuyển `DHP_CONTROL_PLANE_SECRET` hoặc key ID sang biến `REACT_APP_*`.

## 8. Zalo / LinkedIn server

Chạy local server khi cần hai connector này:

```bash
npm run zalo:server
npm run linkedin:server
```

Dashboard sẽ kiểm tra `/health` của từng server.

## 9. Kiểm tra trước LIVE

Mở **Tổng quan**.

Mục **Sẵn sàng đăng LIVE** tổng hợp:

- tài khoản đã cấu hình;
- Queue Health;
- Publisher Preflight;
- các blocker còn lại.

Nếu có blocker, ứng dụng đưa đường dẫn trực tiếp tới **Kết nối** hoặc **Hàng đợi**.

## 10. Kiểm tra code

```bash
npm install
npm test -- --runInBand
npm run build
npm run lint
```

CI repository cũng chạy test và production build khi push vào `main`.

## 11. Quy trình vận hành đề xuất

```text
MOCK test
→ Kết nối tài khoản
→ Kiểm tra kết nối
→ Tổng quan: hết blocker
→ Tạo / duyệt campaign
→ Scheduler
→ Preflight
→ Queue
→ LIVE publish
→ selective retry nếu cần
→ Dead Letter nếu vượt giới hạn
```

Không sử dụng automation để né cơ chế bảo vệ hoặc chính sách nền tảng. Hệ thống được thiết kế để dùng API chính thức, rate limit hợp lệ, preflight và audit rõ ràng.
