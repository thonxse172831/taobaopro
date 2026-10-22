import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { CART_KEY } from './cart'
import { BackButton, Brand, ThemeToggle, useTheme } from './ui'

export function useAccount() {
  const [user, setUser] = useState(undefined)
  const refresh = useCallback(() => api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)), [])
  useEffect(() => { refresh() }, [refresh])
  // Giỏ đã lưu trong tài khoản; xóa bản trên máy để người dùng chung máy không thấy
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    try { localStorage.setItem(CART_KEY, '[]') } catch { /* bỏ qua */ }
    setUser(null)
  }
  return { user, setUser, logout }
}

// Captcha chữ + số do server tạo (ảnh SVG), dùng một lần
function Captcha({ token, svg, value, onChange, onReload }) {
  return (
    <label>Mã xác thực
      <span className="captcha">
        {svg ? <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Mã xác thực gồm chữ và số" /> : <span className="captcha-ph">Đang tải…</span>}
        <button type="button" className="icon-btn" onClick={onReload} title="Đổi mã khác" aria-label="Đổi mã khác">↻</button>
        <input required autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8} disabled={!token} placeholder="Nhập mã" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )
}

// Form đăng nhập / đăng ký; khách dùng SĐT + mật khẩu, admin dùng tên đăng nhập (allowRegister=false)
export function AuthForm({ onDone, initialMode = 'login', allowRegister = true, loginLabel = 'Số điện thoại' }) {
  const [mode, setMode] = useState(allowRegister ? initialMode : 'login')
  const [f, setF] = useState({ username: '', password: '', confirm: '', captcha: '' })
  const [cap, setCap] = useState({ token: '', svg: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reg = mode === 'register'

  const reloadCaptcha = useCallback(() => {
    setCap({ token: '', svg: '' })
    setF((x) => ({ ...x, captcha: '' }))
    api('/auth/captcha').then(setCap).catch((x) => setErr(x.message))
  }, [])
  // Mở form đăng ký là hiện captcha ngay
  useEffect(() => { if (reg) reloadCaptcha() }, [reg, reloadCaptcha])

  const mismatch = reg && f.confirm && f.confirm !== f.password
  const submit = async (e) => {
    e.preventDefault()
    if (reg && f.password !== f.confirm) return setErr('Mật khẩu nhập lại không khớp')
    setBusy(true)
    setErr('')
    try {
      const r = reg
        ? await api('/auth/register', { method: 'POST', body: { phone: f.username, password: f.password, confirm: f.confirm, captcha: f.captcha, captchaToken: cap.token } })
        : await api('/auth/login', { method: 'POST', body: { username: f.username, password: f.password } })
      onDone(r.user)
    } catch (x) {
      setErr(x.message)
      if (reg) reloadCaptcha() // mã chỉ dùng một lần
    } finally {
      setBusy(false)
    }
  }
  const switchTo = (m) => { setMode(m); setErr(''); setF((x) => ({ ...x, confirm: '', captcha: '' })) }

  return (
    <form className="card login-card" onSubmit={submit}>
      {allowRegister && (
        <div className="seg">
          <button type="button" className={!reg ? 'on' : ''} onClick={() => switchTo('login')}>Đăng nhập</button>
          <button type="button" className={reg ? 'on' : ''} onClick={() => switchTo('register')}>Đăng ký</button>
        </div>
      )}
      <label>{reg ? 'Số điện thoại' : loginLabel}
        {reg || loginLabel === 'Số điện thoại'
          ? <input autoFocus required type="tel" inputMode="tel" autoComplete="tel" placeholder="0901234567" value={f.username} onChange={set('username')} />
          : <input autoFocus required autoCapitalize="none" autoComplete="username" value={f.username} onChange={set('username')} />}
      </label>
      <label>Mật khẩu
        <input required type="password" minLength={reg ? 6 : undefined} autoComplete={reg ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
      </label>
      {reg && (
        <>
          <label>Nhập lại mật khẩu
            <input required type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} aria-invalid={!!mismatch} />
          </label>
          {mismatch && <small className="err">Mật khẩu nhập lại chưa khớp</small>}
          <Captcha token={cap.token} svg={cap.svg} value={f.captcha} onChange={(v) => setF((x) => ({ ...x, captcha: v }))} onReload={reloadCaptcha} />
          <small className="muted">Mật khẩu tối thiểu 6 ký tự. Mã xác thực không phân biệt chữ hoa/thường.</small>
        </>
      )}
      {err && <p className="err">{err}</p>}
      <button className="primary" disabled={busy || !f.username || !f.password || (reg && (!f.confirm || mismatch || !f.captcha || !cap.token))}>
        {busy ? '…' : reg ? 'Tạo tài khoản' : 'Đăng nhập'}
      </button>
    </form>
  )
}

// Trang /login: admin chuyển sang /admin, khách quay về /order
export function LoginPage() {
  const [dark, setDark] = useTheme()
  const done = (u) => { location.href = u.role === 'admin' ? '/admin' : '/account' }
  return (
    <div className="login">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <BackButton fallback="/order" />
          <Brand />
          <ThemeToggle dark={dark} setDark={setDark} />
        </div>
        <Brand full />
        <AuthForm onDone={done} allowRegister={false} loginLabel="SĐT hoặc tên đăng nhập" />
        <p style={{ textAlign: 'center' }}><a href="/order" className="muted">← Về trang mua sắm</a></p>
      </div>
    </div>
  )
}
