import { useEffect, useState } from 'react'
import { usePersisted } from './lib'

// Ô số giữ chuỗi người dùng đang gõ (cho phép xóa trống, "0,5"), chỉ đẩy số hợp lệ lên ngoài
export function NumInput({ value, onChange, ...rest }) {
  const [text, setText] = useState(null)
  const shown = text ?? String(value ?? '')
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        const t = e.target.value
        if (!/^\d*[.,]?\d*$/.test(t)) return
        setText(t)
        const n = parseFloat(t.replace(',', '.'))
        onChange(Number.isFinite(n) ? n : 0)
      }}
      onBlur={() => setText(null)}
    />
  )
}

export function ThemeToggle({ dark, setDark }) {
  return (
    <button className="icon-btn" onClick={() => setDark(!dark)} title="Đổi giao diện sáng/tối">
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

export function useTheme() {
  const [dark, setDark] = usePersisted('tb_dark', window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  return [dark, setDark]
}

// Logo thương hiệu: chỉ biểu tượng ở header, đầy đủ (kèm chữ THANH NGÂN) ở trang đăng nhập
export function Brand({ full = false, label = 'TN Shop' }) {
  if (full) return <img className="brand-full" src="/logo.png" alt="Thanh Ngân" />
  return (
    <span className="brand">
      <img src="/logo-mark.png" alt="" />
      <b className="logo">{label}</b>
    </span>
  )
}
