import { useState } from 'react'
import { vnd, orderTotals, fullAddress, ORDER_STATUS, STATUS_LABEL, normStatus, isStale, daysIn, FINAL_STATUS } from './lib'
import { fold } from './smartpaste'

export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function OrderCard({ o, sh, patchOrder, onBill, notify, onEdit, onCancel, q = '' }) {
  const status = normStatus(o.status)
  const t = orderTotals(o)
  const stale = isStale(o)
  const days = Math.floor(daysIn(o))

  const copyTrack = async () => {
    if (!o.trackCode) return notify('Đơn này chưa có mã theo dõi')
    notify(await copyText(`${location.origin}/track/${o.trackCode}`) ? 'Đã copy link theo dõi cho khách' : 'Trình duyệt chặn clipboard')
  }
  const waitDeposit = status === 'Chờ cọc'
  const canShip = !o.tracking && !FINAL_STATUS.includes(status) && !waitDeposit
  // Shop tự kiểm tra tài khoản rồi xác nhận tay (khi chưa bật SePay hoặc khách ghi sai nội dung)
  const confirmDeposit = () => {
    const due = o.depositDue || 0
    if (!confirm(`Xác nhận đã nhận đủ cọc ${vnd(due)} cho đơn ${o.id}?`)) return
    const paid = Math.max(o.depositPaid || 0, due)
    patchOrder(o.id, { status: 'Mới', depositPaid: paid, deposit: paid, paidAt: new Date().toISOString(), paidManual: true })
  }

  return (
    <div
      className={'kcard' + (stale ? ' stale' : '') + (status === 'Đã hủy' ? ' canceled' : '')}
      style={{ '--c': STATUS_COLOR[status] }}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move' }}
    >
      <div className="khead"><b><Hl text={o.id} q={q} /></b><small>{days >= 1 ? `${days} ngày` : 'hôm nay'}</small></div>
      <div><Hl text={o.customer.name} q={q} /> <small className="muted"><Hl text={o.customer.phone} q={q} /></small></div>
      <small className="muted">{o.items.map((i) => `${i.name} ${i.size}/${i.color} x${i.qty}`).join('; ')}</small>
      <div className="khead"><span>{vnd(t.revenue)}</span><small>COD {vnd(t.cod)}</small></div>
      {waitDeposit && <div className="deposit-line">⏳ Chờ cọc {vnd(o.depositDue)}{o.depositPaid > 0 && ` · đã nhận ${vnd(o.depositPaid)}`}</div>}
      {!waitDeposit && o.paidAt && <small className="ok">💰 Đã cọc {vnd(o.depositPaid)}{o.paidManual ? ' (xác nhận tay)' : ' (tự động)'}</small>}
      {stale && <div className="warn-line">⚠ Chờ kho TQ nhận quá {days} ngày — kiểm tra shop TQ / khiếu nại</div>}
      {o.cnTracking && <small>📦 {o.cnCarrier || 'TQ'}: <Hl text={o.cnTracking} q={q} /></small>}
      {o.tracking && <small>🚚 {o.carrier}: <Hl text={o.tracking} q={q} /></small>}
      {status === 'Đã hủy' && o.cancelReason && <small className="err">✕ Lý do hủy: {o.cancelReason}</small>}
      {o.note && <small className="muted">📝 {o.note}</small>}
      <div className="kactions">
        <button title="Copy link theo dõi" onClick={copyTrack}>🔗</button>
        <button title="Hóa đơn K80" onClick={() => onBill(o)}>🧾</button>
        {o.waybillUrl && <a className="btn-link" href={o.waybillUrl} target="_blank" rel="noreferrer" title="In tem">🏷</a>}
        {onEdit && <button title="Sửa đơn: khách, mẫu, số lượng, giá…" onClick={() => onEdit(o)}>✏️</button>}
        {onCancel && status !== 'Đã hủy' && status !== 'Hoàn thành' && <button className="cancel-btn" title="Hủy đơn" onClick={() => onCancel(o)}>✕</button>}
        {waitDeposit && <button className="primary" onClick={confirmDeposit}>✔ Đã nhận cọc</button>}
        {canShip && <button className="primary" disabled={sh.busy === o.id} onClick={() => sh.ship(o)}>{sh.busy === o.id ? '…' : 'Giao hàng'}</button>}
        {o.tracking && status === 'Đang giao' && <button onClick={() => sh.simulateWebhook(o)} title="Giả lập webhook">✔ Đã giao</button>}
      </div>
      <select className="kmove" value={status} onChange={(e) => patchOrder(o.id, { status: e.target.value })} aria-label="Đổi trạng thái">
        {ORDER_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    </div>
  )
}

// Màu nhận diện từng trạng thái (chấm ở tiêu đề cột, viền trái thẻ đơn)
export const STATUS_COLOR = {
  'Chờ cọc': '#f59e0b', 'Mới': '#f97316', 'Đã mua': '#8b5cf6', 'Kho TQ': '#6366f1', 'Đang về': '#3b82f6',
  'Kho VN': '#0ea5e9', 'Đã xuất kho': '#14b8a6', 'Đang giao': '#10b981', 'Hoàn thành': '#059669', 'Đã hủy': '#94a3b8',
}

// Bảng Kanban kéo thả: thả thẻ vào cột để đổi trạng thái (lưu tự động)
export default function Kanban({ orders, statuses = ORDER_STATUS, ...rest }) {
  const [over, setOver] = useState('')
  const { patchOrder } = rest
  return (
    <div className="kanban">
      {statuses.map((s) => {
        const list = orders.filter((o) => normStatus(o.status) === s)
        return (
          <section
            key={s}
            className={'kcol' + (over === s ? ' over' : '')}
            style={{ '--c': STATUS_COLOR[s] }}
            onDragOver={(e) => { e.preventDefault(); setOver(s) }}
            onDragLeave={() => setOver('')}
            onDrop={(e) => {
              e.preventDefault()
              setOver('')
              const id = e.dataTransfer.getData('text/plain')
              const o = orders.find((x) => x.id === id)
              if (o && normStatus(o.status) !== s) patchOrder(id, { status: s })
            }}
          >
            <h4><i className="kdot" aria-hidden="true" />{STATUS_LABEL[s]} <span className="count">{list.length}</span></h4>
            {list.map((o) => <OrderCard key={o.id} o={o} {...rest} />)}
            {!list.length && <p className="muted kempty">Kéo thẻ vào đây</p>}
          </section>
        )
      })}
    </div>
  )
}

// Tìm đơn không phân biệt dấu/hoa thường: "nguyen thu ha" khớp "Nguyễn Thu Hà"
const norm = (s) => fold(String(s ?? '')).replace(/s+/g, ' ')
export const orderMatches = (o, q) => {
  const n = norm(q).trim()
  if (!n) return true
  const hay = norm([o.id, o.customer.name, o.customer.phone, o.tracking, o.cnTracking, fullAddress(o.customer), o.items.map((i) => i.name).join(' ')].join(' | '))
  return hay.includes(n) || (/^[ds.]+$/.test(q) && hay.includes(q.replace(/[s.]/g, '')))
}

// Tô sáng phần khớp từ khóa (fold giữ nguyên độ dài chuỗi nên cắt đúng vị trí trên bản có dấu)
export function Hl({ text, q }) {
  const t = String(text ?? '')
  const n = norm(q).trim()
  if (!n || !t) return t
  const h = fold(t)
  const out = []
  let i = 0
  for (let j = h.indexOf(n); j >= 0; j = h.indexOf(n, j + n.length)) {
    if (j > i) out.push(t.slice(i, j))
    out.push(<mark key={j}>{t.slice(j, j + n.length)}</mark>)
    i = j + n.length
  }
  if (!out.length) return t
  out.push(t.slice(i))
  return out
}
