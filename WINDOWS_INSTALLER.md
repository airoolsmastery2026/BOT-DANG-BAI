# Cài BOT ĐĂNG BÀI trên Windows

## Yêu cầu

- Windows 10 hoặc Windows 11, kiến trúc x64.
- Không cần cài Node.js, npm hoặc trình duyệt riêng.
- Kết nối Internet khi xác minh tài khoản và đăng bài LIVE.

## Cài đặt

1. Tải file `BOT-DANG-BAI-Setup-1.0.0-x64.exe`.
2. Kiểm tra SHA-256 theo file `.sha256` đi kèm nếu tải qua Internet.
3. Mở installer, chọn thư mục cài đặt và hoàn tất trình hướng dẫn.
4. Chạy **BOT ĐĂNG BÀI** từ Desktop hoặc Start Menu.

Installer cài theo người dùng hiện tại nên thông thường không cần quyền Administrator. Có thể gỡ bằng **Settings → Apps → Installed apps**.

## Chạy nền

Nhấn nút đóng cửa sổ sẽ thu ứng dụng xuống System Tray để bộ kiểm tra lịch tiếp tục hoạt động. Nhấp đúp biểu tượng tray để mở lại. Chọn **Thoát hoàn toàn** trong menu tray nếu muốn dừng ứng dụng.

Tùy chọn **Khởi động cùng Windows** nằm trong menu tray và mặc định tắt.

## Dữ liệu và credential

- Dữ liệu giao diện, bản nháp và hàng đợi local nằm trong hồ sơ ứng dụng của người dùng Windows.
- Credential tài khoản mạng xã hội vẫn chỉ tồn tại trong phiên ứng dụng và không được đóng gói vào installer.
- Gỡ ứng dụng không tự xóa App Data nhằm tránh mất dữ liệu ngoài ý muốn.
- Publishing Worker 24/7, Telegram Control và server-side AI gateway vẫn là dịch vụ vận hành riêng; installer không nhúng các token server vào desktop app.

## Cảnh báo chữ ký Windows

Bản nội bộ hiện chưa được ký bằng chứng thư Authenticode thương mại. Windows SmartScreen có thể hiển thị **Unknown publisher**. Chỉ chạy file tải từ GitHub Release chính thức của repository và đối chiếu SHA-256. Không tắt SmartScreen trên toàn hệ thống.

## Tạo lại installer

```powershell
npm ci
npm run desktop:package
```

Artifact và checksum SHA-256 được tạo trong `release/windows/`. Quá trình nén dùng một staging directory duy nhất trong `%TEMP%`, sau đó chỉ sao chép installer đã hoàn tất về output và xóa đúng staging directory đã xác minh. GitHub workflow **Windows Installer** cũng tạo cùng installer trên runner Windows và lưu artifact 30 ngày.
