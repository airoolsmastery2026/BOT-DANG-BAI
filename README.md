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
- `LIVE`: chỉ chạy khi tài khoản và target cần thiết đã được cấu hình.

## Kết nối tài khoản

Mở tab **Kết nối** trong ứng dụng.

### Facebook

Cần:

- Facebook Page Access Token.
- Facebook Page ID.

Ứng dụng kiểm tra token có đọc đúng Page ID đã nhập trước khi coi phép kiểm tra là thành công.

### Instagram

Cần:

- Instagram Access Token.
- Instagram Business / Creator ID.

Ứng dụng kiểm tra tài khoản mà token trả về có khớp ID đã cấu hình.

### TikTok

Cần:

- TikTok user access token có scope phù hợp với tác vụ ứng dụng sử dụng.

### Bảo mật credential

Credential nhập tại giao diện hiện chỉ được lưu trong `sessionStorage`:

- không ghi vào repository;
- không ghi vào `localStorage`;
- tự mất khi đóng phiên trình duyệt;
- không đưa secret vào URL handoff.

Đây là mô hình phù hợp cho giai đoạn vận hành nội bộ/kiểm thử. Khi triển khai nhiều người dùng, credential dài hạn phải chuyển sang backend/secret manager.

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
- retry giới hạn;
- Dead Letter Queue;
- Queue Health;
- trạng thái campaign.

## Live Readiness

Tab **Tổng quan** hiển thị:

- số tài khoản mạng xã hội đủ cấu hình;
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
- khôi phục tác vụ bị kẹt;
- tối đa số lần thử;
- Dead Letter Queue;
- diagnostics và publisher preflight.

## DHP Media Inbox / Control Plane

Repository có local media ingress để nhận package từ pipeline sản xuất nội dung và có thể đồng bộ package từ DHP Control Plane cloud khi cấu hình server-side credential.

Secret Control Plane không được đưa vào `REACT_APP_*`.

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

## Kiểm tra chất lượng

```bash
npm test -- --runInBand
npm run build
npm run lint
```

CI trên GitHub chạy khi push `main` hoặc mở Pull Request và thực hiện:

- kiểm tra syntax các server đang dùng;
- test bridge/media sync;
- unit test frontend;
- production build.

## File quan trọng

```text
src/
├── App.jsx
├── PlatformConnections.jsx
├── platform_credentials.js
├── platform_connection_service.js
├── SystemDashboard.jsx
├── system_readiness.js
├── CampaignStudio.jsx
├── CampaignDrafts.jsx
├── PostScheduler.jsx
├── post_manager.js
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
└── dhp-social-lead-bridge.js
```

## Nguyên tắc vận hành

1. Dùng MOCK để test trước.
2. Kết nối và kiểm tra tài khoản tại tab **Kết nối**.
3. Xử lý hết blocker tại **Tổng quan**.
4. Chỉ sau đó mới dùng **Đăng LIVE**.
5. Không commit token, client secret, API key hoặc dữ liệu production vào GitHub.

Chi tiết cấu hình xem `SETUP_GUIDE.md`.

## License

MIT
