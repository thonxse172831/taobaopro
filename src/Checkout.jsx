import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { AddressPicker, EMPTY_ADDR, addrError } from './address'
import DepositPay from './Deposit'
import { cartLines } from './cart'
import { vnd, depositOf, fullAddress, STOCK_STATUS, ETA } from './lib'

const PHONE_RE = /^0\d{9}$/

// Chọn size / màu / số lượng trước khi cho vào giỏ
// mode 'buy': nút chính là "Đặt hàng ngay" (chuyển sang giỏ); 'cart': nút chính là "Thêm vào giỏ"
export function ProductPicker({ product: p, onAdd, onClose, mode = 'cart' }) {
  const [size, setSize] = useState(p.sizes[0] || '')
  const [color, setColor] = useState(p.colors[0] || '')
  const [qty, setQty] = useState(1)

  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  const add = (buyNow) => onAdd({ productId: p.id, size, color, qty }, buyNow)
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box card picker" role="dialog" aria-label={`Chọn phân loại ${p.name}`}>
        <div className="picker-head">
          {p.image ? <img src={p.image} alt="" /> : <div className="chat-noimg" aria-hidden="true">🛍</div>}
          <div>
            <b>{p.name}</b>
            <span className="price">{vnd(p.priceVnd)}</span>
            <small className="muted">{STOCK_STATUS[p.status]} · nhận hàng {ETA[p.status]}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        {p.sizes.length > 0 && (
          <>
            <h4>Size</h4>
            <div className="chips">{p.sizes.map((s) => <button key={s} type="button" className={s === size ? 'on' : ''} onClick={() => setSize(s)}>{s}</button>)}</div>
          </>
        )}
        {p.colors.length > 0 && (
          <>
            <h4>Màu</h4>
            <div className="chips">{p.colors.map((c) => <button key={c} type="button" className={c === color ? 'on' : ''} onClick={() => setColor(c)}>{c}</button>)}</div>
          </>
        )}
        <h4>Số lượng</h4>
        <Stepper value={qty} onChange={setQty} />
        <div className="row picker-actions">
          {mode === 'buy' ? (
            <>
              <button type="button" onClick={() => add(false)}>🛒 Thêm vào giỏ</button>
              <button type="button" className="primary" onClick={() => add(true)}>Đặt hàng ngay · {vnd(p.priceVnd * qty)}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => add(true)}>Đặt hàng ngay</button>
              <button type="button" className="primary" onClick={() => add(false)}>🛒 Thêm vào giỏ · {vnd(p.priceVnd * qty)}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function Stepper({ value, onChange, min = 1, max = 99 }) {
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Giảm">−</button>
      <input inputMode="numeric" value={value} aria-label="Số lượng" onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min) }} />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Tăng">+</button>
    </span>
  )
}

// Ô người nhận + địa chỉ, dùng chung cho thanh toán và sổ địa chỉ
export function RecipientFields({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <div className="grid2" style={{ gap: 12 }}>
        <label>Người nhận *<input required autoComplete="name" value={value.name} onChange={set('name')} /></label>
        <label>SĐT *<input required type="tel" inputMode="tel" autoComplete="tel" pattern="0\d{9}" title="SĐT 10 số bắt đầu bằng 0" value={value.phone} onChange={set('phone')} /></label>
      </div>
      <AddressPicker value={value} onChange={(a) => onChange({ ...value, ...a })} />
    </>
  )
}

export const EMPTY_RECIPIENT = { name: '', phone: '', ...EMPTY_ADDR }
export const recipientError = (r) => (!r.name.trim() ? 'Vui lòng nhập tên người nhận' : !PHONE_RE.test(r.phone.replace(/[\s.-]/g, '')) ? 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)' : addrError(r))
export const addrText = (a) => fullAddress({ address: a.street, ward: a.ward, district: a.district, province: a.province })

