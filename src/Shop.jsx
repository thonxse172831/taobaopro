import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { ChatBox, OrderForm } from './Customer'
import { MyOrders, useAccount } from './Account'
import { ThemeToggle, useTheme } from './ui'
import { vnd, STOCK_STATUS, ETA } from './lib'

// Trang dành cho khách: chỉ thấy giá bán, size, màu, thời gian nhận hàng (không có giá vốn)
export default function Shop() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  // Mẫu/giá do admin cập nhật sẽ hiện ngay, không cần tải lại trang
  useEffect(() => {
    const load = () => api('/public/catalog').then((r) => setProducts(r.products)).catch(() => {}).finally(() => setLoading(false))
    load()
    const es = new EventSource('/api/public/events')
    es.addEventListener('catalog', load)
    return () => es.close()
  }, [])
  const [dark, setDark] = useTheme()
  const { user, logout } = useAccount()
  const [mine, setMine] = useState(false)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [pick, setPick] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const tags = useMemo(() => [...new Set(products.flatMap((p) => p.tags))], [products])
  const shown = products.filter((p) => {
    const hay = (p.name + ' ' + p.category + ' ' + p.tags.join(' ')).toLowerCase()
    return hay.includes(q.toLowerCase()) && (!tag || p.tags.includes(tag))
  })

  const submit = (o) => api('/public/orders', { method: 'POST', body: o })
  const buy = (id) => {
    setPick({ id, n: Date.now() })
    go('order-form')
  }

  return (
    <div className="app shop">
      <header>
        <b className="logo">TaobaoPro</b>
        <span className="muted tagline" style={{ flex: 1 }}>Order hàng Taobao/1688 chính ngạch · giá rõ ràng</span>
        <ThemeToggle dark={dark} setDark={setDark} />
        {user === null && <button className="primary" onClick={() => { location.href = '/login' }}>Đăng nhập / Đăng ký</button>}
        {user && (
          <>
            <span className="muted">Xin chào, <b>{user.name}</b></span>
            {user.role === 'admin' ? <button onClick={() => { location.href = '/admin' }}>Quản trị</button> : <button onClick={() => setMine(true)}>Đơn của tôi</button>}
            <button onClick={logout}>Thoát</button>
          </>
        )}
      </header>
      {mine && <MyOrders onClose={() => setMine(false)} />}
      <main>
        <section className="hero">
          <h1>Mẫu hot mới về 🔥</h1>
          <p>Chọn mẫu, điền thông tin nhận hàng, shop xác nhận ngay.</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <input placeholder="Tìm mẫu…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          </div>
          <div className="chips" style={{ justifyContent: 'center' }}>
            <button className={!tag ? 'on' : ''} onClick={() => setTag('')}>Tất cả</button>
            {tags.map((t) => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(t)}>#{t}</button>)}
          </div>
        </section>

        <div className="products" id="catalog">
          {shown.map((p) => (
            <div className="card product" key={p.id}>
              {p.image ? <img src={p.image} alt={p.name} /> : <div className="noimg">Chưa có ảnh</div>}
              <b>{p.name}</b>
              <span className="price">{vnd(p.priceVnd)}</span>
              <small>Size: {p.sizes.join(', ')} · Màu: {p.colors.join(', ')}</small>
              <small className="badge">{STOCK_STATUS[p.status]} · nhận hàng {ETA[p.status]}</small>
              <button className="primary" onClick={() => buy(p.id)}>Đặt mua</button>
            </div>
          ))}
          {!shown.length && <p className="muted">Không có mẫu phù hợp.</p>}
        </div>

        <div className="grid2 top" style={{ marginTop: 24 }}>
          <OrderForm products={products} onSubmit={submit} pick={pick} showDeposit={false} prefill={user?.role === 'customer' ? user : null} />
          <div className={'chat-wrap sticky' + (chatOpen ? ' open' : '')}>
            <button type="button" className="sheet-close" onClick={() => setChatOpen(false)}>✕ Đóng</button>
            <ChatBox products={products} />
          </div>
        </div>
      </main>
      {chatOpen && <div className="backdrop" onClick={() => setChatOpen(false)} />}
      <nav className="bottom-bar">
        <button onClick={() => go('catalog')}>🛍<span>Mẫu hàng</span></button>
        <button className="cta" onClick={() => go('order-form')}>📝<span>Đặt hàng</span></button>
        <button onClick={() => setChatOpen(true)}>💬<span>Tư vấn</span></button>
      </nav>
    </div>
  )
}
