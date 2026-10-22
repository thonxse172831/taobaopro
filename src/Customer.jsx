import { useEffect, useRef, useState } from 'react'
import { vnd, uid, today, STOCK_STATUS, ETA } from './lib'
import { AddressPicker, EMPTY_ADDR, addrError, useVnData } from './address'
import { smartParse } from './smartpaste'
import { ScanIcon } from './ui'

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

const MAX_IMAGE = 12 * 1024 * 1024
const GREETING = { from: 'bot', text: 'Xin chào! Bạn cần tư vấn mẫu nào ạ? Bạn cũng có thể gửi ảnh để mình quét tìm mẫu giống.' }

// onBuy(productId): khi khách bấm "Đặt hàng" trên thẻ mẫu trong khung chat
export function ChatBox({ products, onBuy, onClose, title = '💬 Tư vấn tự động' }) {
  const [msgs, setMsgs] = useState([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef(null)
  const file = useRef(null)
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  const ask = (text) => {
    if (!text.trim()) return
    const r = reply(text, products)
    setMsgs((m) => [...m, { from: 'me', text }, { from: 'bot', text: r.text, ids: r.products.map((p) => p.id) }])
    setInput('')
  }

  // Khách gửi ảnh: so khớp ngay trên máy với ảnh mẫu của shop (không tải ảnh lên server)
  const sendImage = async (f) => {
    if (!f || busy) return
    if (!f.type.startsWith('image/') || f.size > MAX_IMAGE) {
      setMsgs((m) => [...m, { from: 'bot', text: 'Bạn gửi giúp mình ảnh JPG/PNG/WebP dưới 12 MB nhé.' }])
      return
    }
    const url = URL.createObjectURL(f)
    setMsgs((m) => [...m, { from: 'me', image: url }, { from: 'bot', text: 'Đang tìm mẫu giống ảnh của bạn…', pending: true }])
    setBusy(true)
    let r
    try {
      const { searchProductsByImage } = await import('./imagehash.js')
      const found = await searchProductsByImage(url, products)
      r = found.matches.length
        ? { text: found.best ? `Mình tìm thấy mẫu rất giống ảnh của bạn (khớp ${found.matches[0].similarity}%) 👇` : 'Đây là các mẫu gần giống nhất ạ:', ids: found.matches.map((x) => x.product.id) }
        : { text: 'Chưa thấy mẫu đủ giống trong shop. Bạn thử ảnh rõ sản phẩm hơn, hoặc gõ tên mẫu để mình tìm nhé!' }
    } catch {
      r = { text: 'Mình không đọc được ảnh này, bạn thử ảnh khác nhé.' }
    }
    setBusy(false)
    setMsgs((m) => [...m.filter((x) => !x.pending), { from: 'bot', ...r }])
  }

  return (
    <div className="card chat">
      <div className="chat-head">
        <h3>{title}</h3>
        {onClose && <button type="button" className="icon-btn" onClick={onClose} aria-label="Thu nhỏ khung tư vấn">✕</button>}
      </div>
      <div className="msgs" ref={box} aria-live="polite">
        {msgs.map((m, i) => {
          // Lấy mẫu theo id từ danh sách hiện tại để giá/ảnh luôn mới, mẫu đã xóa thì ẩn
          const cards = (m.ids || []).map((id) => products.find((p) => p.id === id)).filter(Boolean)
          return (
            <div key={i} className={'msg-group ' + m.from}>
              {m.image
                ? <img className="msg-image" src={m.image} alt="Ảnh bạn gửi" />
                : <div className={'msg ' + m.from + (m.pending ? ' typing' : '')}>{m.pending && <span className="spinner" aria-hidden="true" />}{m.text}</div>}
              {cards.length > 0 && <div className="chat-products">{cards.map((p) => <ChatProduct key={p.id} p={p} onBuy={onBuy} />)}</div>}
            </div>
          )
        })}
      </div>
      <div className="chips">{QUICK.map((q) => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="chat-input">
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { sendImage(e.target.files[0]); e.target.value = '' }} />
        <button type="button" className="icon-btn scan-btn" onClick={() => file.current?.click()} disabled={busy || !products.length} title="Gửi ảnh để tìm mẫu giống" aria-label="Gửi ảnh để tìm mẫu giống"><ScanIcon size={22} busy={busy} /></button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Hỏi giá, size, thời gian giao…" aria-label="Nội dung tin nhắn" />
        <button className="primary" disabled={!input.trim()}>Gửi</button>
      </form>
    </div>
  )
}

// Tư vấn thu nhỏ thành nút tròn góc phải; bấm để mở khung chat
export function ChatWidget({ products, onBuy }) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!open) return
    const on = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open])
  return (
    <>
      <div className={'chat-float' + (open ? ' open' : '')} role="dialog" aria-label="Tư vấn tự động" aria-hidden={!open}>
        <ChatBox products={products} onClose={() => setOpen(false)} onBuy={(id) => { setOpen(false); onBuy(id) }} />
      </div>
      <button
        type="button"
        className={'chat-fab' + (open ? ' open' : '')}
        onClick={() => { setOpen(!open); setSeen(true) }}
        aria-label={open ? 'Thu nhỏ khung tư vấn' : 'Mở tư vấn tự động'}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '✕' : '💬'}</span>
        {!seen && !open && <i className="chat-fab-dot" aria-hidden="true" />}
      </button>
    </>
  )
}

// Form tạo đơn nhanh của admin (khách đặt qua giỏ hàng ở Checkout.jsx)
export function OrderForm({ products, onSubmit, pick, showDeposit = true, smart = false }) {
  const blank = { name: '', phone: '', productId: products[0]?.id || '', size: '', color: '', qty: 1, deposit: 0 }
  const [f, setF] = useState(blank)
  const [addr, setAddr] = useState(EMPTY_ADDR)
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

  // Khi khách bấm "Đặt mua" ở một mẫu
  useEffect(() => {
    if (pick) setF((x) => ({ ...x, productId: pick.id, size: '', color: '' }))
  }, [pick])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const p = products.find((x) => x.id === f.productId) ?? products[0]

  const [busy, setBusy] = useState(false)

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
    try {
      await onSubmit(order)
    } catch (x) {
      setBusy(false)
      return setErr(x.message || 'Không gửi được đơn, vui lòng thử lại')
    }
    setBusy(false)
    setF({ ...blank, productId: f.productId })
    setAddr(EMPTY_ADDR)
    setPaste('')
    setPasteMsg('')
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
      {err && <p className="err">{err}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Đang gửi…' : 'Đặt hàng'}</button>
    </form>
  )
}
