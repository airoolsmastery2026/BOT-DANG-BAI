# One-Click Campaign Skill

## Name
one-click-campaign

## Purpose
Nhận một câu lệnh tiếng Việt và điều phối toàn bộ quy trình tạo chiến dịch, chuẩn bị nội dung, chuẩn bị media, kiểm tra, lưu bản nháp hoặc chuyển sang trạng thái sẵn sàng lên lịch.

## Trigger
Khi người dùng bấm **Chạy toàn bộ chiến dịch** hoặc gọi Campaign Orchestrator.

## Required context
Đọc các file trong `skills/context/` theo thứ tự:
1. `brand-guideline.md`
2. `customer-persona.md`
3. `marketing-channels.md`
4. `product-catalog.md`

Nếu context còn là mẫu trống, chỉ được dùng mặc định an toàn và phải ghi cảnh báo vào kết quả.

## Input
- `command`: câu lệnh chiến dịch, bắt buộc.
- `publishAt`: thời gian đăng đầu tiên, bắt buộc trước bước scheduling.
- `mode`: `review` hoặc `automatic`.
- `platforms`: tùy chọn ghi đè suy luận.
- `mediaTypes`: tùy chọn ghi đè suy luận.
- `timezone`: mặc định `Asia/Ho_Chi_Minh`.

## Output
- `runId`
- `campaignId`
- trạng thái run
- workflow chuẩn hóa
- nội dung riêng theo nền tảng
- danh sách media jobs
- readiness result
- log từng bước
- metrics

## Pipeline
1. Validate command.
2. Analyze intent.
3. Build campaign workflow.
4. Generate platform content.
5. Prepare image/video jobs.
6. Validate readiness.
7. Persist checkpoint.
8. Dừng ở `waiting_approval` với chế độ review.
9. Chuyển `ready` với chế độ automatic khi mọi điều kiện đạt.

## Hard rules
- Không đăng nếu thiếu content, media bắt buộc, lịch hoặc kết nối nền tảng.
- Không lưu access token trong frontend production.
- Không tạo tác vụ trùng khi có cùng `campaignId`, nội dung, nền tảng và thời gian.
- Lựa chọn rõ ràng của người dùng luôn ưu tiên hơn suy luận.
- Một nền tảng lỗi không được làm mất kết quả của nền tảng khác.
- Mọi tác vụ phải mang `campaignId`, `runId` và `idempotencyKey`.
- Orchestrator chỉ điều phối; logic chuyên môn nằm trong engine/skill tương ứng.

## Failure behavior
- Đánh dấu đúng step bị lỗi.
- Trả lại toàn bộ `campaignRun` để UI hiển thị và có thể tiếp tục.
- Không tự bỏ qua lỗi validation.
- Không tự đăng lại vô hạn.

## Acceptance criteria
- Một câu lệnh hợp lệ tạo được workflow đa nền tảng.
- Nội dung từng nền tảng không rỗng.
- Media jobs có template và output size.
- Review mode kết thúc ở `waiting_approval`.
- Automatic mode hợp lệ kết thúc ở `ready`.
- Chạy lại cùng input không tạo bản ghi publish trùng.
