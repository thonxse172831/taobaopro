import { useEffect, useState } from 'react'
import { api } from './api'
import { vnd } from './lib'
import { vietQrDataUrl } from './vietqr'
import { copyText } from './Kanban'

// Màn hình chuyển khoản cọc: QR VietQR + thông tin tài khoản, tự kiểm tra tiền về mỗi vài giây
export default function DepositPay({ payment, trackCode, onPaid }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState('')
  const [left, setLeft] = useState(payment.amount)

  useEffect(() => {
    let live = true
    vietQrDataUrl({ bin: payment.bankBin, account: payment.account, amount: left, memo: payment.memo }).then((u) => live && setQr(u)).catch(() => {})
    return () => { live = false }
  }, [payment.bankBin, payment.account, payment.memo, left])

  // SePay báo tiền về → server đổi trạng thái đơn; ở đây chỉ cần hỏi lại trạng thái
  useEffect(() => {
    if (!trackCode) return
    const t = setInterval(async () => {
      try {
        const r = await api(`/public/track/${encodeURIComponent(trackCode)}`)
        if (!r.payment) onPaid(r)
        else setLeft(r.payment.amount)
      } catch { /* mất mạng tạm thời */ }
    }, 4000)
    return () => clearInterval(t)
  }, [trackCode, onPaid])

  const copy = async (label, text) => {
    if (await copyText(text)) {
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    }
  }
  const expires = new Date(payment.expiresAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  const partial = left < payment.amount

  return (
    <div className="deposit">
      <div className="deposit-qr">
        {qr ? <img src={qr} alt={`QR chuyển khoản ${vnd(left)}`} /> : <div className="deposit-qr-ph">Đang tạo mã QR…</div>}
        <small className="muted">Mở app ngân hàng, quét mã để chuyển đúng số tiền & nội dung</small>
      </div>
      <dl className="deposit-info">
        <div><dt>Ngân hàng</dt><dd>{payment.bankName}</dd></div>
        <div><dt>Số tài khoản</dt><dd><b>{payment.account}</b> <button type="button" onClick={() => copy('stk', payment.account)}>{copied === 'stk' ? '✓' : 'Copy'}</button></dd></div>
        <div><dt>Chủ tài khoản</dt><dd>{payment.holder}</dd></div>
        <div><dt>Số tiền cọc</dt><dd><b className="price">{vnd(left)}</b> <button type="button" onClick={() => copy('tien', String(left))}>{copied === 'tien' ? '✓' : 'Copy'}</button></dd></div>
        <div><dt>Nội dung CK</dt><dd><b className="deposit-memo">{payment.memo}</b> <button type="button" onClick={() => copy('nd', payment.memo)}>{copied === 'nd' ? '✓' : 'Copy'}</button></dd></div>
      </dl>
      {partial && <p className="err">Shop đã nhận một phần tiền cọc, vui lòng chuyển thêm {vnd(left)}.</p>}
      <div className="deposit-wait" role="status">
        <span className="spinner" aria-hidden="true" />
        Đang chờ tiền về… hệ thống tự xác nhận sau khi bạn chuyển khoản.
      </div>
      <small className="muted">⚠ Ghi đúng nội dung <b>{payment.memo}</b> để được xác nhận tự động. Đơn giữ đến {expires}, quá hạn chưa cọc sẽ tự hủy.</small>
    </div>
  )
}
