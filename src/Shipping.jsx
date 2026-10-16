import { useState } from 'react'
import { orderTotals, CARRIERS, ORDER_STATUS, normStatus } from './lib'
import { CARRIER_CONFIG, buildShipment, createShipment, mapWebhook } from './logistics'

const BEFORE_VN = ORDER_STATUS.slice(0, ORDER_STATUS.indexOf('Kho VN'))

// Logic giao hàng dùng chung cho bảng đơn và Kanban
export function useShipping(patchOrder) {
  const [busy, setBusy] = useState('')
  const [carrier, setCarrier] = useState('GHN')
  const [pkg, setPkg] = useState({ weightKg: 1, length: 30, width: 20, height: 10 })
  const [mock, setMock] = useState(true)
  const [token, setToken] = useState('')
  const [err, setErr] = useState('')

  const ship = async (o) => {
    setBusy(o.id)
    setErr('')
    try {
      const r = await createShipment(carrier, buildShipment(o, orderTotals(o), pkg), { mock, token })
      // Tạo vận đơn nghĩa là hàng đã tới tay shop: không lùi trạng thái nếu đơn đã xuất kho
      const st = normStatus(o.status)
      patchOrder(o.id, { carrier, tracking: r.trackingId, waybillUrl: r.waybillUrl, status: BEFORE_VN.includes(st) ? 'Kho VN' : st })
    } catch (e) {
      setErr(e.message)
    }
    setBusy('')
  }
  const simulateWebhook = (o) => {
    const m = mapWebhook({ OrderCode: o.tracking, status: 'delivered' })
    if (m.trackingId === o.tracking) patchOrder(o.id, { status: m.status })
  }
  return { busy, carrier, setCarrier, pkg, setPkg, mock, setMock, token, setToken, err, ship, simulateWebhook }
}

export function ShippingConfig({ sh }) {
  const { carrier, setCarrier, pkg, setPkg, mock, setMock, token, setToken, err } = sh
  return (
    <div className="card">
      <h3>Cấu hình giao hàng</h3>
      <div className="row wrap">
        <label>Hãng<select value={carrier} onChange={(e) => setCarrier(e.target.value)}>{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select></label>
        {['weightKg', 'length', 'width', 'height'].map((k) => (
          <label key={k}>{{ weightKg: 'Cân (kg)', length: 'Dài', width: 'Rộng', height: 'Cao' }[k]}
            <input type="number" step="0.1" value={pkg[k]} onChange={(e) => setPkg({ ...pkg, [k]: +e.target.value })} /></label>
        ))}
        <label><input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} /> Chế độ giả lập</label>
        {!mock && <label>API Token<input value={token} onChange={(e) => setToken(e.target.value)} /></label>}
      </div>
      <small className="muted">Webhook: cấu hình <code>{location.origin}{CARRIER_CONFIG[carrier].webhook}</code> tại {carrier}.</small>
      {err && <p className="err">{err}</p>}
    </div>
  )
}
