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

Ngay cạnh từng ô ID/token có liên kết đến trang chính thức để lấy giá trị tương ứng. Các link này mở trong trình duyệt mặc định và không nhận bất kỳ giá trị nào đang nhập trong ứng dụng.

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

1. Mở **Meta App Dashboard** từ thẻ Facebook và chọn ứng dụng.
2. Mở **Graph API Explorer**, cấp `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
3. Chạy `GET /me/accounts?fields=id,name,access_token,tasks`.
4. Dán `id` vào Facebook Page ID và `access_token` cùng dòng vào Page Access Token.

Sau khi nhập, bấm **Kiểm tra kết nối**. Hệ thống chỉ xác nhận khi Page mà token đọc được khớp đúng Page ID đã cấu hình.

## 4. Instagram Business / Creator

Cần:

```text
Instagram Access Token
Instagram Business / Creator ID
```

Tài khoản phải là loại được API chính thức hỗ trợ cho publishing và token phải có quyền phù hợp.

1. Liên kết tài khoản Instagram Professional với Facebook Page quản lý tài khoản đó.
2. Trong ứng dụng Meta, cấp `instagram_basic`, `instagram_content_publish`, `pages_show_list`.
3. Chạy `GET /me/accounts?fields=id,name,access_token,instagram_business_account` trong Graph API Explorer.
4. Dán `instagram_business_account.id` vào Instagram ID và `access_token` của Page cùng dòng vào ô token.

Ứng dụng kiểm tra tài khoản trả về từ token có khớp ID bạn nhập hay không.

Instagram LIVE yêu cầu media URL phù hợp; publisher preflight sẽ chặn bài thiếu media trước khi gửi API.

## 5. TikTok

Cần:

```text
TikTok User Access Token
```

Token phải được cấp qua OAuth của ứng dụng TikTok Developer và có scope phù hợp với chức năng Content Posting đang dùng.

1. Mở **TikTok Apps**, tạo/chọn ứng dụng và thêm Login Kit cùng Content Posting API.
2. Xin quyền `video.publish` và cấu hình Redirect URI.
3. Hoàn tất OAuth rồi đổi authorization code thành user `access_token` theo tài liệu chính thức.
4. Chỉ dán `access_token`; tuyệt đối không dán Client key, Client secret hoặc refresh token.

Ứng dụng kiểm tra creator posting capability trước LIVE. Video dùng `PULL_FROM_URL` cần URL có thể được TikTok truy cập và phải đáp ứng yêu cầu domain/URL của TikTok Developer.

Trong giai đoạn chưa hoàn tất phê duyệt ứng dụng, nên tiếp tục dùng MOCK để kiểm thử toàn bộ workflow trước khi thử LIVE.

## 6. AI Content Gateway

AI provider key không được nhập vào giao diện và không được lưu trong browser.

Server-side `.env`:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
DHP_AI_CONTENT_HOST=127.0.0.1
DHP_AI_CONTENT_PORT=8793
DHP_AI_CONTENT_ORIGIN=http://localhost:3000
DHP_AI_CONTENT_TIMEOUT_MS=30000
```

Chạy gateway:

```bash
npm run dhp:ai-content
```

Frontend chỉ cấu hình địa chỉ gateway:

```env
REACT_APP_DHP_AI_CONTENT_URL=http://127.0.0.1:8793
```

Không tạo các biến:

```text
REACT_APP_GEMINI_API_KEY
REACT_APP_OPENAI_API_KEY
REACT_APP_ANTHROPIC_API_KEY
```

Trong **Đăng bài → Trạng thái AI**, bấm **Kiểm tra AI Server** để phân biệt:

- gateway chưa cấu hình;
- gateway online nhưng provider key server-side chưa sẵn sàng;
- gateway + Gemini hoạt động.

Nếu gateway chưa hoạt động, **Tạo 3 phương án miễn phí** vẫn dùng template local và không tiêu tốn API.

## 7. Bảo mật credential

Frontend hiện lưu credential mạng xã hội trong:

```text
sessionStorage
```

Điều này có nghĩa:

- đóng phiên trình duyệt thì credential mất;
- credential không được ghi vào repository;
- không đưa credential vào URL handoff;
- không dùng `REACT_APP_*` để chứa client secret hoặc provider API key.

Không commit các giá trị sau:

```text
access token
refresh token
client secret
API key production
Control Plane secret
Gemini API key
```

Khi triển khai nhiều người dùng, chuyển OAuth/token exchange và lưu secret mạng xã hội sang backend.

## 8. DHP Media Inbox / Control Plane

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

## 9. Publishing Control / Telegram

Publishing Control local:

```bash
npm run dhp:publishing-control
```

Telegram Control:

```bash
npm run dhp:telegram-control
```

Telegram chỉ hỗ trợ `/status`, `/pause`, `/resume` với allowlist/role server-side; không có lệnh đăng bài trực tiếp.

## 10. Zalo / LinkedIn server

Chạy local server khi cần hai connector này:

```bash
npm run zalo:server
npm run linkedin:server
```

Dashboard sẽ kiểm tra `/health` của từng server.

## 11. Kiểm tra trước LIVE

Mở **Tổng quan**.

Mục **Sẵn sàng đăng LIVE** tổng hợp:

- tài khoản đã cấu hình/đã kiểm tra;
- Queue Health;
- Publisher Preflight;
- các blocker còn lại.

Nếu có blocker, ứng dụng đưa đường dẫn trực tiếp tới **Kết nối** hoặc **Hàng đợi**.

## 12. Kiểm tra code

```bash
npm install
npm test -- --runInBand
npm run build
npm run lint
```

CI repository cũng chạy backend tests, frontend tests và production build khi push vào `main` hoặc mở PR.

## 13. Quy trình vận hành đề xuất

```text
MOCK test
→ Kết nối tài khoản
→ Kiểm tra kết nối
→ Tổng quan: hết blocker
→ Tạo nội dung local hoặc AI gateway
→ Tạo / duyệt campaign
→ Scheduler
→ Preflight
→ Queue
→ LIVE publish
→ selective retry nếu cần
→ Dead Letter nếu vượt giới hạn
```

Lưu ý: timer 60 giây trong trình duyệt chỉ chạy khi trang đang mở. Muốn lịch đăng thật sự 24/7 cần worker/server scheduler riêng.

Không sử dụng automation để né cơ chế bảo vệ hoặc chính sách nền tảng. Hệ thống được thiết kế để dùng API chính thức, rate limit hợp lệ, preflight và audit rõ ràng.
