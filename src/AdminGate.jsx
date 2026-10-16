import { useEffect, useState } from 'react'
import { api } from './api'
import { loadAdminState } from './store'
import { ThemeToggle, useTheme } from './ui'

export default function AdminGate({ children }) {
  const [state, setState] = useState('checking')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [dark, setDark] = useTheme()

  const enter = async () => {
    await loadAdminState()
    setState('in')
  }

  useEffect(() => {
    api('/auth/me').then((r) => (r.authed ? enter() : setState('out'))).catch((e) => { setErr(e.message); setState('out') })
    const on = () => setState('out')
    window.addEventListener('tb-unauthorized', on)
    return () => window.removeEventListener('tb-unauthorized', on)
  }, [])

  const login = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api('/auth/login', { method: 'POST', body: { password: pw } })
      setPw('')
      await enter()
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking') return <div className="login"><p className="muted">Đang tải…</p></div>
  if (state === 'in') return children({ logout: async () => { await api('/auth/logout', { method: 'POST' }); setState('out') } })

  return (
    <div className="login">
      <form className="card login-card" onSubmit={login}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b className="logo">TaobaoPro</b>
          <ThemeToggle dark={dark} setDark={setDark} />
        </div>
        <h3>Đăng nhập quản trị</h3>
        <label>Mật khẩu
          <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy || !pw}>{busy ? '…' : 'Đăng nhập'}</button>
        <a href="/order" className="muted">← Về trang khách</a>
      </form>
    </div>
  )
}
