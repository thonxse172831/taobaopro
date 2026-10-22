import { useCallback, useEffect, useRef, useState } from 'react'
import { Brand, NumInput, ThemeToggle, useTheme } from './ui'
import {
  vnd, today, uid, rateOn, costVnd, orderTotals, copyForCustomer, DEFAULT_PRICING, priceBreakdown, FEE_MODES,
  normalizeCfg, withCosts, fullAddress, STOCK_STATUS, ORDER_STATUS, STATUS_LABEL, normStatus, newTrackCode, SEED_PRODUCTS, DEFAULT_SHOP,
} from './lib'
import { ChatBox, OrderForm } from './Customer'
import Links from './Links'
import Workspace, { DEFAULT_LAYOUTS } from './Workspace'
import Kanban, { orderMatches } from './Kanban'
import { useShipping, ShippingConfig } from './Shipping'
import ShopSettings from './ShopSettings'
import Scan from './Scan'
import Bill from './Bill'
import { BarChart, PieChart, Metrics, dashboardStats } from './charts'
import { detectCnTracking, nearestWaitingOrder } from './track'
import { useServerKV, useOrders } from './store'

const TABS = [
  ['work', 'Bàn làm việc'], ['stats', 'Thống kê'], ['catalog', 'Mẫu hàng'], ['links', 'Link đã lưu'], ['orders', 'Đơn hàng'],
  ['scan', 'Quét mã'], ['pricing', 'Giá & Thuế'], ['shop', 'Cửa hàng'], ['form', 'Đặt hàng & Tư vấn'],
]

