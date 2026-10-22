import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { ThemeToggle, useTheme } from './ui'
import { vnd } from './lib'

export function useAccount() {
  const [user, setUser] = useState(undefined)
  const refresh = useCallback(() => api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)), [])
  useEffect(() => { refresh() }, [refresh])
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null) }
  return { user, setUser, logout }
}

// Form đăng nhập / đăng ký dùng chung; onDone nhận về user sau khi thành công
export function AuthForm({ onDone, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [f, setF] = useState({ username: '', password: '', name: '', phone: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reg = mode === 'register'

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api(reg ? '/auth/register' : '/auth/login', { method: 'POST', body: f })
      onDone(r.user)
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card login-card" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={!reg ? 'on' : ''} onClick={() => { setMode('login'); setErr('') }}>Đăng nhập</button>
        <button type="button" className={reg ? 'on' : ''} onClick={() => { setMode('register'); setErr('') }}>Đăng ký</button>
      </div>
      {reg && <label>Họ tên<input autoComplete="name" value={f.name} onChange={set('name')} /></label>}
      {reg && <label>Số điện thoại<input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></label>}
      <label>Tên đăng nhập
        <input autoFocus autoCapitalize="none" autoComplete="username" value={f.username} onChange={set('username')} />
      </label>
      <label>Mật khẩu
        <input type="password" autoComplete={reg ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
      </label>
      {reg && <small className="muted">Tên đăng nhập viết thường không dấu, mật khẩu tối thiểu 6 ký tự.</small>}
      {err && <p className="err">{err}</p>}
      <button className="primary" disabled={busy || !f.username || !f.password || (reg && !f.name)}>
        {busy ? '…' : reg ? 'Tạo tài khoản' : 'Đăng nhập'}
      </button>
    </form>
  )
}

// Trang /login: admin chuyển sang /admin, khách quay về /order
export function LoginPage() {
  const [dark, setDark] = useTheme()
  const done = (u) => { location.href = u.role === 'admin' ? '/admin' : '/order' }
  return (
    <div className="login">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <b className="logo">TN Shop</b>
          <ThemeToggle dark={dark} setDark={setDark} />
        </div>
        <AuthForm onDone={done} />
        <p style={{ textAlign: 'center' }}><a href="/order" className="muted">← Về trang mua sắm</a></p>
      </div>
    </div>
  )
}

export function MyOrders({ onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/me/orders').then(setRows).catch(() => setRows([])) }, [])
  return (
    <div className="modal" onClick={onClose}>
      <div className="card modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>🧾 Đơn của tôi</h3>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        {rows === null && <p className="muted">Đang tải…</p>}
        {rows?.length === 0 && <p className="muted">Bạn chưa có đơn nào.</p>}
        {rows?.map((o) => (
          <div key={o.id} className="card" style={{ marginTop: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{o.id}</b><span className="badge">{o.status}</span>
            </div>
            {o.items.map((i, k) => <small key={k} style={{ display: 'block' }}>{i.name} · {i.size} · {i.color} · x{i.qty} · {vnd(i.price * i.qty)}</small>)}
            <small className="muted">{o.createdAt}</small>
            {o.trackCode && <> · <a href={`/track/${o.trackCode}`}>Theo dõi →</a></>}
          </div>
        ))}
      </div>
    </div>
  )
}
