# Facebook Fanpage Auto Post (Python)

Script `auto_post.py` đọc hàng đợi từ file JSON, chọn bài đầu tiên chưa đăng, gửi nội dung lên Facebook Fanpage qua Graph API và cập nhật trạng thái để tránh đăng trùng.

## 1. Cài đặt

```bash
cd scripts/facebook
python -m venv .venv
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Cài dependency:

```bash
pip install -r requirements.txt
```

## 2. Chuẩn bị dữ liệu

Sao chép file mẫu:

```bash
cp data_posts.example.json data_posts.json
```

Trên Windows PowerShell:

```powershell
Copy-Item data_posts.example.json data_posts.json
```

Mỗi phần tử cần có tối thiểu:

```json
{
  "id": "post_001",
  "content": "Nội dung bài viết",
  "is_published": false
}
```

## 3. Cấu hình biến môi trường

Không ghi token thật trực tiếp vào mã nguồn. Dùng `.env.example` làm mẫu và thiết lập biến môi trường tại máy chạy, VPS hoặc hệ thống secret manager.

Linux/macOS:

```bash
export FACEBOOK_PAGE_ID="your_page_id"
export FACEBOOK_PAGE_ACCESS_TOKEN="your_page_access_token"
export FACEBOOK_GRAPH_API_VERSION="v19.0"
export FACEBOOK_POSTS_FILE="data_posts.json"
export FACEBOOK_REQUEST_TIMEOUT="30"
```

Windows PowerShell:

```powershell
$env:FACEBOOK_PAGE_ID="your_page_id"
$env:FACEBOOK_PAGE_ACCESS_TOKEN="your_page_access_token"
$env:FACEBOOK_GRAPH_API_VERSION="v19.0"
$env:FACEBOOK_POSTS_FILE="data_posts.json"
$env:FACEBOOK_REQUEST_TIMEOUT="30"
```

## 4. Chạy thử

```bash
python auto_post.py
```

Mỗi lần chạy chỉ đăng tối đa một bài. Khi thành công, script cập nhật:

- `is_published: true`
- `facebook_post_id`

## 5. Chạy bằng Cron trên VPS Linux

Ví dụ chạy lúc 08:00 và 20:00 mỗi ngày:

```cron
0 8,20 * * * cd /opt/bot-dang-bai/scripts/facebook && /opt/bot-dang-bai/scripts/facebook/.venv/bin/python auto_post.py >> auto_post.log 2>&1
```

Nên nạp biến môi trường bằng service manager, file environment có quyền hạn chế hoặc secret manager thay vì ghi token trong crontab.

## 6. Lưu ý triển khai

- Token cần có quyền phù hợp để quản lý bài viết của Trang.
- Không commit Page Access Token lên GitHub.
- File JSON phù hợp với local/VPS đơn tiến trình. Khi chạy nhiều worker hoặc serverless, nên chuyển hàng đợi sang cơ sở dữ liệu có khóa giao dịch để tránh đăng trùng.
- Theo dõi log và exit code để phát hiện lỗi API, timeout hoặc cấu hình thiếu.
