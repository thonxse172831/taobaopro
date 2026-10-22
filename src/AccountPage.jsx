import { useEffect, useState } from 'react'
import { api } from './api'
import { AuthForm, useAccount } from './Account'
import { EMPTY_RECIPIENT, RecipientFields, addrText, recipientError } from './Checkout'
import { useCart } from './cart'
import { AvatarEditor, BottomBar, SiteHeader, displayName } from './SiteHeader'
import { pushPath } from './ui'
import { vnd } from './lib'

const TABS = [['orders', '🧾 Đơn của tôi'], ['addresses', '📍 Sổ địa chỉ'], ['profile', '👤 Tài khoản']]
const tabOf = () => {
  const t = location.pathname.split('/')[2]
  return TABS.some(([id]) => id === t) ? t : 'orders'
}

// Trang /account: khách đăng ký / đăng nhập, quản lý sổ địa chỉ, xem đơn đã đặt
export default function AccountPage() {
  const { user, setUser, logout } = useAccount()
  const cart = useCart(user)
  const [tab, setTabState] = useState(tabOf)
  const setTab = (id) => {
    pushPath(id === 'orders' ? '/account' : `/account/${id}`)
    setTabState(id)
  }
  useEffect(() => {
    const on = () => setTabState(tabOf())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  return (
    <div className="app shop account">
      <SiteHeader user={user} cartCount={cart.count} backFallback={user && tab !== 'orders' ? () => setTab('orders') : '/order'} />
      <main style={{ maxWidth: 760 }}>
        {user === undefined && <p className="muted">Đang tải…</p>}
        {user === null && (
          <div style={{ maxWidth: 400, margin: '0 auto' }}>
            <h2 style={{ textAlign: 'center' }}>Tài khoản khách hàng</h2>
            <p className="muted" style={{ textAlign: 'center' }}>Lưu địa chỉ nhận hàng, đặt nhanh hơn và theo dõi mọi đơn của bạn.</p>
            <AuthForm onDone={setUser} initialMode="register" />
          </div>
        )}
        {user && (
          <>
            <div className="account-hello">
              <AvatarEditor user={user} setUser={setUser} size={64} />
              <div>
                <h2>Xin chào, {displayName(user)} 👋</h2>
                <small className="muted">{user.phone || user.username}</small>
              </div>
              <button type="button" className="logout" onClick={logout}>Đăng xuất</button>
            </div>
            {user.role === 'admin' && <p className="muted">Bạn đang đăng nhập tài khoản quản trị · <a href="/admin">Vào trang quản trị</a></p>}
            <div className="seg seg3">
              {TABS.map(([k, t]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}
            </div>
            {tab === 'orders' && <MyOrders cart={cart} />}
            {tab === 'addresses' && <AddressBook user={user} setUser={setUser} />}
            {tab === 'profile' && <Profile user={user} setUser={setUser} />}
          </>
        )}
      </main>
      <BottomBar active="account" cartCount={cart.count} />
    </div>
  )
}

const saveProfile = async (user, patch) => (await api('/me/profile', { method: 'PUT', body: { name: user.name, phone: user.phone, addresses: user.addresses, ...patch } })).user

function MyOrders({ cart }) {
  const [rows, setRows] = useState(null)
  const { add } = cart
  const [msg, setMsg] = useState('')
  useEffect(() => { api('/me/orders').then(setRows).catch(() => setRows([])) }, [])
  const again = (o) => {
    o.items.filter((i) => i.productId).forEach((i) => add({ productId: i.productId, size: i.size, color: i.color, qty: i.qty }))
    setMsg(`Đã thêm các mẫu của đơn ${o.id} vào giỏ`)
  }

  if (rows === null) return <p className="muted">Đang tải…</p>
  if (!rows.length) return <div className="card"><p className="muted">Bạn chưa có đơn nào. <a href="/order">Mua sắm ngay →</a></p></div>
  return (
    <>
      {msg && <p className="ok">{msg} · <a href="/cart">Xem giỏ hàng →</a></p>}
      {rows.map((o) => (
        <div key={o.id} className="card my-order">
          <div className="row" style={{ justifyContent: 'space-between', margin: 0 }}>
            <span><b>{o.id}</b> <small className="muted">· {o.createdAt}</small></span>
            <span className={'badge' + (o.status === 'Chờ cọc' ? ' warn' : o.status === 'Đã hủy' ? ' off' : '')}>{o.label}</span>
          </div>
          {o.items.map((i, k) => (
            <div className="row" key={k} style={{ justifyContent: 'space-between', margin: '6px 0' }}>
              <span>{i.name} <small className="muted">{[i.size, i.color].filter(Boolean).join(' · ')} × {i.qty}</small></span>
              <span>{vnd(i.price * i.qty)}</span>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 0', flexWrap: 'wrap' }}>
            <span>Tổng <b>{vnd(o.total)}</b>{o.deposit > 0 && <small className="muted"> · đã cọc {vnd(o.deposit)}</small>}</span>
            <span className="row" style={{ margin: 0 }}>
              {o.trackCode && <a className="btn-link" href={`/track/${o.trackCode}`}>{o.status === 'Chờ cọc' ? '💳 Chuyển cọc' : 'Theo dõi →'}</a>}
              <button type="button" onClick={() => again(o)}>Mua lại</button>
            </span>
          </div>
        </div>
      ))}
    </>
  )
}

function AddressBook({ user, setUser }) {
  const list = user.addresses || []
  const [edit, setEdit] = useState(null) // null | 'new' | id địa chỉ đang sửa
  const [f, setF] = useState(EMPTY_RECIPIENT)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const persist = async (addresses) => {
    setBusy(true)
    setErr('')
    try {
      setUser(await saveProfile(user, { addresses }))
      return true
    } catch (x) {
      setErr(x.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const open = (a) => {
    setErr('')
    setEdit(a ? a.id : 'new')
    setF(a ? { ...EMPTY_RECIPIENT, ...a } : { ...EMPTY_RECIPIENT, label: '', name: user.name, phone: user.phone })
  }
  const submit = async (e) => {
    e.preventDefault()
    const er = recipientError(f)
    if (er) return setErr(er)
    const next = edit === 'new' ? [...list, { ...f, isDefault: !list.length }] : list.map((a) => (a.id === edit ? { ...a, ...f } : a))
    if (await persist(next)) setEdit(null)
  }

  if (edit) {
    return (
      <form className="card" onSubmit={submit}>
        <h3>{edit === 'new' ? 'Thêm địa chỉ mới' : 'Sửa địa chỉ'}</h3>
        <label>Tên gợi nhớ<input value={f.label || ''} maxLength={30} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Nhà riêng, Công ty…" /></label>
        <RecipientFields value={f} onChange={setF} />
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu địa chỉ'}</button>
          <button type="button" onClick={() => setEdit(null)}>Hủy</button>
        </div>
      </form>
    )
  }
  return (
    <>
      {err && <p className="err">{err}</p>}
      {list.map((a) => (
        <div key={a.id} className={'card addr-entry' + (a.isDefault ? ' on' : '')}>
          <div>
            <b>{a.name}</b> · {a.phone}{a.label && <span className="tag">{a.label}</span>}{a.isDefault && <span className="tag">Mặc định</span>}
            <br /><small className="muted">{addrText(a)}</small>
          </div>
          <div className="row" style={{ margin: 0 }}>
            <button type="button" onClick={() => open(a)}>Sửa</button>
            {!a.isDefault && <button type="button" disabled={busy} onClick={() => persist(list.map((x) => ({ ...x, isDefault: x.id === a.id })))}>Đặt mặc định</button>}
            <button type="button" disabled={busy} onClick={() => confirm('Xóa địa chỉ này?') && persist(list.filter((x) => x.id !== a.id))}>Xóa</button>
          </div>
        </div>
      ))}
      {!list.length && <div className="card"><p className="muted">Chưa có địa chỉ nào. Thêm địa chỉ để lần sau đặt hàng chỉ cần một chạm.</p></div>}
      {list.length < 10 && <button className="primary" type="button" onClick={() => open(null)}>＋ Thêm địa chỉ</button>}
    </>
  )
}

function Profile({ user, setUser }) {
  const [f, setF] = useState({ name: user.name || '', phone: user.phone || '' })
  const phoneLogin = /^0\d{9}$/.test(user.username)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [msg, setMsg] = useState({ info: '', pw: '' })
  const [err, setErr] = useState({ info: '', pw: '' })

  const saveInfo = async (e) => {
    e.preventDefault()
    try {
      setUser(await saveProfile(user, { name: f.name, phone: f.phone }))
      setErr((x) => ({ ...x, info: '' }))
      setMsg((x) => ({ ...x, info: 'Đã lưu thông tin' }))
    } catch (x) { setErr((y) => ({ ...y, info: x.message })) }
  }
  const savePw = async (e) => {
    e.preventDefault()
    try {
      await api('/me/password', { method: 'POST', body: pw })
      setPw({ current: '', next: '' })
      setErr((x) => ({ ...x, pw: '' }))
      setMsg((x) => ({ ...x, pw: 'Đã đổi mật khẩu' }))
    } catch (x) { setErr((y) => ({ ...y, pw: x.message })) }
  }

  return (
    <div className="grid2 top">
      <form className="card" onSubmit={saveInfo}>
        <h3>Thông tin cá nhân</h3>
        {phoneLogin
          ? <label>Số điện thoại (dùng để đăng nhập)<input value={user.username} disabled /></label>
          : (
            <>
              <label>Tên đăng nhập<input value={user.username} disabled /></label>
              <label>Số điện thoại<input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            </>
          )}
        <label>Họ tên<input autoComplete="name" value={f.name} placeholder="Để shop xưng hô và điền sẵn khi đặt hàng" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        {err.info && <p className="err">{err.info}</p>}
        {msg.info && !err.info && <p className="ok">{msg.info}</p>}
        <button className="primary">Lưu</button>
      </form>
      <form className="card" onSubmit={savePw}>
        <h3>Đổi mật khẩu</h3>
        <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
        <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
        {err.pw && <p className="err">{err.pw}</p>}
        {msg.pw && !err.pw && <p className="ok">{msg.pw}</p>}
        <button className="primary" disabled={!pw.current || pw.next.length < 6}>Đổi mật khẩu</button>
      </form>
    </div>
  )
}
