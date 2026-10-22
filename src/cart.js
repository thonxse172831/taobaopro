import { useEffect, useRef } from 'react'
import { api } from './api'
import { usePersisted } from './lib'

export const CART_MAX_LINES = 20 // server nhận tối đa 20 dòng hàng mỗi đơn
export const CART_KEY = 'tb_cart'
const keyOf = (l) => `${l.productId}|${l.size}|${l.color}`
const asList = (v) => (Array.isArray(v) ? v : [])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function readLocal() {
  try { return asList(JSON.parse(localStorage.getItem(CART_KEY))) } catch { return [] }
}

// Gộp giỏ trên máy vào giỏ của tài khoản: trùng mẫu + size + màu thì giữ số lượng lớn hơn
export function mergeLines(server, local) {
  const out = asList(server).map((l) => ({ ...l }))
  for (const l of asList(local)) {
    const hit = out.find((x) => keyOf(x) === keyOf(l))
    if (hit) hit.qty = Math.max(hit.qty, l.qty)
    else out.push({ ...l })
  }
  return out.slice(-CART_MAX_LINES)
}

// Giỏ hàng: luôn lưu trong trình duyệt; khi đã đăng nhập thì đồng bộ thêm với tài khoản (dùng được trên nhiều thiết bị)
export function useCart(user) {
  const [lines, setLines] = usePersisted(CART_KEY, [])
  const cart = asList(lines)
  const username = user?.username
  const synced = useRef('') // tài khoản đã gộp giỏ xong; trước đó không đẩy lên để tránh ghi đè giỏ trên server
  const fromServer = useRef(false)
  const timer = useRef(null)
  const seq = useRef(0)
  const pending = useRef(false)

  // Đăng nhập → gộp giỏ; quay lại tab → lấy giỏ mới nhất (có thể vừa sửa trên thiết bị khác)
  useEffect(() => {
    if (!username) { synced.current = ''; return }
    let live = true
    const pull = async (merge) => {
      if (pending.current) return
      try {
        const { items } = await api('/me/cart')
        if (!live || pending.current) return
        const local = readLocal()
        const next = merge ? mergeLines(items, local) : items
        synced.current = username
        if (same(next, local)) {
          // Giỏ trên máy giữ nguyên; nếu server còn thiếu (giỏ khách vãng lai) thì đẩy lên ngay
          if (!same(next, items)) api('/me/cart', { method: 'PUT', body: { items: next } }).catch(() => {})
          return
        }
        // Đúng bằng giỏ trên server thì không cần ghi lại; khác (vừa gộp) thì để effect bên dưới đẩy lên
        fromServer.current = same(next, items)
        setLines(next)
      } catch { /* mất mạng: tạm dùng giỏ trên máy */ }
    }
    pull(true)
    const onVis = () => { if (document.visibilityState === 'visible' && synced.current === username) pull(false) }
    document.addEventListener('visibilitychange', onVis)
    return () => { live = false; document.removeEventListener('visibilitychange', onVis) }
  }, [username, setLines])

  // Giỏ thay đổi do khách → lưu lên tài khoản (gộp các thay đổi liên tiếp)
  useEffect(() => {
    if (fromServer.current) { fromServer.current = false; return }
    if (!username || synced.current !== username) return
    pending.current = true
    const n = ++seq.current
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      api('/me/cart', { method: 'PUT', body: { items: asList(lines) } })
        .catch(() => {})
        .finally(() => { if (n === seq.current) pending.current = false })
    }, 600)
  }, [lines, username])

  const add = (line) => setLines((ls) => {
    const list = asList(ls)
    const k = keyOf(line)
    const i = list.findIndex((l) => keyOf(l) === k)
    if (i >= 0) return list.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l))
    return [...list, { productId: line.productId, size: line.size, color: line.color, qty: Math.min(99, line.qty) }].slice(-CART_MAX_LINES)
  })
  const setQty = (i, qty) => setLines((ls) => asList(ls).map((l, j) => (j === i ? { ...l, qty: Math.min(99, Math.max(1, qty)) } : l)))
  const remove = (i) => setLines((ls) => asList(ls).filter((_, j) => j !== i))
  const clear = () => setLines([])
  const count = cart.reduce((n, l) => n + l.qty, 0)

  return { cart, add, setQty, remove, clear, count }
}

// Ghép dòng giỏ với dữ liệu mẫu hiện tại; mẫu đã bị xóa khỏi shop thì bỏ ra
export function cartLines(cart, products) {
  return cart.map((l, i) => ({ ...l, i, p: products.find((p) => p.id === l.productId) })).filter((l) => l.p)
}
