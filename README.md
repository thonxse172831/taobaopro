# TaobaoPro

Hệ thống bán hàng order Taobao/1688/Pinduoduo: trang quản trị (đăng nhập), trang khách `#/shop`, backend Node + MongoDB Atlas.

## Kiến trúc
- **Frontend**: Vite + React (`src/`), build ra `dist/`.
- **Backend**: Express (`server/`), lưu dữ liệu trên MongoDB Atlas (đặt `MONGODB_URI`, tuỳ chọn `MONGODB_DB`; nhớ thêm IP máy chủ vào Network Access của Atlas).
- Một tiến trình duy nhất vừa phục vụ giao diện vừa phục vụ `/api`.

| Nhóm | Endpoint |
|---|---|
| Khách | `GET /api/public/catalog`, `POST /api/public/orders`, `GET /api/public/orders/:id?phone=` |
| Admin (cần đăng nhập) | `/api/auth/*`, `/api/admin/events` (SSE realtime), `/api/admin/state`, `/api/admin/orders` |
| Webhook SePay (tiền cọc) | `POST /api/webhook/sepay` kèm header `Authorization: Apikey <SEPAY_API_KEY>` |
| Webhook vận chuyển | `POST /api/webhook/{ghn,spx,jt,viettelpost}` kèm `?secret=` hoặc header `x-webhook-secret` |

Giá bán, giá vốn của đơn khách luôn do server tính lại từ dữ liệu mẫu (không tin giá khách gửi).

## Tính năng Zero-Touch

- **Smart Paste**: dán 1 dòng địa chỉ vào form đơn mới (admin) để tự tách tên, SĐT, tỉnh, huyện, xã.
- **Lưu vào kho 1 chạm**: tab "Cửa hàng" có bookmarklet; kéo vào thanh bookmark, bấm khi đang xem sản phẩm Taobao/1688/Pinduoduo (cần đăng nhập `/admin` trước).
- **Mã vận đơn TQ**: copy mã YT/SF/ZTO/STO... hệ thống gợi ý gán vào đơn đang chờ.
- **Kanban + Layout**: kéo thả trạng thái, lưu nhiều layout; thẻ "Đã mua" quá 5 ngày chuyển đỏ.
- **Hotkeys**: Ctrl+S lưu, Ctrl+F tìm khách, Ctrl+N hoặc Alt+N đơn mới.
- **Theo dõi đơn cho khách**: `/track/MÃ`.
- **Tìm kiếm sản phẩm bằng ảnh**: khách chọn ảnh hoặc kéo thả trên trang shop; so khớp ngay trong trình duyệt với ảnh catalog (chịu được ảnh chụp màn hình, cắt viền, đổi độ sáng), không tải ảnh khách lên server. Ảnh mẫu ở domain ngoài được đọc qua `GET /api/public/img/:id`.
- **Tài khoản khách & giỏ hàng**: khách đăng ký tại `/account` bằng SĐT + mật khẩu (có captcha chữ + số do server tạo, dùng một lần, hết hạn 5 phút) để lưu sổ địa chỉ (tối đa 10, có địa chỉ mặc định), xem "Đơn của tôi", "Mua lại", đổi mật khẩu. Trang shop có giỏ hàng (lưu trong trình duyệt) để đặt nhiều mẫu/size/màu trong một đơn; khách vãng lai vẫn đặt được, khách đã đăng nhập chỉ cần chọn địa chỉ đã lưu.
- **Cọc trước bằng chuyển khoản**: khi tab "Cửa hàng" có số tài khoản và tỷ lệ cọc > 0, khách đặt xong sẽ thấy QR VietQR (nội dung CK = mã đơn). Đơn nằm ở cột "Chờ cọc"; SePay báo tiền về thì đơn tự chuyển sang "Chờ đặt hàng" và hiện thông báo ở admin. Quá 24 giờ chưa cọc thì tự hủy (tiền về muộn vẫn khôi phục đơn). Giao dịch ghi sai nội dung hiện ở bảng "Tiền cọc chuyển khoản" để gán tay. Cấu hình SePay: Webhook URL `https://tenmien.com/api/webhook/sepay`, chứng thực API Key = `SEPAY_API_KEY`.
- **Câu chốt đơn, Bill K80 + QR VietQR**, **quét mã vạch bằng camera** (cần HTTPS) và PWA (cài lên điện thoại).

## Chạy local
```
npm install
npm run dev        # web http://localhost:5173 + api http://localhost:3000 (admin: thanhngancao / test123)
```

## Triển khai
Sao chép `.env.example` thành `.env`, đặt `ADMIN_PASSWORD` (đổi mật khẩu tài khoản admin `thanhngancao`, tuỳ chọn `ADMIN_USER`), `SESSION_SECRET`, `WEBHOOK_SECRET`.

**Docker (khuyến nghị)**
```
docker compose up -d --build
```
Dữ liệu nằm trên MongoDB Atlas (dùng chức năng backup của Atlas). Đặt sau Nginx/Caddy/Cloudflare để có HTTPS.

**Không dùng Docker (VPS/Render/Railway)**
```
npm ci && npm run build
NODE_ENV=production npm start
```
Không cần ổ đĩa bền vững; đặt `TRUST_PROXY=1` khi đứng sau reverse proxy.

Webhook GHN: cấu hình `https://tenmien.com/api/webhook/ghn?secret=<WEBHOOK_SECRET>`; mã vận đơn gửi trong `OrderCode`, trạng thái trong `status`.

## Lưu ý
- Tạo vận đơn thật với GHN/SPX/J&T/Viettel Post và lấy giá thật từ Taobao hiện vẫn ở chế độ giả lập, cần khoá API/dịch vụ riêng của bạn.
- Chat tư vấn là bot theo luật, không phải AI.
