import { useEffect, useRef, useState } from 'react'
import { useServerKV } from './store'
import { uid, today, priceBreakdown, vnd } from './lib'

const URL_RE = /https?:\/\/[^\s"'<>[\]()]+/g
const isShop = (u) => /(taobao|tmall|1688|yangkeduo|pinduoduo)\.com|tb\.cn/i.test(u)

export const extractLinks = (text) => [...new Set((text.match(URL_RE) || []).filter(isShop))]

// Link FB thường bọc link gốc: l.facebook.com/l.php?u=<encoded>
export function unwrapFb(u) {
  try {
    const x = new URL(u)
    if (/facebook\.com$/.test(x.hostname) && x.searchParams.get('u')) return x.searchParams.get('u')
    // Pinduoduo: bỏ tham số chia sẻ/theo dõi, chỉ giữ goods_id
    if (/yangkeduo|pinduoduo/.test(x.hostname) && x.searchParams.get('goods_id')) {
      return `https://mobile.yangkeduo.com/goods1.html?goods_id=${x.searchParams.get('goods_id')}`
    }
  } catch { /* giữ nguyên */ }
  return u
}

export function itemIdOf(u) {
  try {
    const x = new URL(u)
    return x.searchParams.get('goods_id') || x.searchParams.get('id') || x.searchParams.get('offerId') || (u.match(/offer\/(\d+)/) || [])[1] || ''
  } catch {
    return ''
  }
}

// API giá: GET endpoint có {url} và {id}, trả JSON { price: number, title?: string }.
// Cần backend/dịch vụ trung gian (Taobao chặn gọi trực tiếp từ trình duyệt).
async function fetchPrice(link, { mock, endpoint }) {
  if (mock) {
    await new Promise((r) => setTimeout(r, 200))
    const base = link.priceCny ?? 50 + Math.random() * 150
    const next = Math.max(1, +(base * (1 + (Math.random() - 0.5) * 0.1)).toFixed(2))
    return { price: next, title: link.title }
  }
  const res = await fetch(endpoint.replace('{url}', encodeURIComponent(link.url)).replace('{id}', link.itemId))
  if (!res.ok) throw new Error('API lỗi ' + res.status)
  const d = await res.json()
  if (typeof d.price !== 'number') throw new Error('Phản hồi thiếu price')
  return d
}

export default function Links({ products, setProducts, rate, cfg: pricing }) {
  const [links, setLinks] = useServerKV('links', [])
  const [cfg, setCfg] = useServerKV('linkcfg', { mock: true, endpoint: 'http://localhost:3001/price?url={url}', minutes: 30, auto: false, syncProduct: true })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const state = useRef({})
  state.current = { links, cfg, products }

  const add = () => {
    const urls = [...new Set(extractLinks(text).map(unwrapFb))]
    const exist = new Set(links.map((l) => l.url))
    const fresh = urls.filter((u) => !exist.has(u)).map((url) => ({ id: uid(), url, itemId: itemIdOf(url), title: '', priceCny: null, history: [], productId: '', updatedAt: '' }))
    setLinks((l) => [...fresh, ...l])
    setMsg(`Äã thêm ${fresh.length} link (bỏ ${urls.length - fresh.length} trùng).`)
    setText('')
  }

  const refresh = async () => {
    const { links: ls, cfg: c } = state.current
    setBusy(true)
    const out = []
    for (const l of ls) {
      try {
        const r = await fetchPrice(l, c)
        const changed = r.price !== l.priceCny
        out.push({
          ...l, title: r.title || l.title, prevPrice: changed ? l.priceCny : l.prevPrice, priceCny: r.price, error: '', updatedAt: new Date().toLocaleString('vi-VN'),
          history: changed ? [...l.history.slice(-29), { d: today(), p: r.price }] : l.history,
        })
      } catch (e) {
        out.push({ ...l, error: e.message })
      }
    }
    setLinks(out)
    if (c.syncProduct) {
      setProducts((ps) => ps.map((p) => {
        const l = out.find((x) => x.productId === p.id && x.priceCny != null)
        return l ? { ...p, priceCny: l.priceCny } : p
      }))
    }
    setBusy(false)
  }

  useEffect(() => {
    if (!cfg.auto) return
    const t = setInterval(refresh, Math.max(1, cfg.minutes) * 60000)
    return () => clearInterval(t)
  }, [cfg.auto, cfg.minutes])

  const upd = (id, patch) => setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const setC = (k) => (e) => setCfg({ ...cfg, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value })

  return (
    <>
      <div className="card">
        <h3>Link Taobao/1688 đã lưu (từ Facebook…)</h3>
        <p className="muted">Dán nội dung bài lưu/nhiều link cùng lúc; hệ thống tự lọc link Taobao/Tmall/1688 và bóc link gốc từ link Facebook.</p>
        <textarea rows="4" style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán các link vào đây…" />
        <div className="row"><button className="primary" onClick={add}>Thêm link</button>{msg && <span className="ok">{msg}</span>}</div>
      </div>
      <div className="card">
        <h3>Tự động cập nhật giá</h3>
        <div className="row wrap">
          <label><span><input type="checkbox" checked={cfg.auto} onChange={setC('auto')} /> Tự cập nhật khi đang mở web</span></label>
          <label>Mỗi (phút)<input type="number" min="1" value={cfg.minutes} onChange={setC('minutes')} /></label>
          <label><span><input type="checkbox" checked={cfg.syncProduct} onChange={setC('syncProduct')} /> Cập nhật giá nhập của mẫu liên kết</span></label>
          <label><span><input type="checkbox" checked={cfg.mock} onChange={setC('mock')} /> Giả lập (giá ngẫu nhiên)</span></label>
          {!cfg.mock && <label>API giá<input style={{ minWidth: 320 }} value={cfg.endpoint} onChange={setC('endpoint')} /></label>}
          <button className="primary" disabled={busy || !links.length} onClick={refresh}>{busy ? 'Đang cập nhật…' : 'Cập nhật ngay'}</button>
        </div>
        <small className="muted">API thật: <code>GET endpoint</code> với <code>{'{url}'}</code>/<code>{'{id}'}</code>, trả <code>{'{"price": 123.5, "title": "..."}'}</code>. Taobao chặn trình duyệt gọi trực tiếp nên cần backend hoặc dịch vụ trung gian.</small>
      </div>
      <table>
        <thead><tr><th>Link</th><th>Giá nội địa (¥)</th><th>Quy VNĐ (final)</th><th>Lịch sử</th><th>Gắn với mẫu</th><th /></tr></thead>
        <tbody>
          {links.map((l) => {
            const diff = l.prevPrice != null && l.priceCny != null ? l.priceCny - l.prevPrice : 0
            return (
              <tr key={l.id}>
                <td><a href={l.url} target="_blank" rel="noreferrer">{l.title || l.itemId || l.url.slice(0, 50)}</a>{l.error && <div className="err">{l.error}</div>}<br /><small>{l.updatedAt}</small></td>
                <td>{l.priceCny ?? '—'} {diff !== 0 && <b style={{ color: diff > 0 ? '#dc2626' : '#059669' }}>{diff > 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(2)}</b>}</td>
                <td>{l.priceCny != null ? (() => {
                  const p = products.find((x) => x.id === l.productId)
                  const b = priceBreakdown({ priceCny: l.priceCny, domesticShipCny: p?.domesticShipCny, weightKg: p?.weightKg }, rate, pricing)
                  return <b title={`Hàng ${vnd(b.goods)} + cửa khẩu ${vnd(b.border)} + công ${vnd(b.labor)} + ship ${vnd(b.ship)}`}>{vnd(b.final)}</b>
                })() : '—'}</td>
                <td><small>{l.history.slice(-5).map((h) => `${h.d}: ${h.p}`).join(' | ')}</small></td>
                <td>
                  <select value={l.productId} onChange={(e) => upd(l.id, { productId: e.target.value })}>
                    <option value="">— chưa gắn —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td><button onClick={() => setLinks(links.filter((x) => x.id !== l.id))}>Xóa</button></td>
              </tr>
            )
          })}
          {!links.length && <tr><td colSpan="6" className="muted">Chưa có link.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

