import { vnd, daysAgo, costVnd, orderTotals, normStatus } from './lib'

export const COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#64748b']

export function dashboardStats(products, orders, rate, cfg) {
  const done = orders.filter((o) => o.status === 'Hoàn thành')
  const byMonth = {}
  const byCat = {}
  done.forEach((o) => {
    const t = orderTotals(o)
    const m = (o.deliveredAt || o.createdAt).slice(0, 7)
    byMonth[m] = byMonth[m] || { revenue: 0, profit: 0 }
    byMonth[m].revenue += t.revenue
    byMonth[m].profit += t.profit
    o.items.forEach((i) => {
      const c = products.find((x) => x.id === i.productId)?.category || 'Khác'
      byCat[c] = (byCat[c] || 0) + i.price * i.qty
    })
  })
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const taxQuarter = done
    .filter((o) => {
      const d = new Date(o.deliveredAt || o.createdAt)
      return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q && !o.taxPaid
    })
    .reduce((s, o) => s + orderTotals(o).tax, 0)
  const old = products.filter((p) => p.status === 'READY' && p.stock > 0 && daysAgo(p.createdAt) > 30)
  return {
    months: Object.keys(byMonth).sort().map((m) => ({ label: m, ...byMonth[m] })),
    cats: Object.entries(byCat).map(([label, value]) => ({ label, value })),
    taxQuarter,
    old,
    stuck: products.filter((p) => p.status === 'TQ').reduce((s, p) => s + p.stock * costVnd(p, rate, cfg), 0),
    cod: orders.filter((o) => ['Đã mua', 'Kho TQ', 'Đang về', 'Kho VN', 'Đã xuất kho', 'Đang giao'].includes(normStatus(o.status))).reduce((s, o) => s + orderTotals(o).cod, 0),
  }
}

export const Metric = ({ title, value, warn, icon, tone }) => (
  <div className={'card metric' + (warn ? ' warn' : '')} style={tone ? { '--tone': tone } : undefined}>
    {icon && <span className="metric-icon" aria-hidden="true">{icon}</span>}
    <span className="muted">{title}</span><b>{value}</b>
  </div>
)

export function Metrics({ s }) {
  return (
    <div className="cards">
      <Metric icon="📦" tone="#f59e0b" title="Tồn quá 30 ngày" value={`${s.old.length} mẫu / ${s.old.reduce((n, p) => n + p.stock, 0)} sp`} warn={s.old.length > 0} />
      <Metric icon="🚢" tone="#6366f1" title="Giá trị hàng kẹt kho TQ" value={vnd(s.stuck)} />
      <Metric icon="🧾" tone="#0ea5e9" title="Thuế cần nộp trong quý" value={vnd(s.taxQuarter)} />
      <Metric icon="💰" tone="#10b981" title="Công nợ COD chờ thu" value={vnd(s.cod)} />
    </div>
  )
}

export function BarChart({ data }) {
  if (!data.length) return <p className="muted">Chưa có đơn hoàn thành.</p>
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.profit, 1]))
  const W = 480, H = 220, bw = Math.min(30, W / data.length / 3)
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%">
      {data.map((d, i) => {
        const x = (i + 0.5) * (W / data.length)
        const h1 = (d.revenue / max) * H
        const h2 = (Math.max(d.profit, 0) / max) * H
        return (
          <g key={d.label}>
            <rect x={x - bw} y={H - h1} width={bw} height={h1} rx="4" fill="#3b82f6"><title>Doanh thu {vnd(d.revenue)}</title></rect>
            <rect x={x} y={H - h2} width={bw} height={h2} rx="4" fill="#10b981"><title>Lợi nhuận {vnd(d.profit)}</title></rect>
            <text x={x} y={H + 16} textAnchor="middle" fontSize="11" fill="currentColor">{d.label}</text>
          </g>
        )
      })}
      <text x="4" y={H + 28} fontSize="11" fill="#3b82f6">■ Doanh thu</text>
      <text x="100" y={H + 28} fontSize="11" fill="#10b981">■ Lợi nhuận ròng</text>
    </svg>
  )
}

export function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="muted">Chưa có dữ liệu.</p>
  let acc = -Math.PI / 2
  const starts = data.map((d) => {
    const s = acc
    acc += (d.value / total) * Math.PI * 2
    return s
  })
  return (
    <div className="row">
      <svg viewBox="-1 -1 2 2" width="180" height="180">
        {data.map((d, i) => {
          const a = starts[i]
          const ang = (d.value / total) * Math.PI * 2
          const [x1, y1, x2, y2] = [Math.cos(a), Math.sin(a), Math.cos(a + ang), Math.sin(a + ang)]
          return data.length === 1
            ? <circle key={d.label} r="1" fill={COLORS[0]} />
            : <path key={d.label} d={`M0 0 L${x1} ${y1} A1 1 0 ${ang > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`} fill={COLORS[i % COLORS.length]} />
        })}
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.label}><span style={{ background: COLORS[i % COLORS.length] }} />{d.label}: {((d.value / total) * 100).toFixed(1)}%</li>
        ))}
      </ul>
    </div>
  )
}