// Giỏ hàng + thông tin nhận hàng + gửi đơn; sau đó hiện màn chuyển cọc / đặt thành công
export function Checkout({ products, cart, depositPct, user, setUser, loaded = true }) {
  const lines = cartLines(cart.cart, products)
  const saved = user?.addresses || []
  const [addrId, setAddrId] = useState('')
  const [form, setForm] = useState(EMPTY_RECIPIENT)
  const [save, setSave] = useState(true)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  // Mặc định giao tới địa chỉ mặc định trong sổ; khách mới thì điền sẵn tên + SĐT tài khoản
  const pickedId = addrId || saved.find((a) => a.isDefault)?.id || saved[0]?.id || 'new'
  const picked = saved.find((a) => a.id === pickedId)
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name || '', phone: f.phone || user.phone || '' }))
  }, [user])

  const total = lines.reduce((s, l) => s + l.p.priceVnd * l.qty, 0)
  const deposit = depositPct > 0 ? depositOf(total, depositPct) : 0
  const onPaid = useCallback((r) => setDone((d) => d && { ...d, payment: null, deposit: r.deposit }), [])

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !lines.length) return
    const r = picked || form
    const er = recipientError(r)
    if (er) return setErr(er)
    setErr('')
    setBusy(true)
    try {
      const customer = { name: r.name.trim(), phone: r.phone.replace(/[\s.-]/g, ''), province: r.province, district: r.district, ward: r.ward, address: r.street.trim(), addressMode: r.mode }
      const res = await api('/public/orders', { method: 'POST', body: { customer, note: note.trim(), items: lines.map((l) => ({ productId: l.productId, size: l.size, color: l.color, qty: l.qty })) } })
      // Lưu địa chỉ mới vào sổ để lần sau chỉ cần bấm đặt
      if (user && !picked && save) {
        const addresses = [...saved, { ...form, name: form.name.trim(), phone: customer.phone, label: '', isDefault: !saved.length }]
        api('/me/profile', { method: 'PUT', body: { name: user.name, phone: user.phone, addresses } }).then((x) => setUser(x.user)).catch(() => {})
      }
      setDone({
        id: res.id, trackCode: res.trackCode, payment: res.payment, deposit: 0, total, customerName: customer.name,
        items: lines.map((l) => ({ name: l.p.name, image: l.p.image, size: l.size, color: l.color, qty: l.qty, price: l.p.priceVnd })),
      })
      cart.clear()
      setNote('')
      document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (x) {
      setErr(x.message || 'Không gửi được đơn, vui lòng thử lại')
    } finally {
      setBusy(false)
    }
  }

  if (done?.payment) return <OrderPay done={done} onPaid={onPaid} />
  if (done) return <OrderDone done={done} onAgain={() => location.assign('/order')} user={user} />
  if (!loaded) {
    return (
      <div className="card checkout skeleton" aria-busy="true">
        <div className="sk line short" /><div className="sk btn" /><div className="sk btn" /><div className="sk line" />
      </div>
    )
  }

  return (
    <form className="card checkout" id="checkout" onSubmit={submit}>
      <h3>🛒 Giỏ hàng {lines.length > 0 && <span className="muted">({cart.count} sản phẩm)</span>}</h3>
      {!lines.length && (
        <div className="cart-empty">
          <span className="cart-empty-icon" aria-hidden="true">🛒</span>
          <p>Giỏ hàng đang trống</p>
          <a className="btn-link primary-link" href="/order">Khám phá mẫu hàng →</a>
        </div>
      )}
      {lines.length < cart.cart.length && <p className="err">Một số mẫu trong giỏ đã ngừng bán và được bỏ ra.</p>}
      <ul className="cart-list">
        {lines.map((l) => (
          <li key={l.i} className="cart-line">
            {l.p.image ? <img src={l.p.image} alt="" /> : <div className="chat-noimg" aria-hidden="true">🛍</div>}
            <div className="cart-info">
              <b>{l.p.name}</b>
              <small className="muted">{[l.size, l.color].filter(Boolean).join(' · ')}</small>
              <span className="price">{vnd(l.p.priceVnd * l.qty)}</span>
            </div>
            <div className="cart-ctl">
              <Stepper value={l.qty} onChange={(q) => cart.setQty(l.i, q)} />
              <button type="button" className="link-btn" onClick={() => cart.remove(l.i)}>Xóa</button>
            </div>
          </li>
        ))}
      </ul>

      {lines.length > 0 && (
        <>
          <h4>Giao tới</h4>
          {!user && <p className="muted login-hint"><a href="/account">Đăng nhập / Đăng ký</a> để lưu địa chỉ và theo dõi mọi đơn hàng của bạn.</p>}
          {saved.length > 0 && (
            <div className="addr-pick">
              {saved.map((a) => (
                <label key={a.id} className={'addr-card' + (pickedId === a.id ? ' on' : '')}>
                  <input type="radio" name="addr" checked={pickedId === a.id} onChange={() => setAddrId(a.id)} />
                  <span><b>{a.name}</b> · {a.phone}{a.label && <span className="tag">{a.label}</span>}{a.isDefault && <span className="tag">Mặc định</span>}<br /><small className="muted">{addrText(a)}</small></span>
                </label>
              ))}
              <label className={'addr-card' + (pickedId === 'new' ? ' on' : '')}>
                <input type="radio" name="addr" checked={pickedId === 'new'} onChange={() => setAddrId('new')} />
                <span>➕ Giao tới địa chỉ khác</span>
              </label>
            </div>
          )}
          {pickedId === 'new' && (
            <>
              <RecipientFields value={form} onChange={setForm} />
              {user && <label className="check"><span><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Lưu địa chỉ này vào tài khoản</span></label>}
            </>
          )}
          <label>Ghi chú cho shop<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="VD: giao giờ hành chính, gọi trước khi giao…" /></label>

          <div className="cart-sum">
            <div><span>Tạm tính</span><b className="price">{vnd(total)}</b></div>
            {deposit > 0 && <div><span>Cọc trước {depositPct}% (chuyển khoản)</span><b>{vnd(deposit)}</b></div>}
            {deposit > 0 && <div className="muted"><span>Trả khi nhận hàng</span><span>{vnd(total - deposit)}</span></div>}
          </div>
          {err && <p className="err">{err}</p>}
          <button className="primary checkout-btn" disabled={busy}>{busy ? 'Đang gửi…' : deposit > 0 ? `Đặt hàng & chuyển cọc ${vnd(deposit)}` : `Đặt hàng · ${vnd(total)}`}</button>
        </>
      )}
    </form>
  )
}

