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
| Webhook vận chuyển | `POST /api/webhook/{ghn,spx,jt,viettelpost}` kèm `?secret=` hoặc header `x-webhook-secret` |

Giá bán, giá vốn của đơn khách luôn do server tính lại từ dữ liệu mẫu (không tin giá khách gửi).

## Chạy local
```
npm install
npm run dev        # web http://localhost:5173 + api http://localhost:3000 (mật khẩu dev: admin123)
```

## Triển khai
Sao chép `.env.example` thành `.env`, đặt `ADMIN_PASSWORD`, `SESSION_SECRET`, `WEBHOOK_SECRET`.

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
