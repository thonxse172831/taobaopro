import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

// Dữ liệu admin nạp một lần khi đăng nhập, sau đó mọi thay đổi được ghi lên server
let cache = {}
export const loadAdminState = async () => { cache = await api('/admin/state') }

// Một kết nối SSE dùng chung cho mọi hook
const listeners = { orders: new Set(), state: new Set(), payments: new Set(), open: new Set() }
let es
function ensureStream() {
  if (es) return
  es = new EventSource('/api/admin/events')
  es.addEventListener('orders', () => listeners.orders.forEach((f) => f()))
  es.addEventListener('state', () => listeners.state.forEach((f) => f()))
  es.addEventListener('payments', () => listeners.payments.forEach((f) => f()))
  es.onopen = () => listeners.open.forEach((f) => f())
}
function subscribe(ev, fn) {
  ensureStream()
  listeners[ev].add(fn)
  return () => listeners[ev].delete(fn)
}

const saveTimers = {}
const dirty = new Set()
function scheduleSave(key, value) {
  dirty.add(key)
  clearTimeout(saveTimers[key])
  saveTimers[key] = setTimeout(() => api(`/admin/state/${key}`, { method: 'PUT', body: { value } }).catch(() => {}).finally(() => dirty.delete(key)), 500)
}

export function useServerKV(key, initial) {
  const cur = useRef(cache[key] ?? initial)
  const [v, setV] = useState(cur.current)
  const set = useCallback((fn) => {
    const next = typeof fn === 'function' ? fn(cur.current) : fn
    cur.current = next
    setV(next)
    scheduleSave(key, next)
  }, [key])

  // Server báo dữ liệu đổi (VD: lưu mẫu từ bookmarklet) → nạp lại nếu chưa có thay đổi đang chờ ghi
  useEffect(() => subscribe('state', async () => {
    try {
      const s = await api('/admin/state')
      if (dirty.has(key) || s[key] === undefined) return
      cache = s
      cur.current = s[key]
      setV(s[key])
    } catch { /* mất mạng tạm thời */ }
  }), [key])
  return [v, set]
}

// Giao dịch ngân hàng SePay báo về (mới nhất trước), realtime qua SSE
export function usePayments() {
  const [list, setList] = useState([])
  const reload = useCallback(() => api('/admin/payments').then(setList).catch(() => {}), [])
  useEffect(() => {
    reload()
    const offs = [subscribe('payments', reload), subscribe('open', reload)]
    return () => offs.forEach((f) => f())
  }, [reload])
  return { list, reload }
}

// Đơn hàng: ghi từng đơn (khách có thể đặt đơn mới bất kỳ lúc nào), realtime qua SSE
export function useOrders() {
  const cur = useRef(cache.orders || [])
  const [orders, setState] = useState(cur.current)
  const [newCount, setNewCount] = useState(0)
  const pending = useRef(0)

  const set = useCallback((fn) => {
    const prev = cur.current
    const next = typeof fn === 'function' ? fn(prev) : fn
    cur.current = next
    setState(next)
    const before = new Map(prev.map((o) => [o.id, o]))
    const ids = new Set(next.map((o) => o.id))
    const calls = [
      ...next.filter((o) => before.get(o.id) !== o).map((o) => api(`/admin/orders/${o.id}`, { method: 'PUT', body: o })),
      ...prev.filter((o) => !ids.has(o.id)).map((o) => api(`/admin/orders/${o.id}`, { method: 'DELETE' })),
    ]
    pending.current += calls.length
    calls.forEach((p) => p.catch(() => {}).finally(() => { pending.current -= 1 }))
  }, [])

  useEffect(() => {
    let retry
    const pull = async () => {
      if (pending.current > 0) { clearTimeout(retry); retry = setTimeout(pull, 700); return }
      try {
        const list = await api('/admin/orders')
        if (pending.current > 0) { clearTimeout(retry); retry = setTimeout(pull, 700); return }
        const have = new Set(cur.current.map((o) => o.id))
        const fresh = list.filter((o) => !have.has(o.id)).length
        if (fresh) setNewCount((n) => n + fresh)
        cur.current = list
        setState(list)
      } catch { /* mất mạng tạm thời */ }
    }
    const offs = [subscribe('orders', pull), subscribe('open', pull)]
    const t = setInterval(pull, 30000)
    return () => { offs.forEach((f) => f()); clearInterval(t); clearTimeout(retry) }
  }, [])

  return { orders, setOrders: set, newCount, clearNew: () => setNewCount(0) }
}
