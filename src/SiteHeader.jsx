import { useRef, useState } from 'react'
import { api } from './api'
import { BackButton, Brand, ThemeToggle, useTheme } from './ui'

// Cắt giữa ảnh thành hình vuông 256px, nén JPEG để lưu gọn trong tài khoản
async function squareAvatar(file, size = 256) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Không đọc được ảnh'))
      i.src = url
    })
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size)
    return c.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Ảnh đại diện bấm để đổi; có nút xóa ảnh
export function AvatarEditor({ user, setUser, size = 88 }) {
  const file = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (avatar) => {
    setBusy(true)
    setErr('')
    try {
      setUser((await api('/me/avatar', { method: 'PUT', body: { avatar } })).user)
    } catch (x) {
      setErr(x.message)
    } finally {
      setBusy(false)
    }
  }
  const pick = async (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setErr('Vui lòng chọn tệp hình ảnh')
    try { await save(await squareAvatar(f)) } catch (x) { setErr(x.message) }
  }
  return (
    <div className="avatar-editor">
      <button type="button" className="avatar-btn" onClick={() => file.current?.click()} disabled={busy} aria-label="Đổi ảnh đại diện" title="Đổi ảnh đại diện">
        <Avatar user={user} size={size} />
        <span className="avatar-cam" aria-hidden="true">{busy ? '…' : '📷'}</span>
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
      {user.avatar && <button type="button" className="link-btn" disabled={busy} onClick={() => save('')}>Xóa ảnh</button>}
      {err && <small className="err">{err}</small>}
    </div>
  )
}

const initials = (user) => {
  const n = (user?.name || '').trim()
  if (n) return n.split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase()
  return (user?.phone || user?.username || '?').slice(-2)
}

// Ảnh đại diện; chưa có ảnh thì hiện chữ cái đầu tên (hoặc 2 số cuối SĐT)
export function Avatar({ user, size = 32 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  return user?.avatar
    ? <img className="avatar" src={user.avatar} alt="" style={style} />
    : <span className="avatar avatar-text" style={style} aria-hidden="true">{initials(user)}</span>
}

export const displayName = (user) => user?.name || user?.phone || user?.username || ''

// Thanh đầu trang dùng chung cho các trang khách: quay lại, logo, sáng/tối, tài khoản, giỏ hàng
export function SiteHeader({ user, cartCount = 0, backFallback, children }) {
  const [dark, setDark] = useTheme()
  return (
    <header>
      <BackButton fallback={backFallback} />
      <a href="/order" className="brand-link" aria-label="Về trang chủ"><Brand /></a>
      <span className="muted tagline" style={{ flex: 1 }}>Order hàng Taobao/1688 chính ngạch · giá rõ ràng</span>
      {children}
      <ThemeToggle dark={dark} setDark={setDark} />
      <a className="btn-link account-link" href="/account" title={user ? 'Tài khoản của tôi' : 'Đăng nhập / Đăng ký'}>
        {user ? <><Avatar user={user} size={26} /><span className="account-name">{displayName(user).split(' ').pop()}</span></> : 'Đăng nhập'}
      </a>
      <a className="cart-btn btn-link" href="/cart" aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}>
        🛒{cartCount > 0 && <span className="new-dot" key={cartCount}>{cartCount}</span>}
      </a>
    </header>
  )
}

// Thanh điều hướng dưới cùng trên điện thoại
export function BottomBar({ active, cartCount = 0 }) {
  const item = (key, href, icon, label) => (
    <a href={href} className={active === key ? 'on' : ''} aria-current={active === key ? 'page' : undefined}>
      {icon}<span key={key === 'cart' ? cartCount : undefined} className={key === 'cart' && cartCount ? 'bump' : ''}>{label}</span>
    </a>
  )
  return (
    <nav className="bottom-bar" aria-label="Điều hướng">
      {item('shop', '/order', '🛍', 'Mẫu hàng')}
      {item('cart', '/cart', '🛒', `Giỏ hàng${cartCount ? ` (${cartCount})` : ''}`)}
      {item('account', '/account', '👤', 'Tài khoản')}
    </nav>
  )
}
