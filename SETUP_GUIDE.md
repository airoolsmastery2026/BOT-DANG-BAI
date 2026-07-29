# 🚀 Hướng dẫn Cấu hình - Customer Finder Pro

## 1. Facebook Graph API
1. Tạo app tại developers.facebook.com (loại Business).
2. Vào Graph API Explorer, lấy Page Access Token với quyền `pages_read_engagement`, `pages_read_user_content`.
3. Lưu ý: tìm Page công khai theo từ khóa cần Facebook duyệt quyền "Page Public Content Access" riêng — hầu hết app mới sẽ không có sẵn quyền này.

## 2. Instagram Graph API
1. Bật Instagram Graph API trong app Facebook của bạn.
2. Kết nối với Instagram Business/Creator Account.
3. Dùng cùng access token với Facebook.
4. API chỉ đọc được dữ liệu tài khoản mà token thuộc về — không tìm được tài khoản người khác.

## 3. TikTok Open API
1. Đăng ký tại developer.tiktok.com, tạo app Web.
2. Cấu hình OAuth Redirect URI, lấy Client Key/Secret.
3. Thực hiện OAuth flow để lấy access token của tài khoản đã cấp quyền.
4. API không hỗ trợ tìm kiếm người dùng công khai cho app bên thứ ba.

## 4. Cài đặt ứng dụng

```bash
git clone <your-repo-url>
cd customer-finder-pro
npm install
npm start
```

## 5. Bảo mật

- Không commit `.env` (đã có trong `.gitignore`).
- Không hard-code token trong code.
- Không đặt Client Secret trong biến `REACT_APP_*`: Create React App sẽ đóng gói giá trị này vào mã JavaScript công khai. OAuth Client Secret phải nằm ở backend.
- Token/API key nhập trong giao diện được gửi trực tiếp từ trình duyệt tới nhà cung cấp và chỉ phù hợp để thử nghiệm nội bộ. Bản production nên chuyển các lệnh API qua backend bảo mật.
- Refresh token định kỳ (Facebook/Instagram: ~60 ngày, TikTok: theo cấu hình app).

## 6. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Invalid access token` | Token hết hạn | Lấy token mới |
| `(#17) User request limit exceeded` | Vượt rate limit | Giảm tần suất tìm kiếm |
| `Insufficient permission` | Thiếu quyền | Kiểm tra App Roles/Permissions |
| `Failed to fetch` | Lỗi mạng/CORS | Kiểm tra kết nối, firewall |