function OrderPay({ done, onPaid }) {
  return (
    <section className="card order-pay" id="checkout" aria-labelledby="order-pay-title">
      <span className="success-eyebrow">BƯỚC CUỐI · CHUYỂN KHOẢN CỌC</span>
      <h2 id="order-pay-title">Chuyển cọc {vnd(done.payment.amount)} để hoàn tất đơn {done.id}</h2>
      <p className="success-copy">Đơn sẽ được xác nhận tự động ngay khi shop nhận được tiền cọc. Phần còn lại ({vnd(Math.max(0, done.total - done.payment.amount))}) thanh toán khi nhận hàng.</p>
      <DepositPay payment={done.payment} trackCode={done.trackCode} onPaid={onPaid} />
      {done.trackCode && <a className="success-again" href={`/track/${done.trackCode}`}>Để sau — xem đơn & chuyển khoản tại trang theo dõi</a>}
    </section>
  )
}

function OrderDone({ done, onAgain, user }) {
  return (
    <section className="card order-success" id="checkout" aria-labelledby="order-success-title" role="status">
      <div className="success-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" />
          <path d="m14 24 7 7 14-15" />
        </svg>
      </div>
      <span className="success-eyebrow">ĐẶT HÀNG THÀNH CÔNG</span>
      <h2 id="order-success-title">Cảm ơn {done.customerName}!</h2>
      <p className="success-copy">
        {done.deposit > 0
          ? <>Shop đã nhận tiền cọc <b>{vnd(done.deposit)}</b>, đơn hàng đã được xác nhận và đang chờ shop xử lý.</>
          : 'Shop đã nhận được đơn hàng của bạn và sẽ sớm liên hệ để xác nhận.'}
      </p>

      <div className="success-order-id">
        <span>Mã đơn hàng</span>
        <strong>{done.id}</strong>
      </div>

      {done.items.map((i, k) => (
        <div className="success-item" key={k}>
          {i.image ? <img src={i.image} alt="" /> : <div className="success-item-placeholder" aria-hidden="true">🛍️</div>}
          <div className="success-item-info">
            <strong>{i.name}</strong>
            <span>{[i.size, i.color].filter(Boolean).join(' · ')} · SL {i.qty}</span>
          </div>
          <strong className="success-total">{vnd(i.price * i.qty)}</strong>
        </div>
      ))}
      {done.items.length > 1 && <p className="success-copy">Tổng cộng: <b>{vnd(done.total)}</b></p>}

      <div className="success-next">
        <span className="success-next-icon" aria-hidden="true">💬</span>
        <p><strong>Tiếp theo</strong><br />Nhân viên sẽ gọi xác nhận đơn qua số điện thoại bạn đã cung cấp.</p>
      </div>

      <div className="success-actions">
        {done.trackCode && (
          <a className="success-track" href={`/track/${done.trackCode}`}>
            Theo dõi đơn hàng <span aria-hidden="true">→</span>
          </a>
        )}
        {user && <a className="success-again" href="/account">Đơn hàng của tôi</a>}
        <button type="button" className="success-again" onClick={onAgain}>Tiếp tục mua sắm</button>
      </div>
    </section>
  )
}
