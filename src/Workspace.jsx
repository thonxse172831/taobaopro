import { useState } from 'react'
import { vnd, uid, orderTotals, normStatus, isStale, FINAL_STATUS, ORDER_STATUS, STATUS_LABEL, today } from './lib'
import { BarChart, PieChart, Metrics, dashboardStats } from './charts'
import Kanban, { OrderCard } from './Kanban'

export const WIDGETS = {
  urgent: 'Đơn cần xử lý gấp',
  kanban: 'Bảng Kanban',
  metrics: 'Thẻ chỉ số',
  revenue: 'Biểu đồ doanh thu & lợi nhuận',
  pie: 'Biểu đồ tỷ trọng danh mục',
  tax: 'Quỹ thuế khoán',
  compact: 'Danh sách đơn thu gọn',
}

export const DEFAULT_LAYOUTS = {
  active: 'l1',
  items: [
    { id: 'l1', name: 'Layout 1 · Xử lý đơn', widgets: ['urgent', 'kanban'] },
    { id: 'l2', name: 'Layout 2 · Sổ sách', widgets: ['metrics', 'revenue', 'pie', 'tax', 'compact'] },
  ],
}

const isUrgent = (o) => {
  const st = normStatus(o.status)
  if (FINAL_STATUS.includes(st) || st === 'Chờ cọc') return false
  return st === 'Mới' || isStale(o) || (st === 'Kho VN' && !o.tracking) || o.createdAt === today()
}

function Widget({ id, c }) {
  const stats = dashboardStats(c.products, c.orders, c.rate, c.cfg)
  const cardProps = { products: c.products, shop: c.shop, sh: c.sh, patchOrder: c.patchOrder, onBill: c.onBill, notify: c.notify, onEdit: c.onEdit }
  if (id === 'urgent') {
    const list = c.orders.filter(isUrgent)
    return (
      <div className="card">
        <h3>🔥 Đơn cần xử lý gấp ({list.length})</h3>
        <div className="kgrid">{list.map((o) => <OrderCard key={o.id} o={o} {...cardProps} />)}</div>
        {!list.length && <p className="muted">Không có đơn nào cần xử lý gấp 🎉</p>}
      </div>
    )
  }
  if (id === 'kanban') return <Kanban orders={c.orders} {...cardProps} />
  if (id === 'metrics') return <Metrics s={stats} />
  if (id === 'revenue') return <div className="card"><h3>Doanh thu & Lợi nhuận ròng theo tháng</h3><BarChart data={stats.months} /></div>
  if (id === 'pie') return <div className="card"><h3>Tỷ trọng doanh thu theo danh mục</h3><PieChart data={stats.cats} /></div>
  if (id === 'tax') {
    const pending = c.orders.filter((o) => o.status === 'Hoàn thành' && !o.taxPaid)
    return (
      <div className="card">
        <h3>Quỹ thuế khoán (1,5%)</h3>
        <p className="big">Chờ nộp: {vnd(pending.reduce((s, o) => s + orderTotals(o).tax, 0))}</p>
        <p className="muted">{pending.length} đơn hoàn thành chưa kê khai · Quý này: {vnd(stats.taxQuarter)}</p>
      </div>
    )
  }
  return (
    <div className="card">
      <h3>Danh sách đơn</h3>
      <table>
        <tbody>
          {c.orders.slice(0, 30).map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td><td>{o.customer.name}</td><td>{vnd(orderTotals(o).revenue)}</td>
              <td><select value={normStatus(o.status)} onChange={(e) => c.patchOrder(o.id, { status: e.target.value })}>{ORDER_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></td>
            </tr>
          ))}
          {!c.orders.length && <tr><td className="muted">Chưa có đơn.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// Bàn làm việc: nhiều bố cục lưu sẵn, chuyển nhanh bằng một chạm
export default function Workspace({ layouts, setLayouts, ...c }) {
  const [edit, setEdit] = useState(false)
  const L = layouts?.items?.length ? layouts : DEFAULT_LAYOUTS
  const cur = L.items.find((l) => l.id === L.active) || L.items[0]
  const upd = (patch) => setLayouts({ ...L, ...patch })
  const patchCur = (p) => upd({ items: L.items.map((l) => (l.id === cur.id ? { ...l, ...p } : l)) })
  const toggle = (w) => patchCur({ widgets: cur.widgets.includes(w) ? cur.widgets.filter((x) => x !== w) : [...cur.widgets, w] })
  const move = (w, d) => {
    const a = [...cur.widgets]
    const i = a.indexOf(w)
    const j = i + d
    if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
    patchCur({ widgets: a })
  }
  const add = () => {
    const id = uid()
    upd({ active: id, items: [...L.items, { id, name: `Layout ${L.items.length + 1}`, widgets: ['kanban'] }] })
    setEdit(true)
  }

  return (
    <>
      <div className="row wrap layout-bar">
        {L.items.map((l) => <button key={l.id} className={l.id === cur.id ? 'on' : ''} onClick={() => upd({ active: l.id })}>{l.name}</button>)}
        <button onClick={add} title="Thêm layout">＋</button>
        <button onClick={() => setEdit(!edit)}>{edit ? 'Xong' : '⚙ Tùy chỉnh'}</button>
      </div>
      {edit && (
        <div className="card">
          <label>Tên layout<input value={cur.name} onChange={(e) => patchCur({ name: e.target.value })} /></label>
          <h4>Thành phần hiển thị (theo thứ tự)</h4>
          {Object.entries(WIDGETS).map(([k, label]) => (
            <div className="row" key={k}>
              <label className="check"><input type="checkbox" checked={cur.widgets.includes(k)} onChange={() => toggle(k)} /> {label}</label>
              {cur.widgets.includes(k) && <><button onClick={() => move(k, -1)}>↑</button><button onClick={() => move(k, 1)}>↓</button></>}
            </div>
          ))}
          {L.items.length > 1 && <button onClick={() => confirm('Xóa layout này?') && upd({ items: L.items.filter((l) => l.id !== cur.id), active: L.items.find((l) => l.id !== cur.id).id })}>Xóa layout</button>}
        </div>
      )}
      {cur.widgets.map((w) => <Widget key={w} id={w} c={c} />)}
    </>
  )
}
