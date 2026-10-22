import { useState } from 'react'
import { api } from './api'
import { usePayments } from './store'
import { vnd } from './lib'

// Giao dịch chuyển khoản SePay báo về; giao dịch không khớp đơn (khách ghi sai nội dung) cho phép gán tay
export default function Payments({ orders, notify }) {
  const { list, reload } = usePayments()
  const [pick, setPick] = useState({})
  const [open, setOpen] = useState(false)
  const waiting = orders.filter((o) => o.status === 'Chờ cọc' || (o.status === 'Đã hủy' && o.autoCanceled))
  const unmatched = list.filter((p) => !p.orderId)
  const shown = open ? list : unmatched

  const assign = async (p) => {
    const orderId = pick[p._id]
    if (!orderId) return
    try {
      const r = await api(`/admin/payments/${encodeURIComponent(p._id)}/assign`, { method: 'POST', body: { orderId } })
      notify(`Đã gán ${vnd(p.amount)} vào đơn ${r.id}${r.status === 'Mới' ? ' · đơn đã đủ cọc' : ''}`)
      reload()
    } catch (e) {
      notify(e.message)
    }
  }

  if (!list.length) return null
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', margin: 0 }}>
        <h3 style={{ margin: 0 }}>💳 Tiền cọc chuyển khoản {unmatched.length > 0 && <span className="new-dot">{unmatched.length} chưa khớp đơn</span>}</h3>
        <button onClick={() => setOpen(!open)}>{open ? 'Chỉ hiện chưa khớp' : `Xem tất cả (${list.length})`}</button>
      </div>
      {!shown.length && <p className="muted">Mọi giao dịch đều đã tự khớp với đơn hàng ✔</p>}
      {shown.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Thời gian</th><th>Số tiền</th><th>Nội dung CK</th><th>Đơn</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p._id}>
                  <td><small>{new Date(p.at).toLocaleString('vi-VN')}</small><br /><small className="muted">{p.gateway}</small></td>
                  <td><b>{vnd(p.amount)}</b></td>
                  <td><small>{p.content}</small></td>
                  <td>
                    {p.orderId ? <b className="ok">{p.orderId}</b> : (
                      <div className="row" style={{ margin: 0 }}>
                        <select value={pick[p._id] || ''} onChange={(e) => setPick({ ...pick, [p._id]: e.target.value })}>
                          <option value="">— chọn đơn —</option>
                          {waiting.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.customer.name} · cọc {vnd((o.depositDue || 0) - (o.depositPaid || 0))}</option>)}
                        </select>
                        <button className="primary" disabled={!pick[p._id]} onClick={() => assign(p)}>Gán</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
