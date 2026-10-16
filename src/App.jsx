import { useState } from 'react'
import { NumInput, ThemeToggle, useTheme } from './ui'
import {
  vnd, today, uid, daysAgo, rateOn, costVnd, orderTotals, copyForCustomer, DEFAULT_PRICING, priceBreakdown, FEE_MODES,
  normalizeCfg, withCosts, fullAddress, STOCK_STATUS, ORDER_STATUS, CARRIERS, SEED_PRODUCTS,
} from './lib'
import { CARRIER_CONFIG, buildShipment, createShipment, mapWebhook } from './logistics'
import { ChatBox, OrderForm } from './Customer'
import Links from './Links'
import { useServerKV, useOrders } from './store'

const TABS = ['Thống kê', 'Mẫu hàng', 'Link đã lưu', 'Đơn hàng', 'Cài đặt giá & Thuế', 'Đặt hàng & Tư vấn']
const COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#64748b']

export default function App({ logout }) {
  const [tab, setTab] = useState(TABS[0])
  const [products, setProducts] = useServerKV('products', SEED_PRODUCTS)
  const { orders, setOrders, newCount, clearNew } = useOrders()
  const [rates, setRates] = useServerKV('rates', [{ date: '2026-01-01', rate: 3600 }])
  const [saved, setCfg] = useServerKV('pricing', DEFAULT_PRICING)
  const cfg = normalizeCfg(saved)
  const [dark, setDark] = useTheme()

  const rate = rateOn(rates, today())

  const addOrder = (o) => setOrders((os) => [withCosts(o, products, rates, cfg), ...os])

  const patchOrder = (id, patch) =>
    setOrders((os) => os.map((o) => {
      if (o.id !== id) return o
      const n = { ...o, ...patch }
      if (patch.status === 'Hoàn thành' && !n.deliveredAt) n.deliveredAt = today()
      return n
    }))

  return (
    <div className="app">
      <header>
        <b className="logo">TaobaoPro</b>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => { setTab(t); if (t === TABS[3]) clearNew() }}>
              {t}{t === TABS[3] && newCount > 0 && <span className="new-dot">{newCount}</span>}
            </button>
          ))}
        </nav>
        <span className="muted">1¥ = {vnd(rate)}</span>
        <a className="shop-link" href="/order" target="_blank" rel="noreferrer">🛍 Trang khách</a>
        <ThemeToggle dark={dark} setDark={setDark} />
        <button className="logout" onClick={logout}>Đăng xuất</button>
      </header>
      <main>
        {tab === TABS[0] && <Dashboard products={products} orders={orders} rate={rate} cfg={cfg} />}
        {tab === TABS[1] && <Catalog products={products} setProducts={setProducts} rate={rate} cfg={cfg} />}
        {tab === TABS[2] && <Links products={products} setProducts={setProducts} rate={rate} cfg={cfg} />}
        {tab === TABS[3] && <Orders orders={orders} patchOrder={patchOrder} />}
        {tab === TABS[4] && <Pricing rates={rates} setRates={setRates} cfg={cfg} setCfg={setCfg} orders={orders} setOrders={setOrders} />}
        {tab === TABS[5] && (
          <div className="grid2 top">
            <OrderForm products={products} onSubmit={addOrder} />
            <ChatBox products={products} />
          </div>
        )}
      </main>
    </div>
  )
}

/* ---------- Dashboard ---------- */
function Dashboard({ products, orders, rate, cfg }) {
  const done = orders.filter((o) => o.status === 'Hoàn thành')
  const byMonth = {}
  const byCat = {}
  done.forEach((o) => {
    const t = orderTotals(o)
    const m = (o.deliveredAt || o.createdAt).slice(0, 7)
    byMonth[m] = byMonth[m] || { revenue: 0, profit: 0 }
    byMonth[m].revenue += t.revenue
    byMonth[m].profit += t.profit
    o.items.forEach((i) => {
      const p = products.find((x) => x.id === i.productId)
      const c = p?.category || 'Khác'
      byCat[c] = (byCat[c] || 0) + i.price * i.qty
    })
  })
  const months = Object.keys(byMonth).sort().map((m) => ({ label: m, ...byMonth[m] }))
  const cats = Object.entries(byCat).map(([label, value]) => ({ label, value }))

  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const taxQuarter = done
    .filter((o) => {
      const d = new Date(o.deliveredAt || o.createdAt)
      return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q && !o.taxPaid
    })
    .reduce((s, o) => s + orderTotals(o).tax, 0)
  const old = products.filter((p) => p.status === 'READY' && p.stock > 0 && daysAgo(p.createdAt) > 30)
  const stuck = products.filter((p) => p.status === 'TQ').reduce((s, p) => s + p.stock * costVnd(p, rate, cfg), 0)

  return (
    <>
      <div className="cards">
        <Metric title="Tồn quá 30 ngày" value={`${old.length} mẫu / ${old.reduce((s, p) => s + p.stock, 0)} sp`} warn={old.length > 0} />
        <Metric title="Giá trị hàng kẹt kho TQ" value={vnd(stuck)} />
        <Metric title="Thuế cần nộp trong quý" value={vnd(taxQuarter)} />
        <Metric title="Công nợ COD chờ thu" value={vnd(orders.filter((o) => ['Đã xác nhận', 'Đang giao'].includes(o.status)).reduce((s, o) => s + orderTotals(o).cod, 0))} />
      </div>
      <div className="grid2">
        <div className="card"><h3>Doanh thu & Lợi nhuận ròng theo tháng</h3><BarChart data={months} /></div>
        <div className="card"><h3>Tỷ trọng doanh thu theo danh mục</h3><PieChart data={cats} /></div>
      </div>
    </>
  )
}

