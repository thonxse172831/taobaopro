import { useEffect, useState } from 'react'
import { RecipientFields, Stepper, recipientError } from './Checkout'
import { NumInput } from './ui'
import { vnd, orderTotals, STATUS_LABEL, normStatus } from './lib'

// Sửa toàn bộ đơn: người nhận, từng mẫu (size/màu/SL/giá), thêm/xóa mẫu, phí ship, cọc, mã vận đơn, ghi chú.
// Tổng tiền / COD tính lại ngay; hóa đơn K80 đọc từ đơn nên cũng đổi theo sau khi lưu.
export default function OrderEditor({ o, products, onClose, onSave, onCancel }) {
  const c = o.customer || {}
  const [r, setR] = useState({ name: c.name || '', phone: c.phone || '', mode: c.addressMode === 'old' ? 'old' : 'new', province: c.province || '', district: c.district || '', ward: c.ward || '', street: c.address || '' })
  const [items, setItems] = useState(() => o.items.map((i) => ({ ...i })))
  const [extra, setExtra] = useState({ shipFee: o.shipFee || 0, deposit: o.deposit || 0, note: o.note || '', cnTracking: o.cnTracking || '', cnCarrier: o.cnCarrier || '' })
  const [add, setAdd] = useState({ productId: '', size: '', color: '', qty: 1 })
  const [err, setErr] = useState('')

  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const setItem = (k, patch) => setItems((xs) => xs.map((x, j) => (j === k ? { ...x, ...patch } : x)))
  const addP = products.find((p) => p.id === add.productId)
  const addItem = () => {
    if (!addP) return
    const size = add.size || addP.sizes[0] || ''
    const color = add.color || addP.colors[0] || ''
    // Trùng mẫu + size + màu thì cộng số lượng; mẫu mới chưa có giá vốn (App tính khi lưu)
    const k = items.findIndex((i) => i.productId === addP.id && i.size === size && i.color === color)
    if (k >= 0) setItem(k, { qty: Math.min(99, items[k].qty + add.qty) })
    else setItems((xs) => [...xs, { productId: addP.id, name: addP.name, size, color, qty: add.qty, price: addP.priceVnd }])
    setAdd({ productId: '', size: '', color: '', qty: 1 })
  }

  const draft = { ...o, items, ...extra }
  const t = orderTotals(draft)
  const status = normStatus(o.status)

  const submit = (e) => {
    e.preventDefault()
    const er = recipientError(r)
    if (er) return setErr(er)
    if (!items.length) return setErr('Đơn cần ít nhất một mẫu')
    onSave({
      customer: { ...c, name: r.name.trim(), phone: r.phone.replace(/[\s.-]/g, ''), province: r.province, district: r.mode === 'old' ? r.district : '', ward: r.ward, address: r.street.trim(), addressMode: r.mode },
      items: items.map((i) => ({ ...i, qty: Math.max(1, Number(i.qty) || 1), price: Math.max(0, Number(i.price) || 0) })),
      shipFee: Math.max(0, Number(extra.shipFee) || 0), deposit: Math.max(0, Number(extra.deposit) || 0),
      note: extra.note.trim(), cnTracking: extra.cnTracking.trim(), cnCarrier: extra.cnCarrier.trim(),
    })
  }

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-box card order-editor" onSubmit={submit}>
        <div className="editor-head">
          <div>
            <h3>Sửa đơn {o.id}</h3>
            <small className="muted">{o.createdAt} · {STATUS_LABEL[status] || status}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>
        </div>

        <section className="editor-sec">
          <h4>🛍 Sản phẩm trong đơn</h4>
          <div className="edit-items">
            {items.map((i, k) => {
              const p = products.find((x) => x.id === i.productId)
              return (
                <div className="edit-item" key={k}>
                  {p?.image ? <img src={p.image} alt="" /> : <span className="chat-noimg" aria-hidden="true">🛍</span>}
                  <div className="edit-item-main">
                    <b>{i.name}</b>
                    <div className="edit-item-fields">
                      {p?.sizes?.length ? (
                        <select value={i.size} onChange={(e) => setItem(k, { size: e.target.value })} aria-label="Size">{[...new Set([i.size, ...p.sizes])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}</select>
                      ) : <input value={i.size} onChange={(e) => setItem(k, { size: e.target.value })} placeholder="Size" aria-label="Size" />}
                      {p?.colors?.length ? (
                        <select value={i.color} onChange={(e) => setItem(k, { color: e.target.value })} aria-label="Màu">{[...new Set([i.color, ...p.colors])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}</select>
                      ) : <input value={i.color} onChange={(e) => setItem(k, { color: e.target.value })} placeholder="Màu" aria-label="Màu" />}
                      <Stepper value={i.qty} onChange={(v) => setItem(k, { qty: v })} />
                      <label className="price-in">Đơn giá<NumInput value={i.price} onChange={(v) => setItem(k, { price: v })} /></label>
                    </div>
                  </div>
                  <b className="edit-item-total">{vnd(i.price * i.qty)}</b>
                  <button type="button" className="icon-btn del-item" title="Xóa mẫu này khỏi đơn" aria-label={`Xóa ${i.name}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== k))}>🗑</button>
                </div>
              )
            })}
            {!items.length && <p className="err">Đơn đang trống, hãy thêm ít nhất một mẫu.</p>}
          </div>
          <div className="add-item">
            <select value={add.productId} onChange={(e) => setAdd({ productId: e.target.value, size: '', color: '', qty: 1 })} aria-label="Chọn mẫu để thêm">
              <option value="">＋ Thêm mẫu vào đơn…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {vnd(p.priceVnd)}</option>)}
            </select>
            {addP && (
              <>
                <select value={add.size} onChange={(e) => setAdd({ ...add, size: e.target.value })} aria-label="Size">{addP.sizes.map((s) => <option key={s}>{s}</option>)}</select>
                <select value={add.color} onChange={(e) => setAdd({ ...add, color: e.target.value })} aria-label="Màu">{addP.colors.map((s) => <option key={s}>{s}</option>)}</select>
                <Stepper value={add.qty} onChange={(v) => setAdd({ ...add, qty: v })} />
                <button type="button" className="primary" onClick={addItem}>Thêm</button>
              </>
            )}
          </div>
        </section>

        <section className="editor-sec">
          <h4>👤 Người nhận</h4>
          <RecipientFields value={r} onChange={setR} />
        </section>

        <section className="editor-sec">
          <h4>📦 Thanh toán & vận chuyển</h4>
          <div className="grid3">
            <label>Phí ship (đ)<NumInput value={extra.shipFee} onChange={(v) => setExtra({ ...extra, shipFee: v })} /></label>
            <label>Tiền cọc đã nhận (đ)<NumInput value={extra.deposit} onChange={(v) => setExtra({ ...extra, deposit: v })} /></label>
            <label>Mã vận đơn TQ<input value={extra.cnTracking} onChange={(e) => setExtra({ ...extra, cnTracking: e.target.value })} /></label>
            <label>Hãng TQ<input value={extra.cnCarrier} onChange={(e) => setExtra({ ...extra, cnCarrier: e.target.value })} placeholder="YTO, ZTO, STO…" /></label>
          </div>
          <label>Ghi chú<textarea rows="2" value={extra.note} onChange={(e) => setExtra({ ...extra, note: e.target.value })} /></label>
        </section>

        <div className="editor-sum">
          <div><span>Tiền hàng ({items.reduce((n, i) => n + (Number(i.qty) || 0), 0)} sp)</span><b>{vnd(t.revenue - (Number(extra.shipFee) || 0))}</b></div>
          {Number(extra.shipFee) > 0 && <div><span>Phí ship</span><span>{vnd(extra.shipFee)}</span></div>}
          <div><span>Tổng đơn</span><b className="price">{vnd(t.revenue)}</b></div>
          <div className="muted"><span>Đã cọc</span><span>− {vnd(extra.deposit)}</span></div>
          <div><span>Thu hộ COD</span><b>{vnd(t.cod)}</b></div>
          {status === 'Chờ cọc' && <small className="muted">Đơn đang chờ cọc: số tiền cọc cần chuyển sẽ tính lại theo tổng mới.</small>}
        </div>

        {err && <p className="err">{err}</p>}
        <div className="editor-actions">
          {onCancel && status !== 'Đã hủy' && status !== 'Hoàn thành' && <button type="button" className="danger" onClick={() => onCancel(o)}>✕ Hủy đơn</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>Đóng</button>
          <button className="primary">Lưu đơn (Ctrl+S)</button>
        </div>
      </form>
    </div>
  )
}
