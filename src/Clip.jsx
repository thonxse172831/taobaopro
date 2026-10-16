import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import AdminGate from './AdminGate'
import { vnd } from './lib'

// Cửa sổ nhỏ do bookmarklet mở: đọc dữ liệu ở #hash và lưu vào thư viện mẫu
function ClipInner() {
  const [st, setSt] = useState({ phase: 'saving' })
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    let data
    try { data = JSON.parse(decodeURIComponent(location.hash.slice(1))) } catch { /* hash lỗi */ }
    history.replaceState(null, '', '/clip')
    if (!data) return setSt({ phase: 'err', msg: 'Không có dữ liệu. Hãy bấm bookmarklet "Lưu vào kho" từ trang sản phẩm.' })
    api('/admin/clip', { method: 'POST', body: data })
      .then((r) => { setSt({ phase: 'ok', r, img: data.images?.[0] }); setTimeout(() => window.close(), 3500) })
      .catch((e) => setSt({ phase: 'err', msg: e.message }))
  }, [])

  return (
    <div className="login">
      <div className="card login-card">
        <b className="logo">TaobaoPro</b>
        {st.phase === 'saving' && <p>Đang lưu vào kho…</p>}
        {st.phase === 'err' && <p className="err">{st.msg}</p>}
        {st.phase === 'ok' && (
          <>
            {st.img && <img src={st.img} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 14 }} />}
            <p className="ok">{st.r.duplicate ? 'Mẫu này đã có trong kho' : '✅ Đã lưu vào kho'}</p>
            <b>{st.r.name}</b>
            {!st.r.duplicate && <span>{st.r.priceCny}¥ → giá bán gợi ý {vnd(st.r.priceVnd)} · {st.r.images} ảnh</span>}
            <small className="muted">Cửa sổ sẽ tự đóng. Vào tab "Mẫu hàng" để chỉnh size, màu, danh mục.</small>
          </>
        )}
        <button onClick={() => window.close()}>Đóng</button>
      </div>
    </div>
  )
}

export default function Clip() {
  return <AdminGate>{() => <ClipInner />}</AdminGate>
}
