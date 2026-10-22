import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import DepositPay from './Deposit'
import { BackButton, Brand, ThemeToggle, useTheme } from './ui'
import { vnd } from './lib'

const CARRIER_URL = {
  GHN: 'https://donhang.ghn.vn/?order_code=', SPX: 'https://spx.vn/track?', 'J&T': 'https://jtexpress.vn/tracking?bill=', 'Viettel Post': 'https://viettelpost.vn/tra-cuu-hanh-trinh-don/?code=',
}

// Trang theo dõi đơn dành cho khách: /track/MÃ
export default function Track({ code }) {
  const [dark, setDark] = useTheme()
  const [o, setO] = useState(null)
  const [err, setErr] = useState('')

  const onPaid = useCallback((r) => setO(r), [])

  useEffect(() => {
    const load = () => api(`/public/track/${encodeURIComponent(code)}`).then((r) => { setO(r); setErr('') }).catch((e) => setErr(e.message))
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [code])

  return (
    <div className="app shop track">
      <header>
        <BackButton fallback="/order" />
        <Brand label={o?.shop.name || 'TN Shop'} />
        <span style={{ flex: 1 }} />
        <ThemeToggle dark={dark} setDark={setDark} />
      </header>
      <main style={{ maxWidth: 640 }}>
        {err && <div className="card"><h3>Không tìm thấy đơn</h3><p className="muted">{err}. Vui lòng kiểm tra lại đường link shop gửi.</p><a href="/order">← Về trang đặt hàng</a></div>}
        {!o && !err && <p className="muted">Đang tải…</p>}
        {o && (
          <>
            <div className="card">
              <p className="muted">Đơn hàng {o.id} · đặt ngày {o.createdAt}</p>
              <h2 style={{ margin: '4px 0 14px' }}>{o.canceled ? '❌ Đơn đã hủy' : o.label}</h2>
              {!o.canceled && (
                <ol className="steps">
                  {o.steps.map((s, i) => (
                    <li key={s} className={i < o.step ? 'done' : i === o.step ? 'now' : ''}>
                      <span className="dot">{i < o.step ? '✓' : i + 1}</span>
                      <span className="lbl">{s}</span>
                    </li>
                  ))}
                </ol>
              )}
              {o.payment && (
                <>
                  <p>Vui lòng chuyển khoản cọc <b>{vnd(o.payment.amount)}</b> để shop xác nhận và bắt đầu mua hàng cho bạn.</p>
                  <DepositPay payment={o.payment} trackCode={code} onPaid={onPaid} />
                </>
              )}
              {o.tracking && (
                <p>🚚 {o.carrier}: <b>{o.tracking}</b>{CARRIER_URL[o.carrier] && <> · <a href={CARRIER_URL[o.carrier] + encodeURIComponent(o.tracking)} target="_blank" rel="noreferrer">Tra cứu hành trình</a></>}</p>
              )}
            </div>
            <div className="card">
              <h3>Chi tiết đơn</h3>
              {o.items.map((i, k) => <div className="row" key={k} style={{ justifyContent: 'space-between' }}><span>{i.name} ({i.size}/{i.color}) x{i.qty}</span><b>{vnd(i.price * i.qty)}</b></div>)}
              <hr />
              <div className="row" style={{ justifyContent: 'space-between' }}><span>Tổng tiền</span><b>{vnd(o.total)}</b></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span>Đã cọc</span><span>{vnd(o.deposit)}</span></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span>Còn lại thanh toán khi nhận hàng</span><b className="ok">{vnd(o.cod)}</b></div>
            </div>
            <p className="muted" style={{ textAlign: 'center' }}>
              Cần hỗ trợ? Liên hệ {o.shop.name}{o.shop.phone && <> · <a href={`tel:${o.shop.phone}`}>{o.shop.phone}</a></>}
            </p>
          </>
        )}
      </main>
    </div>
  )
}
