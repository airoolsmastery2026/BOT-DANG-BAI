# AI Production OS — BOT ĐĂNG BÀI

## Mục tiêu

Tổ chức AI theo từng hạng mục sản xuất nội dung thay vì sử dụng một prompt lớn cho toàn bộ quy trình.

## Nguồn tham khảo

- Postiz Agent: mô hình skill cho agent, đầu ra có cấu trúc và thao tác qua API/CLI.
- Mixpost AI Assistant: global instructions, brand voice theo workspace và nhiều AI provider.
- Shoutrrr: nội dung tùy chỉnh theo nền tảng, character count, hàng đợi và retry độc lập.

Không sao chép nguyên văn tệp AGPL từ Postiz. Bộ quy tắc này được viết riêng cho BOT ĐĂNG BÀI và nhận diện Đại Hải Phát.

## Chuỗi sản xuất

1. AI Strategy Lead — xây dựng brief, trụ cột nội dung và KPI.
2. AI Researcher — nghiên cứu, kiểm chứng dữ liệu và xác định rủi ro.
3. AI Copywriter — viết nội dung gốc theo brand voice.
4. AI Channel Editor — chuyển thể riêng cho từng nền tảng.
5. AI Creative Producer — tạo brief, prompt ảnh/video và kích thước xuất bản.
6. AI Brand & QA Reviewer — kiểm tra thương hiệu, chính tả, thông tin và liên kết.
7. Human Approver — quyết định duyệt, trả lại hoặc từ chối.
8. AI Publishing Operator — preflight, lập lịch, xuất bản, retry và dead-letter.
9. AI Performance Analyst — đo lường, rút kinh nghiệm và cập nhật memory.

## Hợp đồng đầu ra

Mỗi công đoạn phải trả về:

- `status`: draft | needs_review | approved | rejected | failed
- `summary`: mô tả ngắn kết quả
- `artifacts`: danh sách đầu ra
- `risks`: dữ liệu cần xác minh hoặc nguy cơ vi phạm
- `nextStage`: công đoạn tiếp theo
- `humanActionRequired`: true | false

## Nguyên tắc an toàn vận hành

- Không tự động đăng khi chưa qua QA và phê duyệt.
- Không đặt token hoặc API key trong prompt, frontend hoặc log công khai.
- Không để LLM tự điều khiển thứ tự workflow; application code quản lý trạng thái và chuyển bước.
- Không sử dụng thông tin kỹ thuật, giá hoặc cam kết chưa được xác minh.
- Mỗi nền tảng có bản nội dung riêng và kết quả đăng độc lập.
- Lỗi một nền tảng không được đăng lại trên nền tảng đã thành công.

## Nhận diện giao diện

- Nền chính: navy đậm.
- Điểm nhấn: vàng kim.
- Font: Inter.
- Card: viền mảnh, ít gradient, khoảng trắng rõ ràng.
- Ưu tiên mobile, khả năng đọc và trạng thái vận hành.
