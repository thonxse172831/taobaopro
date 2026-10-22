import { useEffect, useState } from 'react'
import { api } from './api'
import { loadAdminState } from './store'
import { AuthForm } from './Account'
import { Brand, ThemeToggle, useTheme } from './ui'

export default function AdminGate({ children }) {
  const [state, setState] = useState('checking')
  const [err, setErr] = useState('')
  const [dark, setDark] = useTheme()

  const enter = async () => {
    await loadAdminState()
    setState('in')
  }

  useEffect(() => {
    api('/auth/me').then((r) => (r.user?.role === 'admin' ? enter() : setState('out'))).catch((e) => { setErr(e.message); setState('out') })
    const on = () => setState('out')
    window.addEventListener('tb-unauthorized', on)
    return () => window.removeEventListener('tb-unauthorized', on)
  }, [])

  const done = (u) => {
    if (u.role !== 'admin') return setErr('Tài khoản này không có quyền quản trị')
    setErr('')
    enter()
  }

  if (state === 'checking') return <div className="login"><p className="muted">Đang tải…</p></div>
  if (state === 'in') return children({ logout: async () => { await api('/auth/logout', { method: 'POST' }); setState('out') } })

  return (
    <div className="login">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <Brand label="TN Shop · Quản trị" />
          <ThemeToggle dark={dark} setDark={setDark} />
        </div>
        <Brand full />
        <AuthForm onDone={done} allowRegister={false} loginLabel="Tên đăng nhập" />
        {err && <p className="err">{err}</p>}
        <p style={{ textAlign: 'center' }}><a href="/order" className="muted">← Về trang khách</a></p>
      </div>
    </div>
  )
}
