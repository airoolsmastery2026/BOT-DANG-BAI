# 🔍 Customer Finder Pro - Ứng dụng Tìm Kiếm Khách Hàng Tự Động

**Tìm kiếm, tạo nội dung, lên lịch và vận hành các kênh Facebook, Instagram, TikTok và Zalo Official Account**

---

## 📸 Tính Năng Chính

✅ Kết nối Facebook, Instagram, TikTok bằng token của chính bạn

✅ Chế độ demo tích hợp sẵn — dùng thử giao diện ngay cả khi chưa có token thật

✅ Lọc thông minh — theo followers, engagement, từ khóa, địa điểm

✅ Match Score — chấm điểm mức độ phù hợp của từng khách hàng tiềm năng

✅ Lưu & xuất kết quả — CSV hoặc JSON

✅ Tìm kiếm tự động mỗi 5 phút (tuỳ chọn)

✅ **Bot viết bài tự động** — sinh nội dung theo chủ đề, có tinh chỉnh giọng văn/độ dài/emoji/hashtag/CTA, chọn template hoặc gọi AI

✅ **Lên lịch đăng bài** — đăng ngay hoặc hẹn giờ, lặp lại hàng ngày/hàng tuần, đăng cùng lúc lên nhiều nền tảng

✅ **Zalo OA Control** — gửi ngay hoặc lên lịch tin nhắn văn bản tới người dùng đã tương tác/cấp quyền cho Official Account

✅ **Zalo server scheduler** — chạy nền bằng Node.js, lưu hàng đợi trên server, retry tối đa 3 lần và không phụ thuộc tab trình duyệt

---

## 💬 Tích hợp Zalo Official Account

Tab **Zalo OA** hỗ trợ thử nghiệm trực tiếp trong trình duyệt:

- Nhập OA Access Token và `user_id` người nhận.
- Gửi tin nhắn văn bản ngay.
- Lên lịch gửi tin nhắn.
- Hàng đợi và lịch sử gửi.
- Công tắc tự kiểm tra tin đến hạn mỗi 60 giây.

### Chạy scheduler Zalo phía server

Bản server dùng Node.js 18+, không cần cài thêm package:

```bash
cp .env.example .env
# Nạp các biến môi trường theo cách phù hợp với hệ điều hành/deployment của bạn
npm run zalo:server
```

Các biến quan trọng:

```env
ZALO_OA_ACCESS_TOKEN=
ZALO_SERVER_API_KEY=
ZALO_SERVER_PORT=8787
ZALO_ALLOWED_ORIGIN=http://localhost:3000
```

REST API:

```text
GET    /health
GET    /api/zalo/messages
POST   /api/zalo/messages
POST   /api/zalo/process
DELETE /api/zalo/messages/:id
```

Ví dụ tạo tin nhắn:

```bash
curl -X POST http://localhost:8787/api/zalo/messages \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_SERVER_API_KEY" \
  -d '{"userId":"ZALO_USER_ID","content":"Xin chào","scheduledTime":"2026-07-30T10:00:00+07:00"}'
```

Dữ liệu mặc định được lưu tại `server/zalo-messages.json`. Không commit tệp dữ liệu này hoặc token thật lên GitHub.

### Giới hạn bắt buộc

- Đây là **Zalo Official Account OpenAPI**, không phải API đăng bài lên nhật ký cá nhân.
- OA chỉ gửi được theo phạm vi quyền, chính sách và điều kiện tương tác do Zalo quy định.
- Chế độ frontend lưu token trong `localStorage`, chỉ phù hợp thử nghiệm cục bộ.
- Production nên dùng `server/zalo-server.js`, secret manager, HTTPS, database thật, refresh-token flow, webhook và audit log.

---

## 📤 Đăng Bài Tự Động

1. Kết nối nền tảng ở tab "Tìm khách hàng".
2. Sang tab "Đăng bài tự động": tạo nội dung, chọn nền tảng, nhập media/target ID và lên lịch.
3. Scheduler frontend chỉ hoạt động khi tab mở; triển khai worker/server để chạy liên tục.

### ⚠️ Giới hạn nền tảng

- **Facebook**: cần quyền `pages_manage_posts`, chỉ đăng lên Page bạn quản lý.
- **Instagram**: cần quyền `instagram_content_publish`, bắt buộc có ảnh/video công khai.
- **TikTok**: cần quyền `video.publish`; Direct Post phụ thuộc trạng thái xét duyệt ứng dụng.
- **Zalo OA**: chỉ tương tác với người dùng hợp lệ trong phạm vi Official Account.

---

## 🚀 Bắt Đầu Nhanh

```bash
git clone https://github.com/airoolsmastery2026/BOT-DANG-BAI.git
cd BOT-DANG-BAI
npm install
npm start
```

Truy cập `http://localhost:3000`.

---

## 📁 Cấu Trúc Dự Án

```text
customer-finder-pro/
├── public/
│   └── index.html
├── src/
│   ├── App.jsx
│   ├── AdvancedCustomerFinder.jsx
│   ├── PostScheduler.jsx
│   ├── ZaloControl.jsx
│   ├── zalo_api.js
│   ├── api_handler.js
│   ├── content_generator.js
│   ├── post_manager.js
│   ├── utils.js
│   ├── index.js
│   └── index.css
├── server/
│   ├── scheduler-example.js
│   └── zalo-server.js
├── SETUP_GUIDE.md
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── README.md
```

---

## 📄 License

MIT
