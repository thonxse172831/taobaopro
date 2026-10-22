import { useMemo } from 'react'
import { NumInput } from './ui'
import { BANKS, DEFAULT_SHOP, DEPOSIT_TTL_HOURS, depositEnabled } from './lib'
import { bookmarkletHref } from './clipper'
import { copyText } from './Kanban'

export default function ShopSettings({ shop, setShop, notify }) {
  const s = { ...DEFAULT_SHOP, ...shop }
  const set = (patch) => setShop({ ...s, ...patch })
  const href = useMemo(() => bookmarkletHref(location.origin), [])

  const copyBm = async () => notify(await copyText(href) ? 'Đã copy bookmarklet' : 'Trình duyệt chặn clipboard')

  return (
    <div className="grid2 top">
      <div className="card">
        <h3>Thông tin cửa hàng & ngân hàng nhận tiền</h3>
        <div className="grid2" style={{ gap: 12 }}>
          <label>Tên shop<input value={s.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label>SĐT shop<input value={s.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
          <label>Ngân hàng
            <select value={s.bankBin} onChange={(e) => set({ bankBin: e.target.value })}>{BANKS.map(([b, n]) => <option key={b} value={b}>{n}</option>)}</select>
          </label>
          <label>Số tài khoản<input inputMode="numeric" value={s.bankAccount} onChange={(e) => set({ bankAccount: e.target.value.replace(/\D/g, '') })} /></label>
          <label>Chủ tài khoản<input value={s.bankHolder} onChange={(e) => set({ bankHolder: e.target.value.toUpperCase() })} /></label>
          <label>Tỷ lệ cọc mặc định (%)<NumInput value={s.depositPct} onChange={(v) => set({ depositPct: Math.min(100, v) })} /></label>
        </div>
        <small className="muted">Thông tin ngân hàng dùng để tạo mã QR VietQR trên hóa đơn K80 (số tiền COD còn thiếu).</small>
        <p className="deposit-note" style={{ marginTop: 12 }}>
          {depositEnabled(s)
            ? <>💳 <b>Đang bật cọc trước {s.depositPct}%</b>: khách đặt trên trang shop sẽ thấy QR chuyển khoản, đơn nằm ở cột "Chờ cọc" đến khi tiền về (quá {DEPOSIT_TTL_HOURS} giờ tự hủy).</>
            : <>💳 Nhập số tài khoản và tỷ lệ cọc &gt; 0 để bắt khách chuyển cọc trước khi đặt đơn thành công.</>}
          <br /><small>Tự xác nhận tiền về: tạo webhook tại SePay với URL <code>{location.origin}/api/webhook/sepay</code>, chứng thực "API Key" trùng biến <code>SEPAY_API_KEY</code> trên máy chủ.</small>
        </p>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h3>🔖 Lưu mẫu 1 chạm từ Taobao / 1688 / Pinduoduo</h3>
        <ol>
          <li>Kéo nút bên dưới lên thanh dấu trang (bookmarks bar) của trình duyệt. Nếu không kéo được, bấm "Copy bookmarklet" rồi tạo dấu trang mới và dán vào ô URL.</li>
          <li>Mở trang sản phẩm bất kỳ, bấm dấu trang <b>Lưu vào kho</b>.</li>
          <li>Hệ thống đọc tên, giá tệ, ảnh nét nhất và đưa thẳng vào "Mẫu hàng" (không cần tải ảnh, không cần gõ tay). Lần đầu cần đăng nhập admin trong cửa sổ nhỏ hiện ra.</li>
        </ol>
        <div className="row">
          <a className="bookmarklet" ref={(el) => el && el.setAttribute('href', href)} onClick={(e) => e.preventDefault()}>➕ Lưu vào kho</a>
          <button type="button" onClick={copyBm}>Copy bookmarklet</button>
        </div>
        <small className="muted">Bookmarklet khó dùng trên điện thoại; trên điện thoại hãy thêm link ở tab "Link đã lưu".</small>
      </div>
    </div>
  )
}
