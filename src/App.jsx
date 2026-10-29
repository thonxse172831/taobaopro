import { useCallback, useEffect, useRef, useState } from 'react'
import { BackButton, Brand, NumInput, ThemeToggle, pushPath, useTheme } from './ui'
import {
  vnd, today, uid, rateOn, costVnd, orderTotals, copyForCustomer, DEFAULT_PRICING, priceBreakdown, FEE_MODES,
  normalizeCfg, withCosts, fullAddress, STOCK_STATUS, ORDER_STATUS, STATUS_LABEL, normStatus, newTrackCode, SEED_PRODUCTS, DEFAULT_SHOP, usePersisted, depositEnabled, depositOf,
} from './lib'
import { ChatBox, OrderForm } from './Customer'
import Links from './Links'
import Workspace, { DEFAULT_LAYOUTS } from './Workspace'
import Kanban, { Hl, STATUS_COLOR, orderMatches } from './Kanban'
import OrderEditor from './OrderEditor'
import ImageManager from './ImageManager'
import { productImages } from './images'
import { useShipping, ShippingConfig } from './Shipping'
import ShopSettings from './ShopSettings'
import Scan from './Scan'
import Bill from './Bill'
import Payments from './Payments'
import { BarChart, PieChart, Metrics, dashboardStats } from './charts'
import { detectCnTracking, nearestWaitingOrder } from './track'
import { useServerKV, useOrders, useChats } from './store'
import Inbox from './Inbox'

const TABS = [
  ['work', 'Bàn làm việc'], ['stats', 'Thống kê'], ['catalog', 'Mẫu hàng'], ['links', 'Link đã lưu'], ['orders', 'Đơn hàng'],
  ['scan', 'Quét mã'], ['pricing', 'Giá & Thuế'], ['shop', 'Cửa hàng'], ['form', 'Đặt hàng & Tư vấn'], ['inbox', 'Tin nhắn'],
]
// Menu bên trái: nhóm theo công việc, kèm biểu tượng và mô tả ngắn hiện ở đầu trang
const NAV = [
  ['Vận hành', [['work', 'layout', 'Đơn cần xử lý & bảng Kanban'], ['orders', 'orders', 'Theo dõi, giao hàng, in hóa đơn'], ['inbox', 'inbox', 'Khách cần nhân viên hỗ trợ trực tiếp'], ['scan', 'scan', 'Quét tem để xuất kho'], ['form', 'chat', 'Tạo đơn nhanh & thử bot tư vấn']]],
  ['Sản phẩm', [['catalog', 'box', 'Thêm, sửa mẫu và giá bán'], ['links', 'link', 'Link Taobao/1688 đã lưu & giá']]],
  ['Kinh doanh', [['stats', 'chart', 'Doanh thu, lợi nhuận, tồn kho'], ['pricing', 'percent', 'Tỷ giá, công thức giá, thuế']]],
  ['Cài đặt', [['shop', 'store', 'Ngân hàng, câu chốt đơn, bookmarklet']]],
]
const TAB_LABEL = Object.fromEntries(TABS)
const TAB_DESC = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([id, , d]) => [id, d])))
const ICON = {
  layout: 'M4 4h6v8H4z M14 4h6v5h-6z M14 13h6v7h-6z M4 16h6v4H4z',
  orders: 'M9 3h6v3H9z M8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2 M9 11h6 M9 15h4',
  scan: 'M3 8V5a2 2 0 0 1 2-2h3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M8 21H5a2 2 0 0 1-2-2v-3 M7 12h10',
  chat: 'M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z M9 10h6 M9 13h3',
  box: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1 M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  chart: 'M4 20V11 M10 20V5 M16 20v-6 M21 20H3',
  percent: 'M19 5 5 19 M7.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M16.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  store: 'M4 9.5 5.5 4h13L20 9.5 M4 9.5V20h16V9.5 M4 9.5h16 M9.5 20v-5h5v5',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  inbox: 'M3 13h5l2 3h4l2-3h5 M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  plus: 'M12 5v14 M5 12h14',
  paste: 'M9 3h6v3H9z M8 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-2 M12 10v7 M9 14l3 3 3-3',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 8l-4 4 4 4 M6 12h10',
  collapse: 'M15 6l-6 6 6 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
}
export const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[name]} /></svg>
)

