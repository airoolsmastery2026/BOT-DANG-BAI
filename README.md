# 🔍 Customer Finder Pro - Ứng dụng Tìm Kiếm Khách Hàng Tự Động

**Tìm kiếm và lọc khách hàng tiềm năng từ Facebook, Instagram, TikTok bằng API chính thức**

---

## 📸 Tính Năng Chính

✅ Kết nối đến 3 nền tảng mạng xã hội — Facebook, Instagram, TikTok (dùng token của chính bạn)

✅ Chế độ demo tích hợp sẵn — dùng thử giao diện ngay cả khi chưa có token thật

✅ Lọc thông minh — theo followers, engagement, từ khóa, địa điểm

✅ Match Score — chấm điểm mức độ phù hợp của từng khách hàng tiềm năng

✅ Lưu & xuất kết quả — CSV hoặc JSON

✅ Tìm kiếm tự động mỗi 5 phút (tuỳ chọn)

✅ **Bot viết bài tự động** — sinh nội dung theo chủ đề, có tinh chỉnh giọng văn/độ dài/emoji/hashtag/CTA, chọn template hoặc gọi AI (OpenAI/Anthropic bằng key của bạn)

✅ **Lên lịch đăng bài** — đăng ngay hoặc hẹn giờ, lặp lại hàng ngày/hàng tuần, đăng cùng lúc lên nhiều nền tảng

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
- **AI mode**: API key bạn nhập chỉ lưu trong state của trình duyệt (không hard-code, không gửi cho ai khác), nhưng sẽ mất khi tải lại trang trừ khi bạn tự thêm lưu trữ bền hơn.

---

## ⚠️ Giới hạn quan trọng của các API

Trước khi kỳ vọng ứng dụng "tự động quét toàn bộ mạng xã hội", cần biết:

- **Facebook Graph API**: tìm Page công khai theo từ khóa cần quyền đặc biệt (Page Public Content Access) do Facebook xét duyệt riêng — không phải access token nào cũng dùng được.
- **Instagram Graph API**: không hỗ trợ tìm tài khoản công khai của người khác — chỉ đọc được dữ liệu tài khoản Business/Creator mà token thuộc về.
- **TikTok Open API**: không có endpoint tìm kiếm người dùng công khai cho ứng dụng bên thứ ba — chỉ đọc dữ liệu tài khoản đã cấp quyền OAuth.

→ Ứng dụng phù hợp nhất để theo dõi hiệu suất tài khoản/trang của chính bạn và làm nền tảng phân tích + quản lý lead thủ công, hơn là "auto-scrape" khách hàng từ mạng xã hội của người khác.

---

## 🚀 Bắt Đầu Nhanh

```bash
git clone <your-repo-url>
cd customer-finder-pro
npm install
npm start
```

Truy cập http://localhost:3000 — bạn có thể dùng ngay ở chế độ demo (không cần token) hoặc nhập access token tạm thời trong giao diện theo [SETUP_GUIDE.md](./SETUP_GUIDE.md). File `.env.example` chỉ dành cho ví dụ scheduler backend.

---

## 📁 Cấu Trúc Dự Án

```
customer-finder-pro/
├── public/
│   └── index.html
├── src/
│   ├── App.jsx                      # Shell: tab điều hướng + state dùng chung
│   ├── AdvancedCustomerFinder.jsx   # Tab "Tìm khách hàng"
│   ├── PostScheduler.jsx            # Tab "Đăng bài tự động"
│   ├── api_handler.js               # Gọi API Facebook/Instagram/TikTok (tìm + đăng bài)
│   ├── content_generator.js         # Bot viết bài (template + AI mode tuỳ chọn)
│   ├── post_manager.js              # Hàng đợi lịch đăng + auto-publish
│   ├── utils.js                     # Hàm tiện ích (lưu, lọc, xuất...)
│   ├── index.js
│   └── index.css
├── server/
│   └── scheduler-example.js         # Ví dụ backend cron cho auto-post luôn chạy nền
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
