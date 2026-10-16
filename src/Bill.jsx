import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { vnd, orderTotals, fullAddress, BANKS, DEFAULT_SHOP } from './lib'
import { vietQrDataUrl } from './vietqr'

function root() {
  let el = document.getElementById('bill-root')
  if (!el) {
    el = document.createElement('div')
    el.id = 'bill-root'
    document.body.appendChild(el)
  }
  return el
}

// Hóa đơn mini khổ K80 kèm mã QR chuyển khoản số tiền còn thiếu (COD)
export default function Bill({ order, shop: shopIn, onClose }) {
  const shop = { ...DEFAULT_SHOP, ...shopIn }
  const t = orderTotals(order)
  const [qr, setQr] = useState('')
  const hasBank = shop.bankBin && shop.bankAccount
  const bank = BANKS.find((b) => b[0] === shop.bankBin)?.[1] || ''

  useEffect(() => {
    if (!hasBank || t.cod <= 0) return
    let live = true
    vietQrDataUrl({ bin: shop.bankBin, account: shop.bankAccount, amount: t.cod, memo: `COD ${order.id}` }).then((u) => live && setQr(u)).catch(() => {})
    return () => { live = false }
  }, [hasBank, shop.bankBin, shop.bankAccount, t.cod, order.id])

  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  return createPortal(
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box bill-wrap">
        <div className="bill">
          <h2>{shop.name}</h2>
          {shop.phone && <div className="c">ĐT: {shop.phone}</div>}
          <div className="c sep">HÓA ĐƠN</div>
          <div>Mã đơn: <b>{order.id}</b></div>
          <div>Ngày: {order.createdAt}</div>
          <div>Khách: {order.customer.name} - {order.customer.phone}</div>
          <div>Đ/c: {fullAddress(order.customer)}</div>
          <table className="bill-items">
            <tbody>
              {order.items.map((i, k) => (
                <tr key={k}><td>{i.name}<br /><small>{i.size}/{i.color} x{i.qty}</small></td><td className="r">{vnd(i.price * i.qty)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="line"><span>Tổng tiền</span><b>{vnd(t.revenue)}</b></div>
          <div className="line"><span>Đã cọc</span><span>{vnd(order.deposit || 0)}</span></div>
          <div className="line big"><span>THU HỘ (COD)</span><b>{vnd(t.cod)}</b></div>
          {qr ? (
            <div className="c qr">
              <img src={qr} alt="QR chuyển khoản" />
              <div>Quét mã để chuyển khoản {vnd(t.cod)}</div>
              <small>{bank} · {shop.bankAccount} · {shop.bankHolder}</small>
            </div>
          ) : t.cod > 0 && !hasBank && <div className="c"><small>(Chưa cài ngân hàng ở tab Cửa hàng nên chưa có mã QR)</small></div>}
          <div className="c sep">Cảm ơn quý khách ♥</div>
        </div>
        <div className="row no-print" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => window.print()}>🖨 In hóa đơn / Lưu PDF</button>
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>,
    root(),
  )
}