const Metric = ({ title, value, warn }) => (
  <div className={'card metric' + (warn ? ' warn' : '')}><span className="muted">{title}</span><b>{value}</b></div>
)

function BarChart({ data }) {
  if (!data.length) return <p className="muted">Chưa có đơn hoàn thành.</p>
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.profit, 1]))
  const W = 480, H = 220, bw = Math.min(30, W / data.length / 3)
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%">
      {data.map((d, i) => {
        const x = (i + 0.5) * (W / data.length)
        const h1 = (d.revenue / max) * H
        const h2 = (Math.max(d.profit, 0) / max) * H
        return (
          <g key={d.label}>
            <rect x={x - bw} y={H - h1} width={bw} height={h1} fill="#3b82f6"><title>Doanh thu {vnd(d.revenue)}</title></rect>
            <rect x={x} y={H - h2} width={bw} height={h2} fill="#10b981"><title>Lợi nhuận {vnd(d.profit)}</title></rect>
            <text x={x} y={H + 16} textAnchor="middle" fontSize="11">{d.label}</text>
          </g>
        )
      })}
      <text x="4" y={H + 28} fontSize="11" fill="#3b82f6">■ Doanh thu</text>
      <text x="100" y={H + 28} fontSize="11" fill="#10b981">■ Lợi nhuận ròng</text>
    </svg>
  )
}

function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="muted">Chưa có dữ liệu.</p>
  let acc = -Math.PI / 2
  const starts = data.map((d) => {
    const s = acc
    acc += (d.value / total) * Math.PI * 2
    return s
  })
  return (
    <div className="row">
      <svg viewBox="-1 -1 2 2" width="180" height="180">
        {data.map((d, i) => {
          const a = starts[i]
          const ang = (d.value / total) * Math.PI * 2
          const [x1, y1, x2, y2] = [Math.cos(a), Math.sin(a), Math.cos(a + ang), Math.sin(a + ang)]
          const path = data.length === 1
            ? <circle r="1" fill={COLORS[0]} />
            : <path d={`M0 0 L${x1} ${y1} A1 1 0 ${ang > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`} fill={COLORS[i % COLORS.length]} />
          return <g key={d.label}>{path}</g>
        })}
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.label}><span style={{ background: COLORS[i % COLORS.length] }} />{d.label}: {((d.value / total) * 100).toFixed(1)}%</li>
        ))}
      </ul>
    </div>
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

/* ---------- Orders & logistics ---------- */
function Orders({ orders, patchOrder }) {
  const [busy, setBusy] = useState('')
  const [carrier, setCarrier] = useState('GHN')
  const [pkg, setPkg] = useState({ weightKg: 1, length: 30, width: 20, height: 10 })
  const [mock, setMock] = useState(true)
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')

  const ship = async (o) => {
    setBusy(o.id)
    setErr('')
    try {
      const payload = buildShipment(o, orderTotals(o), pkg)
      const r = await createShipment(carrier, payload, { mock, token })
      patchOrder(o.id, { status: 'Đang giao', carrier, tracking: r.trackingId, waybillUrl: r.waybillUrl })
    } catch (e) {
      setErr(e.message)
    }
    setBusy('')
  }
  // Giả lập webhook bằng chính mapWebhook mà endpoint backend sẽ dùng
  const simulateWebhook = (o) => {
    const m = mapWebhook({ OrderCode: o.tracking, status: 'delivered' })
    if (m.trackingId === o.tracking) patchOrder(o.id, { status: m.status })
  }

  return (
    <>
      <div className="card">
        <h3>Cấu hình giao hàng</h3>
        <div className="row wrap">
          <label>Hãng<select value={carrier} onChange={(e) => setCarrier(e.target.value)}>{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select></label>
          {['weightKg', 'length', 'width', 'height'].map((k) => (
            <label key={k}>{{ weightKg: 'Cân (kg)', length: 'Dài', width: 'Rộng', height: 'Cao' }[k]}
              <input type="number" step="0.1" value={pkg[k]} onChange={(e) => setPkg({ ...pkg, [k]: +e.target.value })} /></label>
          ))}
          <label><input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} /> Chế độ giả lập</label>
          {!mock && <label>API Token<input value={token} onChange={(e) => setToken(e.target.value)} /></label>}
        </div>
        <small className="muted">Webhook: cấu hình <code>https://yourdomain.com{CARRIER_CONFIG[carrier].webhook}</code> tại {carrier}; backend gọi <code>mapWebhook()</code> trong logistics.js để cập nhật trạng thái.</small>
        {err && <p className="err">{err}</p>}
      </div>
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
                <td><select value={o.status} onChange={(e) => patchOrder(o.id, { status: e.target.value })}>{ORDER_STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
                <td>{o.tracking ? <>{o.carrier}: {o.tracking}<br /><a href={o.waybillUrl} target="_blank" rel="noreferrer">In tem</a></> : '—'}</td>
                <td>
                  {!o.tracking && ['Mới', 'Đã xác nhận'].includes(o.status) && <button className="primary" disabled={busy === o.id} onClick={() => ship(o)}>{busy === o.id ? '…' : 'Giao hàng'}</button>}
                  {o.tracking && o.status === 'Đang giao' && <button onClick={() => simulateWebhook(o)}>Giả lập webhook "đã giao"</button>}
                </td>
              </tr>
            )
          })}
          {!orders.length && <tr><td colSpan="9" className="muted">Chưa có đơn. Tạo ở tab "Đặt hàng & Tư vấn".</td></tr>}
        </tbody>
      </table>
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
