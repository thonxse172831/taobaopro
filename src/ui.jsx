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

// Điều hướng trong app (đổi tab/trang không tải lại) có đánh số để biết còn trang trước hay không
export const pushPath = (path) => {
  if (location.pathname === path) return
  history.pushState({ idx: (history.state?.idx ?? 0) + 1 }, '', path)
}
export const replacePath = (path) => history.replaceState(history.state, '', path)
export function canGoBack() {
  if ((history.state?.idx ?? 0) > 0) return true
  try { return !!document.referrer && new URL(document.referrer).origin === location.origin } catch { return false }
}

// Nút quay lại trang/tab trước; không có trang trước trong shop thì về `fallback` (đường dẫn hoặc hàm)
export function BackButton({ fallback }) {
  const back = canGoBack()
  if (!back && !fallback) return null
  const go = () => {
    if (back) history.back()
    else if (typeof fallback === 'function') fallback()
    else location.assign(fallback)
  }
  return (
    <button type="button" className="back-btn" onClick={go} title="Quay lại trang trước" aria-label="Quay lại trang trước">
      <span aria-hidden="true">←</span><span className="back-label">Quay lại</span>
    </button>
  )
}

// Biểu tượng quét ảnh: vạch quét chạy lên xuống, phần tô màu bên dưới co giãn theo (busy = quét nhanh)
export function ScanIcon({ size = 22, busy = false }) {
  return (
    <svg className={'scan-icon' + (busy ? ' busy' : '')} width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round">
        <path d="M58 175V92a32 32 0 0 1 32-32h62" />
        <path d="M360 60h62a32 32 0 0 1 32 32v83" />
        <path d="M58 392v28a32 32 0 0 0 32 32h62" />
        <path d="M360 452h62a32 32 0 0 0 32-32v-28" />
        <rect x="136" y="136" width="240" height="238" rx="28" />
      </g>
      <rect className="scan-fill" x="149" y="275" width="214" height="86" rx="10" />
      <path className="scan-line" d="M16 275H496" stroke="currentColor" strokeWidth="26" strokeLinecap="round" />
    </svg>
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
