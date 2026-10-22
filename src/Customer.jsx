import { useCallback, useEffect, useRef, useState } from 'react'
import DepositPay from './Deposit'
import { vnd, uid, today, depositOf, STOCK_STATUS, ETA } from './lib'
import { AddressPicker, EMPTY_ADDR, addrError, useVnData } from './address'
import { smartParse } from './smartpaste'

const MAX_CARDS = 6

// Bot tư vấn theo luật: tìm mẫu theo tên/tag, trả lời giá, size, thời gian nhận hàng.
// Trả về { text, products } — products là các mẫu hiển thị kèm ảnh + nút đặt hàng
export function reply(text, products) {
  const t = text.toLowerCase()
  const hits = products.filter((p) => t.includes(p.name.toLowerCase()) ||
    p.tags.some((g) => t.includes(g.toLowerCase())) || t.includes(p.category.toLowerCase()))
  const show = hits.slice(0, MAX_CARDS)
  if (/(chào|hello|hi\b|xin chào)/.test(t) && !hits.length) return { text: 'Chào bạn! Mình có thể tư vấn mẫu, giá, size và thời gian nhận hàng. Bạn quan tâm mẫu nào ạ?', products: [] }
  if (/(đặt|mua|order)/.test(t)) {
    return show.length
      ? { text: 'Bạn bấm "Đặt hàng" ở mẫu bên dưới, điền thông tin nhận hàng là xong ạ. Shop sẽ xác nhận trong ít phút.', products: show }
      : { text: 'Bạn điền form "Đặt hàng" nhé, shop sẽ xác nhận trong ít phút. Cọc trước để giữ hàng giúp nhận nhanh hơn ạ.', products: [] }
  }
  if (/(ship|vận chuyển|phí|bao lâu|khi nào|giao)/.test(t) && !hits.length) return { text: 'Hàng sẵn kho giao 1-3 ngày, hàng đang về 3-7 ngày, hàng ở kho TQ 10-15 ngày. Có thu hộ COD sau khi cọc ạ.', products: [] }
  if (/(cọc|cod|thanh toán)/.test(t) && !hits.length) return { text: 'Shop nhận cọc trước, phần còn lại khách thanh toán khi nhận hàng (COD).', products: [] }
  if (hits.length === 1) {
    const p = hits[0]
    return {
      text: `${p.name}: ${vnd(p.priceVnd)}. Size: ${p.sizes.join(', ')}. Màu: ${p.colors.join(', ')}. Hiện ${STOCK_STATUS[p.status].toLowerCase()}, nhận hàng ${ETA[p.status]}${p.stock ? '' : ' (tạm hết, cần đặt trước)'}.`,
      products: show,
    }
  }
  if (hits.length > 1) return { text: `Shop có ${hits.length} mẫu phù hợp, bạn xem và bấm "Đặt hàng" nhé:`, products: show }
  if (/(giá|bao nhiêu|mẫu|có gì|hot)/.test(t)) {
    const hot = /hot/.test(t) ? products.filter((p) => p.tags.some((g) => /hot/i.test(g))) : []
    const list = (hot.length ? hot : products).slice(0, MAX_CARDS)
    if (!list.length) return { text: 'Shop đang cập nhật mẫu mới, bạn quay lại sau nhé!', products: [] }
    return { text: hot.length ? 'Mẫu đang hot của shop đây ạ 🔥' : 'Mẫu đang có của shop đây ạ:', products: list }
  }
  return { text: 'Mình chưa rõ ý bạn. Bạn thử hỏi tên mẫu, giá, size hoặc thời gian giao hàng nhé!', products: [] }
}

const QUICK = ['Có mẫu nào hot không?', 'Thời gian giao hàng?', 'Thanh toán thế nào?']

function ChatProduct({ p, onBuy }) {
  return (
    <div className="chat-product">
      {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="chat-noimg" aria-hidden="true">🛍</div>}
      <div className="chat-product-info">
        <b>{p.name}</b>
        <span className="price">{vnd(p.priceVnd)}</span>
        <small className="muted">{STOCK_STATUS[p.status]} · {ETA[p.status]}</small>
      </div>
      {onBuy && <button type="button" className="primary" onClick={() => onBuy(p.id)}>Đặt hàng</button>}
    </div>
  )
}

