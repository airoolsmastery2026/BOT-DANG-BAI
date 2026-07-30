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

✅ **Bot viết bài tự động** — sinh nội dung theo chủ đề, có tinh chỉnh giọng văn/độ dài/emoji/hashtag/CTA, chọn template hoặc gọi AI (OpenAI/Anthropic bằng key của bạn)

✅ **Lên lịch đăng bài** — đăng ngay hoặc hẹn giờ, lặp lại hàng ngày/hàng tuần, đăng cùng lúc lên nhiều nền tảng

✅ **Zalo OA Control** — gửi ngay hoặc lên lịch tin nhắn văn bản tới người dùng đã tương tác/cấp quyền cho Official Account

---

## 💬 Tích hợp Zalo Official Account

Tab **Zalo OA** cung cấp:

- Nhập OA Access Token và `user_id` người nhận.
- Gửi tin nhắn văn bản ngay.
- Lên lịch gửi tin nhắn.
- Hàng đợi và lịch sử gửi.
- Công tắc tự kiểm tra tin đến hạn mỗi 60 giây.

### Giới hạn bắt buộc

- Đây là **Zalo Official Account OpenAPI**, không phải API đăng bài lên nhật ký cá nhân.
- OA chỉ gửi được theo phạm vi quyền, chính sách và điều kiện tương tác do Zalo quy định.
- Bản hiện tại lưu token trong `localStorage` và scheduler chạy trong trình duyệt; chỉ phù hợp thử nghiệm cá nhân.
- Production phải chuyển token và tác vụ gửi sang backend, mã hóa secrets, thêm refresh-token flow, webhook, retry và audit log.

---

## 📤 Đăng Bài Tự Động (tab "Đăng bài tự động")

1. Kết nối nền tảng ở tab "Tìm khách hàng" trước (dùng chung token).
2. Sang tab "Đăng bài tự động":
   - Nhập chủ đề → bấm **"Tạo 3 phương án (template)"** để bot viết nhanh không cần API key, hoặc **"Viết bằng AI"** nếu bạn đã cấu hình API key riêng.
   - Tinh chỉnh giọng văn (trung tính/khẩn cấp/thân thiện), độ dài, mức emoji, hashtag, CTA.
   - Chọn nền tảng đăng, nhập Page ID / IG Business Account ID nếu cần.
   - Instagram bắt buộc phải có URL ảnh, TikTok bắt buộc phải có URL video (API không cho đăng bài chỉ có chữ).
   - Chọn "Đăng ngay" hoặc hẹn giờ + tần suất lặp lại, rồi lưu vào hàng đợi.
3. Bật **"Tự động đăng bài đến hạn"** để app tự kiểm tra và đăng bài đã tới giờ.

### ⚠️ Giới hạn cần biết

- **Scheduler này chạy phía trình duyệt** — chỉ hoạt động khi tab web đang mở. Muốn đăng bài đúng giờ kể cả khi tắt máy, dùng `server/scheduler-example.js` làm nền tảng để triển khai lên một server luôn chạy (VPS, Render, Railway...) với cơ sở dữ liệu thật thay vì localStorage.
- **Facebook**: cần quyền `pages_manage_posts`, chỉ đăng lên Page bạn quản lý.
- **Instagram**: cần quyền `instagram_content_publish`, bắt buộc có ảnh/video (URL công khai).
- **TikTok**: cần quyền `video.publish`; với đa số app, video được đưa vào draft/inbox để người dùng tự bấm đăng — trừ khi app của bạn được TikTok cấp quyền "Direct Post".
- **AI mode**: API key bạn nhập chỉ lưu trong state của trình duyệt, nhưng sẽ mất khi tải lại trang trừ khi bạn tự thêm lưu trữ bền hơn.

---

## ⚠️ Giới hạn quan trọng của các API

Trước khi kỳ vọng ứng dụng "tự động quét toàn bộ mạng xã hội", cần biết:

- **Facebook Graph API**: tìm Page công khai theo từ khóa cần quyền đặc biệt (Page Public Content Access) do Facebook xét duyệt riêng — không phải access token nào cũng dùng được.
- **Instagram Graph API**: không hỗ trợ tìm tài khoản công khai của người khác — chỉ đọc được dữ liệu tài khoản Business/Creator mà token thuộc về.
- **TikTok Open API**: không có endpoint tìm kiếm người dùng công khai cho ứng dụng bên thứ ba — chỉ đọc dữ liệu tài khoản đã cấp quyền OAuth.
- **Zalo OA OpenAPI**: dành cho Official Account và người dùng nằm trong phạm vi tương tác/quyền hợp lệ; không phải công cụ quét người dùng Zalo hoặc gửi hàng loạt tùy ý.

→ Ứng dụng phù hợp nhất để theo dõi và vận hành các tài khoản/trang của chính bạn, đồng thời làm nền tảng quản lý lead thủ công.

---

## 🚀 Bắt Đầu Nhanh

```bash
git clone <your-repo-url>
cd customer-finder-pro
npm install
npm start
```

Truy cập http://localhost:3000 — bạn có thể dùng ngay ở chế độ demo hoặc nhập access token tạm thời trong giao diện theo [SETUP_GUIDE.md](./SETUP_GUIDE.md).

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
│   ├── ZaloControl.jsx               # Bảng điều khiển gửi/lên lịch Zalo OA
│   ├── zalo_api.js                   # Client Zalo OA OpenAPI
│   ├── api_handler.js
│   ├── content_generator.js
│   ├── post_manager.js
│   ├── utils.js
│   ├── index.js
│   └── index.css
├── server/
│   └── scheduler-example.js
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