export default function App({ logout }) {
  const [tab, setTab] = useState('work')
  const [products, setProducts] = useServerKV('products', SEED_PRODUCTS)
  const { orders, setOrders, newCount, clearNew } = useOrders()
  const [rates, setRates] = useServerKV('rates', [{ date: '2026-01-01', rate: 3600 }])
  const [saved, setCfg] = useServerKV('pricing', DEFAULT_PRICING)
  const [shopSaved, setShop] = useServerKV('shop', DEFAULT_SHOP)
  const [layouts, setLayouts] = useServerKV('layouts', DEFAULT_LAYOUTS)
  const cfg = normalizeCfg(saved)
  const shop = { ...DEFAULT_SHOP, ...shopSaved }
  const [dark, setDark] = useTheme()
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null)
  const [bill, setBill] = useState(null)
  const [suggest, setSuggest] = useState(null)
  const [toast, setToast] = useState('')
  const searchRef = useRef(null)
  const toastTimer = useRef(null)

  const rate = rateOn(rates, today())
  const notify = useCallback((m) => {
    setToast(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const addOrder = (o) => {
    const full = withCosts({ ...o, trackCode: newTrackCode(), statusAt: new Date().toISOString() }, products, rates, cfg)
    setOrders((os) => [full, ...os])
    return { id: full.id, trackCode: full.trackCode }
  }

  const patchOrder = useCallback((id, patch) =>
    setOrders((os) => os.map((o) => {
      if (o.id !== id) return o
      const n = { ...o, ...patch }
      if (patch.status && normStatus(patch.status) !== normStatus(o.status)) n.statusAt = new Date().toISOString()
      if (patch.status === 'Hoàn thành' && !n.deliveredAt) n.deliveredAt = today()
      return n
    })), [setOrders])

  const sh = useShipping(patchOrder)
  const shown = orders.filter((o) => orderMatches(o, q))
  const ctx = { products, shop, sh, patchOrder, onBill: setBill, notify, onEdit: (o) => setModal({ edit: o.id }) }

  // Mã vận đơn TQ: nhận diện khi dán hoặc khi bấm nút, rồi gợi ý gán vào đơn chờ gần nhất
  const ordersRef = useRef(orders)
  useEffect(() => { ordersRef.current = orders }, [orders])
  const detect = useCallback((text, manual) => {
    const hit = detectCnTracking(text)
    if (!hit) return manual && notify('Không thấy mã vận đơn TQ trong nội dung đã copy')
    const o = nearestWaitingOrder(ordersRef.current)
    if (!o) return notify(`Mã ${hit.code} (${hit.carrier}) nhưng không còn đơn nào đang chờ gán`)
    setSuggest({ ...hit, orderId: o.id })
  }, [notify])
  const readClipboard = async () => {
    try { detect(await navigator.clipboard.readText(), true) } catch { notify('Trình duyệt chặn đọc clipboard, hãy dán (Ctrl+V) vào trang') }
  }
  const assign = () => {
    if (!suggest) return
    const o = orders.find((x) => x.id === suggest.orderId)
    if (o) patchOrder(o.id, { cnTracking: suggest.code, cnCarrier: suggest.carrier, status: normStatus(o.status) === 'Mới' ? 'Đã mua' : o.status })
    notify(`Đã gán ${suggest.code} vào đơn ${suggest.orderId}`)
    setSuggest(null)
  }

  // Phím tắt: Ctrl/Alt+N tạo đơn, Ctrl+F tìm khách, Ctrl+S lưu đơn đang mở, Esc đóng
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setModal(null); return }
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return
      const k = e.key.toLowerCase()
      if (k === 'n') { e.preventDefault(); setModal('new') }
      else if (k === 'f' && !e.altKey) {
        e.preventDefault()
        setTab((t) => (t === 'work' || t === 'orders' ? t : 'orders'))
        setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select() }, 0)
      } else if (k === 's' && !e.altKey) {
        e.preventDefault()
        document.querySelector('.modal form, form#order-form')?.requestSubmit()
      }
    }
    const onPaste = (e) => {
      const t = e.target
      if (t.closest?.('input,textarea,select,[contenteditable]')) return
      detect(e.clipboardData?.getData('text') || '')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('paste', onPaste) }
  }, [detect])

  const editing = modal?.edit && orders.find((o) => o.id === modal.edit)
  const sug = suggest && orders.find((o) => o.id === suggest.orderId)

  return (
    <div className="app">
      <header>
        <Brand />
        <nav>
          {TABS.map(([id, t]) => (
            <button key={id} className={id === tab ? 'active' : ''} onClick={() => { setTab(id); if (id === 'orders' || id === 'work') clearNew() }}>
              {t}{id === 'orders' && newCount > 0 && <span className="new-dot">{newCount}</span>}
            </button>
          ))}
        </nav>
        <input ref={searchRef} className="search" type="search" placeholder="Tìm khách… (Ctrl+F)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setModal('new')} title="Ctrl+N hoặc Alt+N">＋ Đơn mới</button>
        <button className="icon-btn" onClick={readClipboard} title="Dán mã vận đơn TQ từ clipboard">📋</button>
        <span className="muted">1¥ = {vnd(rate)}</span>
        <a className="shop-link" href="/order" target="_blank" rel="noreferrer">🛍 Trang khách</a>
        <ThemeToggle dark={dark} setDark={setDark} />
        <button className="logout" onClick={logout}>Đăng xuất</button>
      </header>
      {suggest && sug && (
        <div className="suggest">
          <span>📦 Phát hiện mã vận đơn TQ <b>{suggest.code}</b> ({suggest.carrier}). Gán vào đơn <b>{sug.id}</b> — {sug.customer.name}?</span>
          <button className="primary" onClick={assign}>Gán</button>
          <button onClick={() => setSuggest(null)}>Bỏ qua</button>
        </div>
      )}
      <main>
        {tab === 'work' && <Workspace layouts={layouts} setLayouts={setLayouts} orders={shown} setOrders={setOrders} rate={rate} cfg={cfg} {...ctx} />}
        {tab === 'stats' && <Dashboard products={products} orders={orders} rate={rate} cfg={cfg} />}
        {tab === 'catalog' && <Catalog products={products} setProducts={setProducts} rate={rate} cfg={cfg} />}
        {tab === 'links' && <Links products={products} setProducts={setProducts} rate={rate} cfg={cfg} />}
        {tab === 'orders' && <Orders orders={shown} ctx={ctx} />}
        {tab === 'scan' && <Scan orders={orders} patchOrder={patchOrder} />}
        {tab === 'pricing' && <Pricing rates={rates} setRates={setRates} cfg={cfg} setCfg={setCfg} orders={orders} setOrders={setOrders} />}
        {tab === 'shop' && <ShopSettings shop={shop} setShop={setShop} products={products} notify={notify} />}
        {tab === 'form' && (
          <div className="grid2 top">
            <OrderForm products={products} onSubmit={addOrder} smart />
            <ChatBox products={products} />
          </div>
        )}
      </main>

      {modal === 'new' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box">
            <OrderForm products={products} onSubmit={(o) => { const r = addOrder(o); notify(`Đã tạo đơn ${r.id}`); setModal(null); return r }} smart />
            <button onClick={() => setModal(null)}>Đóng (Esc)</button>
          </div>
        </div>
      )}
      {editing && <EditOrder o={editing} onClose={() => setModal(null)} onSave={(p) => { patchOrder(editing.id, p); setModal(null) }} />}
      {bill && <Bill order={bill} shop={shop} onClose={() => setBill(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function EditOrder({ o, onClose, onSave }) {
  const [f, setF] = useState({ note: o.note || '', cnTracking: o.cnTracking || '', cnCarrier: o.cnCarrier || '', deposit: o.deposit || 0 })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal-box card" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, deposit: Number(f.deposit) || 0 }) }}>
        <h3>Sửa đơn {o.id}</h3>
        <label>Mã vận đơn TQ<input value={f.cnTracking} onChange={set('cnTracking')} /></label>
        <label>Hãng TQ<input value={f.cnCarrier} onChange={set('cnCarrier')} placeholder="YTO, ZTO, STO…" /></label>
        <label>Tiền cọc (đ)<input type="number" min="0" value={f.deposit} onChange={set('deposit')} /></label>
        <label>Ghi chú<textarea rows="3" value={f.note} onChange={set('note')} /></label>
        <div className="row"><button className="primary">Lưu (Ctrl+S)</button><button type="button" onClick={onClose}>Hủy</button></div>
      </form>
    </div>
  )
}

/* ---------- Dashboard ---------- */
function Dashboard({ products, orders, rate, cfg }) {
  const s = dashboardStats(products, orders, rate, cfg)
  return (
    <>
      <Metrics s={s} />
      <div className="grid2">
        <div className="card"><h3>Doanh thu & Lợi nhuận ròng theo tháng</h3><BarChart data={s.months} /></div>
        <div className="card"><h3>Tỷ trọng doanh thu theo danh mục</h3><PieChart data={s.cats} /></div>
      </div>
    </>
  )
}

/* ---------- Catalog ---------- */
const blankP = { name: '', image: '', sourceUrl: '', priceCny: '', domesticShipCny: 0, weightKg: 0.5, sizes: '', colors: '', tags: '', category: '', priceVnd: '', stock: 1, status: 'TQ' }

function Catalog({ products, setProducts, rate, cfg }) {
  const [f, setF] = useState(blankP)
  const [editId, setEditId] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

  const upload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const r = new FileReader()
    r.onload = () => setF((x) => ({ ...x, image: r.result }))
    r.readAsDataURL(file)
  }
  const submit = (e) => {
    e.preventDefault()
    const p = {
      ...f, priceCny: +f.priceCny, domesticShipCny: +f.domesticShipCny, weightKg: +f.weightKg, priceVnd: +f.priceVnd, stock: +f.stock,
      sizes: list(f.sizes), colors: list(f.colors), tags: list(f.tags),
    }
    if (editId) setProducts((ps) => ps.map((x) => (x.id === editId ? { ...x, ...p } : x)))
    else setProducts((ps) => [{ ...p, id: uid(), createdAt: today() }, ...ps])
    setF(blankP)
    setEditId(null)
  }
  const edit = (p) => {
    setEditId(p.id)
    setF({ ...p, sizes: p.sizes.join(', '), colors: p.colors.join(', '), tags: p.tags.join(', ') })
    window.scrollTo(0, 0)
  }
  const copy = async (p) => {
    try {
      const mode = await copyForCustomer(p)
      setMsg(mode === 'image+text' ? 'Đã copy ảnh + nội dung, dán vào Zalo/Messenger.' : 'Đã copy nội dung (ảnh không copy được; hãy upload ảnh trực tiếp).')
    } catch {
      setMsg('Trình duyệt chặn clipboard.')
    }
    setTimeout(() => setMsg(''), 4000)
  }
  const shown = products.filter((p) => (p.name + p.tags.join(' ') + p.category).toLowerCase().includes(q.toLowerCase()))
  const pv = f.priceCny !== '' ? costVnd(f, rate, cfg) : 0

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h3>{editId ? 'Sửa mẫu' : 'Thêm mẫu mới'}</h3>
        <div className="grid3">
          <label>Tên mẫu<input required value={f.name} onChange={set('name')} /></label>
          <label>Link Taobao/1688<input type="url" value={f.sourceUrl} onChange={set('sourceUrl')} /></label>
          <label>Ảnh<input type="file" accept="image/*" onChange={upload} /></label>
          <label>Giá nhập (¥)<input required type="number" step="0.01" value={f.priceCny} onChange={set('priceCny')} /></label>
          <label>Ship nội địa TQ (¥)<input type="number" step="0.01" value={f.domesticShipCny} onChange={set('domesticShipCny')} /></label>
          <label>Cân nặng (kg)<input type="number" step="0.01" value={f.weightKg} onChange={set('weightKg')} /></label>
          <label>Size (phẩy)<input value={f.sizes} onChange={set('sizes')} placeholder="S, M, L" /></label>
          <label>Màu (phẩy)<input value={f.colors} onChange={set('colors')} /></label>
          <label>Tags (phẩy)<input value={f.tags} onChange={set('tags')} placeholder="áo khoác, mùa đông" /></label>
          <label>Danh mục<input required value={f.category} onChange={set('category')} /></label>
          <label>Giá bán (đ)<input required type="number" value={f.priceVnd} onChange={set('priceVnd')} /></label>
          <label>Tồn kho<input type="number" min="0" value={f.stock} onChange={set('stock')} /></label>
          <label>Trạng thái
            <select value={f.status} onChange={set('status')}>{Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
        </div>
        {f.priceCny !== '' && <p>Giá final (vốn): <b>{vnd(pv)}</b>{f.priceVnd && <> · Lãi gộp: <b>{vnd(f.priceVnd - pv)}</b></>} <button type="button" onClick={() => setF({ ...f, priceVnd: Math.ceil(pv / 1000) * 1000 })}>Dùng làm giá bán</button></p>}
        <button className="primary">{editId ? 'Lưu' : 'Thêm'}</button>
        {editId && <button type="button" onClick={() => { setEditId(null); setF(blankP) }}>Hủy</button>}
      </form>
      <div className="row"><input placeholder="Tìm tên / tag / danh mục…" value={q} onChange={(e) => setQ(e.target.value)} />{msg && <span className="ok">{msg}</span>}</div>
      <div className="products">
        {shown.map((p) => (
          <div className="card product" key={p.id}>
            {p.image ? <img src={p.image} alt={p.name} /> : <div className="noimg">Chưa có ảnh</div>}
            <b>{p.name}</b>
            <div>{p.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
            <small>Vốn {vnd(costVnd(p, rate, cfg))} → Bán {vnd(p.priceVnd)} ({p.priceCny}¥)</small>
            <small>Size {p.sizes.join('/')} · Màu {p.colors.join('/')} · Tồn {p.stock}</small>
            <select value={p.status} onChange={(e) => setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, status: e.target.value } : x)))}>
              {Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="row">
              <button className="primary" onClick={() => copy(p)}>Copy for Customer</button>
              {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer">Link gốc</a>}
              <button onClick={() => edit(p)}>Sửa</button>
              <button onClick={() => confirm('Xóa mẫu?') && setProducts((ps) => ps.filter((x) => x.id !== p.id))}>Xóa</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- Orders ---------- */
function Orders({ orders, ctx }) {
  const [view, setView] = useState('kanban')
  const { sh, patchOrder, onBill, notify } = ctx

  return (
    <>
      <div className="row wrap layout-bar">
        <button className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>Kanban</button>
        <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Bảng</button>
      </div>
      <ShippingConfig sh={sh} />
      {view === 'kanban' && <Kanban orders={orders} {...ctx} />}
      {view === 'table' && (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Mã</th><th>Khách</th><th>Hàng</th><th>Tổng</th><th>Cọc</th><th>COD</th><th>Trạng thái</th><th>Vận đơn</th><th /></tr></thead>
            <tbody>
              {orders.map((o) => {
                const t = orderTotals(o)
                return (
                  <tr key={o.id}>
                    <td>{o.id}<br /><small>{o.createdAt}</small></td>
                    <td>{o.customer.name}<br /><small>{o.customer.phone}</small><br /><small>{fullAddress(o.customer)}</small></td>
                    <td>{o.items.map((i) => `${i.name} (${i.size}/${i.color}) x${i.qty}`).join('; ')}</td>
                    <td>{vnd(t.revenue)}</td>
                    <td>{vnd(o.deposit)}</td>
                    <td>{vnd(t.cod)}</td>
                    <td><select value={normStatus(o.status)} onChange={(e) => patchOrder(o.id, { status: e.target.value })}>{ORDER_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></td>
                    <td>
                      {o.cnTracking && <small>TQ: {o.cnTracking}<br /></small>}
                      {o.tracking ? <>{o.carrier}: {o.tracking}<br /><a href={o.waybillUrl} target="_blank" rel="noreferrer">In tem</a></> : '—'}
                    </td>
                    <td>
                      <button onClick={() => onBill(o)}>🧾 Bill</button>
                      {!o.tracking && !['Hoàn thành', 'Đã hủy'].includes(o.status) && <button className="primary" disabled={sh.busy === o.id} onClick={() => sh.ship(o)}>{sh.busy === o.id ? '…' : 'Giao hàng'}</button>}
                      {o.tracking && o.status === 'Đang giao' && <button onClick={() => sh.simulateWebhook(o)}>Giả lập "đã giao"</button>}
                      {o.trackCode && <button onClick={() => navigator.clipboard.writeText(`${location.origin}/track/${o.trackCode}`).then(() => notify('Đã copy link theo dõi'))}>🔗</button>}
                    </td>
                  </tr>
                )
              })}
              {!orders.length && <tr><td colSpan="9" className="muted">Chưa có đơn. Bấm "＋ Đơn mới" hoặc Ctrl+N.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/* ---------- Pricing & Tax ---------- */
function Pricing({ rates, setRates, cfg, setCfg, orders, setOrders }) {
  const [d, setD] = useState(today())
  const [r, setR] = useState('')
  const [demo, setDemo] = useState(100)
  const [demoKg, setDemoKg] = useState(0.5)
  const sorted = [...rates].sort((a, b) => b.date.localeCompare(a.date))
  const pending = orders.filter((o) => o.status === 'Hoàn thành' && !o.taxPaid)
  const fund = pending.reduce((s, o) => s + orderTotals(o).tax, 0)
  const add = (e) => {
    e.preventDefault()
    setRates((x) => [...x.filter((y) => y.date !== d), { date: d, rate: +r }])
    setR('')
  }
  return (
    <div className="grid2 top">
      <div className="card">
        <h3>Tỷ giá NDT/VNĐ theo ngày</h3>
        <form className="row" onSubmit={add}>
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
          <input required type="number" placeholder="VNĐ / 1¥" value={r} onChange={(e) => setR(e.target.value)} />
          <button className="primary">Lưu</button>
        </form>
        <ul>{sorted.map((x) => <li key={x.date}>{x.date}: {vnd(x.rate)} <button onClick={() => rates.length > 1 && setRates(rates.filter((y) => y.date !== x.date))}>x</button></li>)}</ul>
        <h3>Công thức giá bán cuối (Final)</h3>
        <p><b>Final = Giá nội địa (¥ × tỷ giá) + Phí ship cửa khẩu + Tiền công + Tiền ship</b></p>
        {[['border', 'Phí ship cửa khẩu'], ['labor', 'Tiền công'], ['ship', 'Tiền ship']].map(([k, label]) => (
          <div className="row" key={k}>
            <label style={{ flex: 1 }}>{label}<NumInput value={cfg[k].value} onChange={(v) => setCfg({ ...cfg, [k]: { ...cfg[k], value: v } })} /></label>
            <label>Cách tính
              <select value={cfg[k].mode} onChange={(e) => setCfg({ ...cfg, [k]: { ...cfg[k], mode: e.target.value } })}>
                {Object.entries(FEE_MODES).map(([m, t]) => <option key={m} value={m}>{t}</option>)}
              </select>
            </label>
          </div>
        ))}
        <label>Cân nặng mặc định khi chưa biết (kg)<NumInput value={cfg.defaultWeightKg} onChange={(v) => setCfg({ ...cfg, defaultWeightKg: v })} /></label>
        <h4>Tính thử</h4>
        <div className="row">
          <NumInput placeholder="Giá nội địa ¥" value={demo} onChange={setDemo} />
          <NumInput placeholder="kg" value={demoKg} onChange={setDemoKg} />
        </div>
        {demo > 0 && (() => {
          const b = priceBreakdown({ priceCny: +demo, weightKg: +demoKg }, rateOn(rates, today()), cfg)
          return <p>{vnd(b.goods)} + {vnd(b.border)} + {vnd(b.labor)} + {vnd(b.ship)} = <b>{vnd(b.final)}</b></p>
        })()}
      </div>
      <div className="card">
        <h3>Quỹ thuế khoán (1,5% = 1% GTGT + 0,5% TNCN)</h3>
        <p className="big">Thuế chờ nộp: {vnd(fund)}</p>
        <p className="muted">{pending.length} đơn "Hoàn thành" chưa kê khai.</p>
        <button className="primary" disabled={!pending.length} onClick={() => setOrders((os) => os.map((o) => (o.status === 'Hoàn thành' ? { ...o, taxPaid: true } : o)))}>Đánh dấu đã nộp thuế</button>
      </div>
    </div>
  )
}