// onBuy(productId): khi khách bấm "Đặt hàng" trên thẻ mẫu trong khung chat
export function ChatBox({ products, onBuy }) {
  const [msgs, setMsgs] = useState([{ from: 'bot', text: 'Xin chào! Bạn cần tư vấn mẫu nào ạ?' }])
  const [input, setInput] = useState('')
  const box = useRef(null)
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [msgs])

  const ask = (text) => {
    if (!text.trim()) return
    const r = reply(text, products)
    setMsgs((m) => [...m, { from: 'me', text }, { from: 'bot', text: r.text, ids: r.products.map((p) => p.id) }])
    setInput('')
  }
  return (
    <div className="card chat">
      <h3>💬 Tư vấn tự động</h3>
      <div className="msgs" ref={box}>
        {msgs.map((m, i) => {
          // Lấy mẫu theo id từ danh sách hiện tại để giá/ảnh luôn mới, mẫu đã xóa thì ẩn
          const cards = (m.ids || []).map((id) => products.find((p) => p.id === id)).filter(Boolean)
          return (
            <div key={i} className={'msg-group ' + m.from}>
              <div className={'msg ' + m.from}>{m.text}</div>
              {cards.length > 0 && <div className="chat-products">{cards.map((p) => <ChatProduct key={p.id} p={p} onBuy={onBuy} />)}</div>}
            </div>
          )
        })}
      </div>
      <div className="chips">{QUICK.map((q) => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="row">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Hỏi giá, size, thời gian giao…" />
        <button className="primary">Gửi</button>
      </form>
    </div>
  )
}

// depositPct > 0: shop yêu cầu khách chuyển khoản cọc ngay sau khi gửi đơn
export function OrderForm({ products, onSubmit, pick, showDeposit = true, smart = false, prefill = null, depositPct = 0 }) {
  const blank = { name: '', phone: '', productId: products[0]?.id || '', size: '', color: '', qty: 1, deposit: 0 }
  const [f, setF] = useState(blank)
  const [addr, setAddr] = useState(EMPTY_ADDR)
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')
  const [paste, setPaste] = useState('')
  const [pasteMsg, setPasteMsg] = useState('')
  const oldData = useVnData('old')
  const newData = useVnData('new')

  // Smart Paste: dán nguyên dòng "Tên, SĐT, địa chỉ…" để tự điền các ô (chỉ dùng cho admin)
  const runPaste = (text = paste) => {
    if (!oldData.rows || !newData.rows) return setPasteMsg('Đang tải dữ liệu địa chỉ, thử lại sau giây lát')
    const r = smartParse(text, oldData.rows, newData.rows)
    setF((x) => ({ ...x, name: r.name || x.name, phone: r.phone || x.phone }))
    setAddr({ mode: r.mode, province: r.province, district: r.district, ward: r.ward, street: r.street })
    const miss = [!r.name && 'tên', !r.phone && 'SĐT', !r.province && 'tỉnh/thành', !r.ward && 'phường/xã', r.mode === 'old' && r.province && !r.district && 'quận/huyện', !r.street && 'số nhà'].filter(Boolean)
    setPasteMsg(miss.length ? `Đã điền, chưa nhận ra: ${miss.join(', ')} — vui lòng bổ sung` : '✅ Đã điền đủ thông tin, kiểm tra lại rồi đặt đơn')
  }

  // Khách đã đăng nhập: tự điền tên và SĐT đã đăng ký
  useEffect(() => {
    if (prefill) setF((x) => ({ ...x, name: x.name || prefill.name || '', phone: x.phone || prefill.phone || '' }))
  }, [prefill])

  // Khi khách bấm "Đặt mua" ở một mẫu
  useEffect(() => {
    if (pick) setF((x) => ({ ...x, productId: pick.id, size: '', color: '' }))
  }, [pick])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const p = products.find((x) => x.id === f.productId) ?? products[0]

  const [busy, setBusy] = useState(false)
  const onPaid = useCallback((r) => setDone((d) => d && { ...d, payment: null, deposit: r.deposit }), [])

  const submit = async (e) => {
    e.preventDefault()
    if (!p || busy) return
    const ae = addrError(addr)
    if (ae) return setErr(ae)
    setErr('')
    const order = {
      id: 'DH' + uid().toUpperCase(),
      createdAt: today(),
      status: 'Mới',
      deposit: showDeposit ? Number(f.deposit) || 0 : 0,
      customer: {
        name: f.name.trim(), phone: f.phone.trim(),
        province: addr.province, district: addr.district, ward: addr.ward, address: addr.street.trim(), addressMode: addr.mode,
      },
      items: [{ productId: p.id, name: p.name, size: f.size || p.sizes[0], color: f.color || p.colors[0], qty: Math.max(1, Number(f.qty) || 1), price: p.priceVnd, cost: 0 }],
    }
    setBusy(true)
    let res
    try {
      res = await onSubmit(order)
    } catch (x) {
      setBusy(false)
      return setErr(x.message || 'Không gửi được đơn, vui lòng thử lại')
    }
    setBusy(false)
    setDone({
      id: (typeof res === 'string' ? res : res?.id) || order.id,
      trackCode: res?.trackCode,
      productName: p.name,
      image: p.image,
      qty: Math.max(1, Number(f.qty) || 1),
      total: (p.priceVnd || 0) * Math.max(1, Number(f.qty) || 1),
      customerName: f.name.trim(),
      payment: res?.payment || null,
    })
    setF({ ...blank, productId: f.productId })
    setAddr(EMPTY_ADDR)
    setPaste('')
    setPasteMsg('')
  }

  if (done?.payment && !smart) {
    return (
      <section className="card order-pay" id="order-form" aria-labelledby="order-pay-title">
        <span className="success-eyebrow">BƯỚC CUỐI · CHUYỂN KHOẢN CỌC</span>
        <h2 id="order-pay-title">Chuyển cọc {vnd(done.payment.amount)} để hoàn tất đơn {done.id}</h2>
        <p className="success-copy">Đơn sẽ được xác nhận tự động ngay khi shop nhận được tiền cọc. Phần còn lại ({vnd(Math.max(0, done.total - done.payment.amount))}) thanh toán khi nhận hàng.</p>
        <DepositPay payment={done.payment} trackCode={done.trackCode} onPaid={onPaid} />
        {done.trackCode && <a className="success-again" href={`/track/${done.trackCode}`}>Để sau — xem đơn & chuyển khoản tại trang theo dõi</a>}
      </section>
    )
  }

  if (done && !smart) {
    return (
      <section className="card order-success" id="order-form" aria-labelledby="order-success-title" role="status">
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

        <div className="success-item">
          {done.image
            ? <img src={done.image} alt="" />
            : <div className="success-item-placeholder" aria-hidden="true">🛍️</div>}
          <div className="success-item-info">
            <strong>{done.productName}</strong>
            <span>Số lượng: {done.qty}</span>
          </div>
          <strong className="success-total">{vnd(done.total)}</strong>
        </div>

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
          <button type="button" className="success-again" onClick={() => setDone(null)}>
            Tiếp tục mua sắm
          </button>
        </div>
      </section>
    )
  }

  return (
    <form className="card" onSubmit={submit} id="order-form">
      <h3>📝 {smart ? 'Tạo đơn mới' : 'Form đặt hàng'}</h3>
      {smart && (
        <div className="smartpaste">
          <label>⚡ Smart Paste — dán nguyên địa chỉ khách nhắn
            <textarea
              rows="2"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) setTimeout(() => runPaste(t), 0) }}
              placeholder="Nguyễn Văn A, 0901234567, 123 Lê Lợi, Phường Bến Thành, Quận 1, HCM"
            />
          </label>
          <div className="row"><button type="button" onClick={() => runPaste()} disabled={!paste.trim()}>Bóc tách & điền</button>{pasteMsg && <small className={pasteMsg.startsWith('✅') ? 'ok' : 'muted'}>{pasteMsg}</small>}</div>
        </div>
      )}
      <div className="grid2" style={{ gap: 12 }}>
        <label>Họ tên *<input required value={f.name} onChange={set('name')} /></label>
        <label>SĐT *<input required inputMode="tel" pattern="0\d{9}" title="SĐT 10 số bắt đầu bằng 0" value={f.phone} onChange={set('phone')} /></label>
      </div>
      <h4>Địa chỉ nhận hàng</h4>
      <AddressPicker value={addr} onChange={setAddr} />
      <h4>Sản phẩm</h4>
      <div className="grid2" style={{ gap: 12 }}>
        <label>Mẫu
          <select value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value, size: '', color: '' })}>
            {products.map((x) => <option key={x.id} value={x.id}>{x.name} - {vnd(x.priceVnd)}</option>)}
          </select>
        </label>
        <label>Số lượng<input type="number" min="1" value={f.qty} onChange={set('qty')} /></label>
        <label>Size
          <select value={f.size} onChange={set('size')}>{p?.sizes.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label>Màu
          <select value={f.color} onChange={set('color')}>{p?.colors.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        {showDeposit && <label>Tiền cọc (đ)<input type="number" min="0" value={f.deposit} onChange={set('deposit')} /></label>}
      </div>
      <p>Tạm tính: <b>{vnd((p?.priceVnd || 0) * (Number(f.qty) || 0))}</b>{p && <span className="muted"> · {STOCK_STATUS[p.status]}, nhận hàng {ETA[p.status]}</span>}</p>
      {depositPct > 0 && !smart && (
        <p className="deposit-note">💳 Cọc trước {depositPct}% (≈ <b>{vnd(depositOf((p?.priceVnd || 0) * (Number(f.qty) || 0), depositPct))}</b>) bằng chuyển khoản/QR, phần còn lại trả khi nhận hàng.</p>
      )}
      {err && <p className="err">{err}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Đang gửi…' : depositPct > 0 && !smart ? 'Đặt hàng & chuyển cọc' : 'Đặt hàng'}</button>
    </form>
  )
}