// Tab nằm trên đường dẫn (/admin/orders…) để nút Quay lại / nút Back điện thoại về đúng tab trước
const tabOf = () => {
  const t = location.pathname.split('/')[2]
  return TABS.some(([id]) => id === t) ? t : 'work'
}

export default function App({ logout }) {
  const [tab, setTabState] = useState(tabOf)
  const setTab = useCallback((id) => {
    pushPath(id === 'work' ? '/admin' : `/admin/${id}`)
    setTabState(id)
  }, [])
  useEffect(() => {
    const on = () => setTabState(tabOf())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  const [collapsed, setCollapsed] = usePersisted('tb_admin_collapsed', false)
  const [drawer, setDrawer] = useState(false) // menu trượt trên điện thoại
  const go = (id) => {
    setTab(id)
    if (id === 'orders' || id === 'work') clearNew()
    setDrawer(false)
    window.scrollTo({ top: 0 })
  }
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
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBox = useRef(null)
  const [modal, setModal] = useState(null)
  const [bill, setBill] = useState(null)
  const [suggest, setSuggest] = useState(null)
  const [pick, setPick] = useState(null)
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
  const chats = useChats()
  const badge = (id) => (id === 'orders' ? newCount : id === 'inbox' ? chats.unread : 0)
  // Có khách mới cần nhân viên → báo ngay dù đang ở tab khác
  const prevWaiting = useRef(null)
  useEffect(() => {
    const ids = chats.list.filter((c) => c.status === 'waiting' && c.unread).map((c) => c.id)
    const prev = prevWaiting.current
    prevWaiting.current = new Set(ids)
    if (!prev) return
    const fresh = chats.list.filter((c) => ids.includes(c.id) && !prev.has(c.id))
    if (fresh.length) notify(`💬 ${fresh.map((c) => c.name).join(', ')} cần nhân viên hỗ trợ — xem ở Tin nhắn`)
  }, [chats.list, notify])
  const shown = orders.filter((o) => orderMatches(o, q))
  const found = q.trim() ? shown.slice(0, 8) : []
  // Bấm ra ngoài thì thu bảng kết quả tìm kiếm
  useEffect(() => {
    if (!searchOpen) return
    const on = (e) => { if (!searchBox.current?.contains(e.target)) setSearchOpen(false) }
    document.addEventListener('mousedown', on)
    return () => document.removeEventListener('mousedown', on)
  }, [searchOpen])
  const editOrder = (o) => { setSearchOpen(false); setModal({ edit: o.id }) }
  // Hủy đơn: hỏi lý do (có thể bỏ trống), giữ lại đơn để còn tra cứu
  const cancelOrder = (o) => {
    const reason = prompt(`Hủy đơn ${o.id} của ${o.customer.name}?\nLý do hủy (có thể để trống):`, '')
    if (reason === null) return
    patchOrder(o.id, { status: 'Đã hủy', cancelReason: reason.trim().slice(0, 200), canceledAt: new Date().toISOString() })
    if (modal?.edit === o.id) setModal(null)
    notify(`Đã hủy đơn ${o.id}`)
  }
  // Lưu đơn đã sửa: mẫu mới thêm được tính giá vốn; đơn chờ cọc tính lại số tiền cọc theo tổng mới
  const saveEdit = (o, p) => {
    const priced = withCosts({ ...o, items: p.items }, products, rates, cfg).items
    const patch = { ...p, items: p.items.map((i, k) => (i.cost != null ? i : priced[k])) }
    if (normStatus(o.status) === 'Chờ cọc' && depositEnabled(shop)) patch.depositDue = depositOf(orderTotals({ ...o, ...patch }).revenue, shop.depositPct)
    patchOrder(o.id, patch)
    setModal(null)
    notify(`Đã lưu đơn ${o.id}`)
  }
  const ctx = { products, shop, sh, patchOrder, onBill: setBill, notify, onEdit: editOrder, onCancel: cancelOrder, q }

  // Báo cho shop khi đơn vừa đủ cọc (SePay xác nhận tự động)
  const prevStatus = useRef(null)
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = new Map(orders.map((o) => [o.id, o.status]))
    if (!prev) return
    const paid = orders.filter((o) => o.status === 'Mới' && o.paidAt && !o.paidManual && prev.get(o.id) !== 'Mới')
    if (paid.length) notify(`💰 ${paid.map((o) => `${o.id} (${o.customer.name}) đã cọc ${vnd(o.depositPaid)}`).join(' · ')} — đơn chuyển sang "Chờ đặt hàng"`)
  }, [orders, notify])

  // Mã vận đơn TQ: nhận diện khi dán hoặc khi bấm nút, rồi gợi ý gán vào đơn chờ gần nhất
  const ordersRef = useRef(orders)
  useEffect(() => { ordersRef.current = orders }, [orders])
  const detect = useCallback((text, manual) => {
    const hit = detectCnTracking(text)
    if (!hit) return manual && notify('Không thấy mã vận đơn TQ trong nội dung đã copy')
    const o = nearestWaitingOrder(ordersRef.current)
    if (!o) return notify(`Mã ${hit.code} (${hit.carrier}) nhưng không còn đơn nào đang chờ gán`)
    setSuggest({ ...hit, orderId: o.id })
  }, [notify, setSuggest])
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
        if (!['work', 'orders'].includes(tabOf())) setTab('orders')
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
  }, [detect, setTab])

  const editing = modal?.edit && orders.find((o) => o.id === modal.edit)
  const sug = suggest && orders.find((o) => o.id === suggest.orderId)

  return (
    <div className={'app admin' + (collapsed ? ' collapsed' : '') + (drawer ? ' drawer-open' : '')}>
      <aside className="side" aria-label="Menu quản trị">
        <div className="side-brand">
          <Brand label="TN Shop" />
          <span className="side-role">Quản trị</span>
        </div>
        <nav className="side-nav">
          {NAV.map(([group, items]) => (
            <div className="side-group" key={group}>
              <span className="side-group-title">{group}</span>
              {items.map(([id, icon]) => (
                <button key={id} type="button" className={'side-item' + (id === tab ? ' active' : '')} onClick={() => go(id)} title={collapsed ? TAB_LABEL[id] : undefined} aria-current={id === tab ? 'page' : undefined}>
                  <Icon name={icon} />
                  <span className="side-label">{TAB_LABEL[id]}</span>
                  {badge(id) > 0 && <span className="new-dot" key={badge(id)}>{badge(id)}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <span className="rate-chip" title="Tỷ giá áp dụng hôm nay">¥1 = {vnd(rate)}</span>
          <a className="side-item" href="/order" target="_blank" rel="noreferrer"><Icon name="external" /><span className="side-label">Trang khách</span></a>
          <button type="button" className="side-item" onClick={logout}><Icon name="logout" /><span className="side-label">Đăng xuất</span></button>
          <button type="button" className="side-item side-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>
            <Icon name="collapse" /><span className="side-label">Thu gọn menu</span>
          </button>
        </div>
      </aside>
      {drawer && <div className="side-backdrop" onClick={() => setDrawer(false)} />}

      <div className="admin-body">
      <header className="admin-top">
        <button type="button" className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Mở menu"><Icon name="menu" /></button>
        <BackButton fallback={tab !== 'work' ? () => setTab('work') : null} />
        <div className="page-head">
          <h1>{TAB_LABEL[tab]}</h1>
          <small className="muted">{TAB_DESC[tab]}</small>
        </div>
        <div className="search-wrap" ref={searchBox}>
          <label className="admin-search">
            <Icon name="search" size={18} />
            <input ref={searchRef} type="search" placeholder="Tìm khách, SĐT, mã đơn… (Ctrl+F)" aria-label="Tìm đơn hàng" value={q}
              onChange={(e) => { setQ(e.target.value); setSearchOpen(true) }} onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setSearchOpen(false) } if (e.key === 'Enter' && found[0]) editOrder(found[0]) }} />
          </label>
          {searchOpen && q.trim() && <SearchResults q={q} found={found} total={shown.length} onPick={editOrder} onAll={() => { setSearchOpen(false); go('orders') }} />}
        </div>
        <button type="button" className="icon-btn" onClick={readClipboard} title="Dán mã vận đơn TQ từ clipboard" aria-label="Dán mã vận đơn TQ"><Icon name="paste" /></button>
        <ThemeToggle dark={dark} setDark={setDark} />
        <button className="primary new-order" onClick={() => setModal('new')} title="Ctrl+N hoặc Alt+N"><Icon name="plus" size={18} /><span>Đơn mới</span></button>
      </header>
      {suggest && sug && (
        <div className="suggest">
          <span>📦 Phát hiện mã vận đơn TQ <b>{suggest.code}</b> ({suggest.carrier}). Gán vào đơn <b>{sug.id}</b> — {sug.customer.name}?</span>
          <button className="primary" onClick={assign}>Gán</button>
          <button onClick={() => setSuggest(null)}>Bỏ qua</button>
        </div>
      )}
      <main>
        {(tab === 'work' || tab === 'orders') && <Payments orders={orders} notify={notify} />}
        {tab === 'work' && <Workspace layouts={layouts} setLayouts={setLayouts} orders={shown} setOrders={setOrders} rate={rate} cfg={cfg} {...ctx} />}
        {tab === 'stats' && <Dashboard products={products} orders={orders} rate={rate} cfg={cfg} />}
        {tab === 'catalog' && <Catalog products={products} setProducts={setProducts} rate={rate} cfg={cfg} />}
        {tab === 'links' && <Links products={products} setProducts={setProducts} rate={rate} cfg={cfg} />}
        {tab === 'orders' && <Orders orders={shown} ctx={ctx} />}
        {tab === 'scan' && <Scan orders={orders} patchOrder={patchOrder} />}
        {tab === 'inbox' && <Inbox chats={chats} notify={notify} onFindOrders={(phone) => { setQ(phone); go('orders') }} />}
        {tab === 'pricing' && <Pricing rates={rates} setRates={setRates} cfg={cfg} setCfg={setCfg} orders={orders} setOrders={setOrders} />}
        {tab === 'shop' && <ShopSettings shop={shop} setShop={setShop} notify={notify} />}
        {tab === 'form' && (
          <div className="grid2 top">
            <OrderForm products={products} onSubmit={addOrder} pick={pick} smart />
            <ChatBox products={products} onBuy={(id) => { setPick({ id, n: Date.now() }); document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' }) }} />
          </div>
        )}
      </main>
      </div>

      <nav className="admin-tabbar" aria-label="Điều hướng nhanh">
        {[['work', 'layout', 'Bàn làm việc'], ['orders', 'orders', 'Đơn hàng']].map(([id, icon, label]) => (
          <button key={id} type="button" className={id === tab ? 'on' : ''} onClick={() => go(id)}>
            <Icon name={icon} /><span>{label}</span>{id === 'orders' && newCount > 0 && <i className="new-dot">{newCount}</i>}
          </button>
        ))}
        <button type="button" className="tabbar-new" onClick={() => setModal('new')} aria-label="Tạo đơn mới"><Icon name="plus" size={26} /></button>
        <button type="button" className={tab === 'inbox' ? 'on' : ''} onClick={() => go('inbox')}><Icon name="inbox" /><span>Tin nhắn</span>{chats.unread > 0 && <i className="new-dot">{chats.unread}</i>}</button>
        <button type="button" onClick={() => setDrawer(true)}><Icon name="menu" /><span>Menu</span></button>
      </nav>

      {modal === 'new' && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box">
            <OrderForm products={products} onSubmit={(o) => { const r = addOrder(o); notify(`Đã tạo đơn ${r.id}`); setModal(null); return r }} smart />
            <button onClick={() => setModal(null)}>Đóng (Esc)</button>
          </div>
        </div>
      )}
      {editing && <OrderEditor o={editing} products={products} onClose={() => setModal(null)} onSave={(p) => saveEdit(editing, p)} onCancel={cancelOrder} />}
      {bill && <Bill order={bill} shop={shop} onClose={() => setBill(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// Kết quả tìm kiếm nổi bật ngay dưới ô tìm: tô sáng phần khớp, bấm để mở sửa đơn
function SearchResults({ q, found, total, onPick, onAll }) {
  return (
    <div className="search-results" role="listbox" aria-label="Kết quả tìm kiếm">
      <div className="sr-head"><b>{total} đơn khớp “{q.trim()}”</b><small className="muted">Enter để mở đơn đầu · Esc để đóng</small></div>
      {found.map((o) => {
        const st = normStatus(o.status)
        return (
          <button key={o.id} type="button" className="sr-item" role="option" onClick={() => onPick(o)} style={{ '--c': STATUS_COLOR[st] }}>
            <span className="sr-top"><b><Hl text={o.id} q={q} /></b><span className="sr-status"><i className="kdot" />{STATUS_LABEL[st]}</span></span>
            <span className="sr-name"><Hl text={o.customer.name} q={q} /> · <Hl text={o.customer.phone} q={q} /></span>
            <small className="muted sr-sub"><Hl text={o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')} q={q} /></small>
            <span className="sr-total">{vnd(orderTotals(o).revenue)}</span>
          </button>
        )
      })}
      {!found.length && <p className="muted sr-empty">Không tìm thấy đơn nào. Thử tên không dấu, 4 số cuối SĐT hoặc mã đơn.</p>}
      {total > found.length && <button type="button" className="sr-all" onClick={onAll}>Xem tất cả {total} đơn trong tab Đơn hàng →</button>}
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
const blankP = { name: '', image: '', images: [], sourceUrl: '', priceCny: '', domesticShipCny: 0, weightKg: 0.5, sizes: '', colors: '', tags: '', category: '', priceVnd: '', stock: 1, status: 'TQ' }

function Catalog({ products, setProducts, rate, cfg }) {
  const [f, setF] = useState(blankP)
  const [editId, setEditId] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

  const [uploading, setUploading] = useState(0)
  // ImageManager gọi kiểu setState (giá trị hoặc hàm cập nhật)
  const setImages = (next) => setF((x) => ({ ...x, images: typeof next === 'function' ? next(x.images || []) : next }))
  const submit = (e) => {
    e.preventDefault()
    const p = {
      ...f, priceCny: +f.priceCny, domesticShipCny: +f.domesticShipCny, weightKg: +f.weightKg, priceVnd: +f.priceVnd, stock: +f.stock,
      sizes: list(f.sizes), colors: list(f.colors), tags: list(f.tags),
      images: f.images || [], image: f.images?.[0] || '', // ảnh đầu tiên là ảnh chính
    }
    if (editId) setProducts((ps) => ps.map((x) => (x.id === editId ? { ...x, ...p } : x)))
    else setProducts((ps) => [{ ...p, id: uid(), createdAt: today() }, ...ps])
    setF(blankP)
    setEditId(null)
  }
  const edit = (p) => {
    setEditId(p.id)
    setF({ ...p, images: productImages(p), sizes: p.sizes.join(', '), colors: p.colors.join(', '), tags: p.tags.join(', ') })
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
        <ImageManager images={f.images || []} onChange={setImages} onBusy={setUploading} />
        {f.priceCny !== '' && <p>Giá final (vốn): <b>{vnd(pv)}</b>{f.priceVnd && <> · Lãi gộp: <b>{vnd(f.priceVnd - pv)}</b></>} <button type="button" onClick={() => setF({ ...f, priceVnd: Math.ceil(pv / 1000) * 1000 })}>Dùng làm giá bán</button></p>}
        <button className="primary" disabled={uploading > 0}>{uploading ? 'Đang tải ảnh…' : editId ? 'Lưu' : 'Thêm'}</button>
        {editId && <button type="button" onClick={() => { setEditId(null); setF(blankP) }}>Hủy</button>}
      </form>
      <div className="row"><input placeholder="Tìm tên / tag / danh mục…" value={q} onChange={(e) => setQ(e.target.value)} />{msg && <span className="ok">{msg}</span>}</div>
      <div className="products">
        {shown.map((p) => (
          <div className="card product" key={p.id}>
            <div className="product-media">
              {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="noimg">Chưa có ảnh</div>}
              {productImages(p).length > 1 && <span className="img-count">📷 {productImages(p).length}</span>}
            </div>
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
  const { sh, patchOrder, onBill, notify, onEdit, onCancel, q } = ctx

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
                    <td><b><Hl text={o.id} q={q} /></b><br /><small>{o.createdAt}</small></td>
                    <td><Hl text={o.customer.name} q={q} /><br /><small><Hl text={o.customer.phone} q={q} /></small><br /><small>{fullAddress(o.customer)}</small></td>
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
                      <button onClick={() => onEdit(o)} title="Sửa đơn">✏️ Sửa</button>
                      <button onClick={() => onBill(o)}>🧾 Bill</button>
                      {!['Hoàn thành', 'Đã hủy'].includes(normStatus(o.status)) && <button className="cancel-btn" onClick={() => onCancel(o)} title="Hủy đơn">✕ Hủy</button>}
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
