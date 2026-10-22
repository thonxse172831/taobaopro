import { useEffect, useRef, useState } from 'react'
import { api } from './api'

const STATUS = { waiting: ['Chờ trả lời', '#f59e0b'], open: ['Đang hỗ trợ', '#10b981'], closed: ['Đã kết thúc', '#94a3b8'] }
const QUICK = [
  'Dạ shop chào bạn, mình hỗ trợ bạn ngay ạ!',
  'Bạn cho shop xin mã đơn hàng để kiểm tra nhé.',
  'Shop sẽ gọi lại cho bạn trong ít phút ạ.',
  'Bạn gửi giúp shop ảnh sản phẩm bị lỗi qua Zalo nhé.',
]
const ago = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút`
  if (m < 1440) return `${Math.floor(m / 60)} giờ`
  return new Date(iso).toLocaleDateString('vi-VN')
}

// Hộp tin nhắn: khách được bot chuyển sang (hoặc tự bấm "Gặp nhân viên"), shop trả lời trực tiếp
export default function Inbox({ chats, notify, onFindOrders }) {
  const [sel, setSel] = useState('')
  const [chat, setChat] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('active')
  const box = useRef(null)
  const cur = chats.list.find((c) => c.id === sel)

  // Mở cuộc trò chuyện (đánh dấu đã đọc); có tin mới thì tự tải lại
  useEffect(() => {
    if (!sel) return
    let live = true
    api(`/admin/chats/${encodeURIComponent(sel)}`).then((c) => live && setChat(c)).catch((e) => notify(e.message))
    return () => { live = false }
  }, [sel, cur?.updatedAt, notify])
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [chat?.messages?.length])

  const send = async (t = text) => {
    if (!t.trim() || busy) return
    setBusy(true)
    try {
      setChat(await api(`/admin/chats/${encodeURIComponent(sel)}/messages`, { method: 'POST', body: { text: t.trim() } }))
      setText('')
    } catch (e) { notify(e.message) } finally { setBusy(false) }
  }
  const close = async () => {
    if (!confirm('Kết thúc cuộc trò chuyện này? Khách vẫn có thể nhắn lại.')) return
    try { setChat(await api(`/admin/chats/${encodeURIComponent(sel)}/close`, { method: 'POST' })) } catch (e) { notify(e.message) }
  }

  const list = chats.list.filter((c) => (filter === 'active' ? c.status !== 'closed' : true))
  return (
    <div className={'inbox' + (sel ? ' has-sel' : '')}>
      <aside className="card inbox-list">
        <div className="inbox-filter seg">
          <button type="button" className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>Đang mở ({chats.list.filter((c) => c.status !== 'closed').length})</button>
          <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Tất cả ({chats.list.length})</button>
        </div>
        {list.map((c) => (
          <button key={c.id} type="button" className={'inbox-item' + (c.id === sel ? ' on' : '') + (c.unread ? ' unread' : '')} onClick={() => setSel(c.id)} style={{ '--c': STATUS[c.status]?.[1] }}>
            <span className="inbox-avatar" aria-hidden="true">{(c.name || '?').trim().split(/\s+/).pop()[0]?.toUpperCase()}</span>
            <span className="inbox-main">
              <span className="inbox-top"><b>{c.name}</b><small className="muted">{ago(c.updatedAt)}</small></span>
              <small className="inbox-last">{c.last ? `${c.last.from === 'shop' ? 'Bạn: ' : c.last.from === 'system' ? '• ' : ''}${c.last.text}` : ''}</small>
              <span className="inbox-meta"><i className="kdot" />{STATUS[c.status]?.[0]}{c.reason && <span className="muted"> · {c.reason}</span>}</span>
            </span>
            {c.unread > 0 && <span className="new-dot">{c.unread}</span>}
          </button>
        ))}
        {!list.length && <p className="muted inbox-empty">Chưa có khách nào cần hỗ trợ. Khi khách bấm "Gặp nhân viên" hoặc bot nhận ra khách cần người thật, cuộc trò chuyện sẽ hiện ở đây.</p>}
      </aside>

      <section className="card inbox-thread">
        {!sel || !chat ? (
          <div className="inbox-placeholder"><span aria-hidden="true">💬</span><p className="muted">Chọn một cuộc trò chuyện để trả lời khách</p></div>
        ) : (
          <>
            <div className="thread-head">
              <button type="button" className="icon-btn thread-back" onClick={() => setSel('')} aria-label="Về danh sách">←</button>
              <div className="thread-who">
                <b>{chat.name}</b>
                <small className="muted">
                  <a href={`tel:${chat.phone}`}>{chat.phone}</a>{chat.user ? ' · có tài khoản' : ' · khách vãng lai'} · bắt đầu {new Date(chat.createdAt).toLocaleString('vi-VN')}
                </small>
              </div>
              <button type="button" onClick={() => onFindOrders(chat.phone)} title="Tìm các đơn của khách theo SĐT">🧾 Đơn của khách</button>
              {chat.status !== 'closed' && <button type="button" className="danger" onClick={close}>Kết thúc</button>}
            </div>
            <div className="thread-msgs" ref={box}>
              {chat.messages.map((m, i) => (
                m.from === 'system'
                  ? <div key={i} className="msg-system">{m.text}</div>
                  : (
                    <div key={i} className={'msg-group ' + (m.from === 'shop' ? 'me' : 'bot')}>
                      <small className="msg-who">{m.from === 'shop' ? 'Shop' : m.from === 'bot' ? 'Bot tự động' : chat.name} · {new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
                      <div className={'msg ' + (m.from === 'shop' ? 'me' : 'bot') + (m.from === 'bot' ? ' auto' : '')}>{m.text}</div>
                    </div>
                  )
              ))}
            </div>
            <div className="chips thread-quick">{QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)} disabled={busy}>{q}</button>)}</div>
            <form className="thread-reply" onSubmit={(e) => { e.preventDefault(); send() }}>
              <textarea rows="2" value={text} placeholder="Nhập trả lời… (Enter để gửi, Shift+Enter xuống dòng)" onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
              <button className="primary" disabled={busy || !text.trim()}>Gửi</button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
