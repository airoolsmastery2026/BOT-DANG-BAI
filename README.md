# BOT ĐĂNG BÀI

Ứng dụng điều phối nội dung, lên lịch, kiểm thử và phân phối bài đăng mạng xã hội cho hệ sinh thái Đại Hải Phát.

## Trạng thái sản phẩm

Luồng vận hành chính hiện tại:

```text
AI / Campaign
→ Draft / Media Inbox
→ Scheduler
→ Publisher Preflight
→ Queue Runtime
→ Facebook / Instagram / TikTok
→ Retry chọn lọc
→ Dead Letter Queue
→ Health / Readiness
```

Ứng dụng có hai chế độ publisher:

- `MOCK`: kiểm thử miễn phí, không cần token và không gửi dữ liệu ra mạng xã hội.
- `LIVE`: chỉ chạy khi tài khoản và target cần thiết đã được cấu hình và kiểm tra thành công trong phiên.

## Kết nối tài khoản

Mở tab **Kết nối** trong ứng dụng.

Mỗi ô Access Token/ID có liên kết mở trực tiếp cổng chính thức của Meta hoặc TikTok và mục **Cách lấy đúng token & ID**. Liên kết mở ngoài ứng dụng, không mang theo giá trị đã nhập. Không dùng website trung gian để tạo hoặc kiểm tra token.

### Facebook

Cần:

- Facebook Page Access Token.
- Facebook Page ID.

Trong Graph API Explorer, có thể dùng `/me/accounts?fields=id,name,access_token,tasks` để lấy cặp Page ID/Page Access Token từ cùng một kết quả.

Ứng dụng kiểm tra token có đọc đúng Page ID đã nhập trước khi coi phép kiểm tra là thành công.

### Instagram

Cần:

- Instagram Access Token.
- Instagram Business / Creator ID.

Sau khi liên kết Instagram Professional với Facebook Page, dùng `/me/accounts?fields=id,name,access_token,instagram_business_account` trong Graph API Explorer để lấy `instagram_business_account.id` và Page Access Token tương ứng.

Ứng dụng kiểm tra tài khoản mà token trả về có khớp ID đã cấu hình.

### TikTok

Cần:

- TikTok user access token có quyền Content Posting phù hợp.

Token phải được cấp bằng OAuth của TikTok App. Chỉ nhập `access_token`; không nhập Client key, Client secret hoặc refresh token vào giao diện.

Ứng dụng kiểm tra creator posting capability trước khi cho LIVE.

### Bảo mật credential

Credential mạng xã hội nhập tại giao diện hiện chỉ được lưu trong `sessionStorage`:

- không ghi vào repository;
- không ghi vào `localStorage`;
- tự mất khi đóng phiên trình duyệt;
- không đưa secret vào URL handoff.

Đây là mô hình phù hợp cho giai đoạn vận hành nội bộ/kiểm thử. Khi triển khai nhiều người dùng, credential dài hạn phải chuyển sang backend/secret manager.

## AI Content Server

Provider API key không còn được nhập hoặc lưu trong trình duyệt. AI content đi qua gateway server-side.

