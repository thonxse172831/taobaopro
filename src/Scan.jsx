import { useCallback, useEffect, useRef, useState } from 'react'
import { normStatus } from './lib'

const DONE = ['Đã xuất kho', 'Đang giao', 'Hoàn thành']
const FORMATS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'codabar', 'qr_code', 'upc_a']
const clean = (s) => String(s || '').trim().toUpperCase()

// Quét mã vạch tem J&T/SPX/GHN bằng camera điện thoại → đơn chuyển sang "Đã xuất kho"
export default function Scan({ orders, patchOrder }) {
  const video = useRef(null)
  const ordersRef = useRef(orders)
  const last = useRef({ code: '', at: 0 })
  const stopRef = useRef(null)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')
  const [log, setLog] = useState([])

  useEffect(() => { ordersRef.current = orders }, [orders])

  const handle = useCallback((raw) => {
    const code = clean(raw)
    if (!code) return
    const now = Date.now()
    if (last.current.code === code && now - last.current.at < 3000) return
    last.current = { code, at: now }
    const o = ordersRef.current.find((x) => [x.tracking, x.cnTracking, x.id, x.trackCode].some((v) => clean(v) === code || (v && code.includes(clean(v)) && clean(v).length >= 8)))
    let entry
    if (!o) entry = { ok: false, text: `${code}: không khớp đơn nào` }
    else if (DONE.includes(normStatus(o.status))) entry = { ok: true, text: `${o.id} (${o.customer.name}): đã xuất kho từ trước` }
    else {
      patchOrder(o.id, { status: 'Đã xuất kho' })
      entry = { ok: true, text: `${o.id} (${o.customer.name}) → Đã xuất kho ✔` }
    }
    navigator.vibrate?.(entry.ok ? 80 : [60, 40, 60])
    setLog((l) => [{ ...entry, t: new Date().toLocaleTimeString('vi-VN') }, ...l].slice(0, 15))
  }, [patchOrder])

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    setOn(false)
  }, [])

  const start = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setErr('Trình duyệt không hỗ trợ camera. Cần mở bằng HTTPS (hoặc localhost).')
    try {
      if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        video.current.srcObject = stream
        await video.current.play()
        const supported = await BarcodeDetector.getSupportedFormats?.()
        const det = new BarcodeDetector({ formats: supported ? FORMATS.filter((f) => supported.includes(f)) : FORMATS })
        const timer = setInterval(async () => {
          try {
            const r = await det.detect(video.current)
            if (r[0]) handle(r[0].rawValue)
          } catch { /* khung hình chưa sẵn sàng */ }
        }, 300)
        stopRef.current = () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()) }
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const ctl = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (r) => r && handle(r.getText()))
        stopRef.current = () => ctl.stop()
      }
      setOn(true)
    } catch (e) {
      stopRef.current?.()
      setErr(e?.name === 'NotAllowedError' ? 'Bạn đã từ chối quyền camera. Hãy cho phép camera trong cài đặt trình duyệt.' : `Không mở được camera: ${e?.message || e}`)
    }
  }

  useEffect(() => () => stopRef.current?.(), [])

  return (
    <div className="grid2 top">
      <div className="card">
        <h3>📷 Quét mã vạch tem vận chuyển</h3>
        <div className="scanbox">
          <video ref={video} muted playsInline />
          {on && <div className="scanline" />}
          {!on && <div className="scanhint">Bấm "Bật camera" rồi đưa mã vạch trên tem J&T / SPX / GHN vào khung</div>}
        </div>
        <div className="row">
          {on ? <button onClick={stop}>Tắt camera</button> : <button className="primary" onClick={start}>Bật camera</button>}
        </div>
        {err && <p className="err">{err}</p>}
        <form className="row" onSubmit={(e) => { e.preventDefault(); handle(manual); setManual('') }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Hoặc nhập / dùng súng quét mã…" />
          <button className="primary">Xác nhận</button>
        </form>
        <small className="muted">Mã quét được đối chiếu với mã vận đơn, mã đơn và mã theo dõi; khớp thì đơn chuyển thành "Đã xuất kho". Camera cần HTTPS (Render đã có sẵn).</small>
      </div>
      <div className="card">
        <h3>Lịch sử quét</h3>
        {!log.length && <p className="muted">Chưa quét mã nào.</p>}
        <ul className="scanlog">{log.map((l, i) => <li key={i} className={l.ok ? 'ok' : 'err'}><small>{l.t}</small> {l.text}</li>)}</ul>
      </div>
    </div>
  )
}
