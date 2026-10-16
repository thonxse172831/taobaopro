import { useEffect, useRef, useState } from 'react'
import { vnd, uid, today, STOCK_STATUS, ETA } from './lib'
import { AddressPicker, EMPTY_ADDR, addrError } from './address'

// Bot tư vấn theo luật: tìm mẫu theo tên/tag, trả lời giá, size, thời gian nhận hàng
export function reply(text, products) {
  const t = text.toLowerCase()
  const hit = products.find((p) => t.includes(p.name.toLowerCase()) ||
    p.tags.some((g) => t.includes(g.toLowerCase())) || t.includes(p.category.toLowerCase()))
  if (/(chào|hello|hi\b|xin chào)/.test(t) && !hit) return 'Chào bạn! Mình có thể tư vấn mẫu, giá, size và thời gian nhận hàng. Bạn quan tâm mẫu nào ạ?'
  if (/(đặt|mua|order)/.test(t)) return 'Bạn điền form "Đặt hàng" bên cạnh nhé, shop sẽ xác nhận trong ít phút. Cọc trước để giữ hàng giúp nhận nhanh hơn ạ.'
  if (/(ship|vận chuyển|phí|bao lâu|khi nào|giao)/.test(t)) return 'Hàng sẵn kho giao 1-3 ngày, hàng đang về 3-7 ngày, hàng ở kho TQ 10-15 ngày. Có thu hộ COD sau khi cọc ạ.'
  if (/(cọc|cod|thanh toán)/.test(t)) return 'Shop nhận cọc trước, phần còn lại khách thanh toán khi nhận hàng (COD).'
  if (hit) {
    const p = hit
    return `${p.name}: ${vnd(p.priceVnd)}. Size: ${p.sizes.join(', ')}. Màu: ${p.colors.join(', ')}. Hiện ${STOCK_STATUS[p.status].toLowerCase()}, nhận hàng ${ETA[p.status]}${p.stock ? '' : ' (tạm hết, cần đặt trước)'}.`
  }
  if (/(giá|bao nhiêu|mẫu|có gì|hot)/.test(t)) {
    return 'Mẫu đang có: ' + products.map((p) => `${p.name} (${vnd(p.priceVnd)})`).join('; ')
  }
  return 'Mình chưa rõ ý bạn. Bạn thử hỏi tên mẫu, giá, size hoặc thời gian giao hàng nhé!'
}

const QUICK = ['Có mẫu nào hot không?', 'Thời gian giao hàng?', 'Thanh toán thế nào?']

export function ChatBox({ products }) {
  const [msgs, setMsgs] = useState([{ from: 'bot', text: 'Xin chào! Bạn cần tư vấn mẫu nào ạ?' }])
  const [input, setInput] = useState('')
  const box = useRef(null)
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [msgs])

  const ask = (text) => {
    if (!text.trim()) return
    setMsgs((m) => [...m, { from: 'me', text }, { from: 'bot', text: reply(text, products) }])
    setInput('')
  }
  return (
    <div className="card chat">
      <h3>💬 Tư vấn tự động</h3>
      <div className="msgs" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={'msg ' + m.from}>{m.text}</div>
        ))}
      </div>
      <div className="chips">{QUICK.map((q) => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input) }} className="row">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Hỏi giá, size, thời gian giao…" />
        <button className="primary">Gửi</button>
      </form>
    </div>
  )
}

export function OrderForm({ products, onSubmit, pick, showDeposit = true }) {
  const blank = { name: '', phone: '', productId: products[0]?.id || '', size: '', color: '', qty: 1, deposit: 0 }
  const [f, setF] = useState(blank)
  const [addr, setAddr] = useState(EMPTY_ADDR)
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')

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
    let id = order.id
    try {
      id = (await onSubmit(order)) || id
    } catch (x) {
      setBusy(false)
      return setErr(x.message || 'Không gửi được đơn, vui lòng thử lại')
    }
    setBusy(false)
    setDone(id)
    setF({ ...blank, productId: f.productId })
    setAddr(EMPTY_ADDR)
  }

  return (
    <form className="card" onSubmit={submit} id="order-form">
      <h3>📝 Form đặt hàng</h3>
      {done && <p className="ok">✅ Đã gửi đơn {done}. Shop sẽ liên hệ xác nhận qua SĐT của bạn!</p>}
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
      <button className="primary">Đặt hàng</button>
    </form>
  )
}