Cấu hình server:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
DHP_AI_CONTENT_HOST=127.0.0.1
DHP_AI_CONTENT_PORT=8793
DHP_AI_CONTENT_ORIGIN=http://localhost:3000
```

Chạy gateway:

```bash
npm run dhp:ai-content
```

Frontend chỉ cần URL công khai, không phải secret:

```env
REACT_APP_DHP_AI_CONTENT_URL=http://127.0.0.1:8793
```

Không tạo các biến kiểu `REACT_APP_GEMINI_API_KEY`, `REACT_APP_OPENAI_API_KEY` hoặc `REACT_APP_ANTHROPIC_API_KEY` vì biến `REACT_APP_*` được bundle vào browser.

Nếu gateway AI chưa chạy, nút **Tạo 3 phương án miễn phí** vẫn hoạt động bằng template local; nút **Viết bằng AI** chỉ bật khi địa chỉ gateway được cấu hình.

## Kiểm thử miễn phí

Trong tab **Hàng đợi**, chọn kịch bản MOCK và chạy publisher mà không cần tài khoản thật.

Các kịch bản hiện có:

- thành công;
- Instagram lỗi;
- TikTok lỗi;
- giả lập rate limit `429`;
- giả lập timeout mạng.

MOCK dùng chung Queue Runtime với LIVE nên kiểm thử được:

- preflight;
- selective retry;
- idempotency;
- runtime lock chống xử lý trùng;
- retry giới hạn;
- Dead Letter Queue;
- Queue Health;
- trạng thái campaign.

## Live Readiness

Tab **Tổng quan** hiển thị:

- số tài khoản mạng xã hội đủ cấu hình/đã kiểm tra;
- blocker còn lại trước LIVE;
- số bài đến hạn/bị preflight chặn;
- tình trạng Queue Health;
- trạng thái connector Zalo/LinkedIn.

Nếu chưa có tài khoản, từ Tổng quan hoặc Đăng bài có thể đi thẳng tới **Kết nối**.

## Scheduler và Queue

Scheduler hỗ trợ:

- Facebook, Instagram, TikTok;
- đăng ngay hoặc hẹn giờ;
- lặp hàng ngày/hàng tuần;
- target theo tài khoản đã kết nối;
- handoff từ campaign và Video OS.

Queue Runtime hỗ trợ:

- selective publishing;
- selective retry;
- chống đăng lặp bằng idempotency key;
- serialization lock chống hai lượt runtime cùng đăng một bài;
- khôi phục tác vụ bị kẹt;
- tối đa số lần thử;
- Dead Letter Queue;
- diagnostics và publisher preflight.

Bộ kiểm tra 60 giây trong `PostScheduler` chỉ chạy khi trang đang mở. Đây không phải worker 24/7; tác vụ nền liên tục phải chạy bằng server/worker riêng.

## DHP Media Inbox / Control Plane

Repository có local media ingress để nhận package từ pipeline sản xuất nội dung và có thể đồng bộ package từ DHP Control Plane cloud khi cấu hình server-side credential.

Secret Control Plane không được đưa vào `REACT_APP_*`.

## Publishing Control và Telegram

Publishing Control local hỗ trợ trạng thái `RUNNING/PAUSED`; Telegram Control chỉ có các lệnh giới hạn quyền:

```text
/status
/pause
/resume
```

Telegram không có lệnh publish trực tiếp hoặc xóa dữ liệu. Token/allowlist của Telegram là server-side.

## Zalo và LinkedIn

Hai connector này dùng Node server riêng:

```bash
npm run zalo:server
npm run linkedin:server
```

Các server có health endpoint để Dashboard theo dõi trạng thái.

## Cài đặt local

Yêu cầu Node.js 20.x và npm 10.x.

```bash
git clone https://github.com/airoolsmastery2026/BOT-DANG-BAI.git
cd BOT-DANG-BAI
npm install
npm start
```

Mặc định CRA chạy tại:

```text
http://localhost:3000
```

## Bộ cài Windows

Ứng dụng desktop Windows x64 được đóng gói bằng Electron và NSIS. Máy người dùng không cần cài Node.js hoặc npm.

```powershell
npm run desktop:package
```

Installer được tạo tại `release/windows/BOT-DANG-BAI-Setup-1.0.0-x64.exe`. Ứng dụng tiếp tục chạy ở System Tray khi đóng cửa sổ để lịch local không bị dừng; menu tray có tùy chọn thoát hoàn toàn và khởi động cùng Windows.

Xem hướng dẫn cài đặt, dữ liệu và cảnh báo chữ ký tại `WINDOWS_INSTALLER.md`.

## Kiểm tra chất lượng

```bash
npm test -- --runInBand
npm run build
npm run lint
```

CI trên GitHub chạy khi push `main` hoặc mở Pull Request và thực hiện:

- kiểm tra syntax các server đang dùng;
- test bridge, Control Plane, Telegram và AI gateway;
- unit test frontend;
- production build.

## File quan trọng

```text
src/
├── App.jsx
├── PlatformConnections.jsx
├── platform_credentials.js
├── platform_connection_service.js
├── meta_publishing_api.js
├── tiktok_content_posting.js
├── ai_content_client.js
├── content_generator.js
├── SystemDashboard.jsx
├── system_readiness.js
├── CampaignStudio.jsx
├── CampaignDrafts.jsx
├── PostScheduler.jsx
├── post_manager.js
├── queue_runtime_lock.js
├── publisher_adapter.js
├── publisher_preflight.js
├── queue_health.js
├── QueueRuntimeControls.jsx
├── QueueMonitor.jsx
├── DhpMediaInbox.jsx
└── video_os_handoff.js

server/
├── zalo-server.js
├── linkedin-server.js
├── dhp-media-ingress.js
├── publishing-control-server.js
├── telegram-control.js
├── ai-content-server.js
└── dhp-social-lead-bridge.js
```

## Nguyên tắc vận hành

1. Dùng MOCK để test trước.
2. Kết nối và kiểm tra tài khoản tại tab **Kết nối**.
3. Xử lý hết blocker tại **Tổng quan**.
4. Chỉ sau đó mới dùng **Đăng LIVE**.
5. Giữ Gemini/provider key ở server-side gateway.
6. Không commit token, client secret, API key hoặc dữ liệu production vào GitHub.

Chi tiết cấu hình xem `SETUP_GUIDE.md`.

## License

MIT
