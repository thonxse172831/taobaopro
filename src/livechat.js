import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { fold } from './smartpaste'

const KEY = 'tb_chat'
const read = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
const write = (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY) } catch { /* bỏ qua */ } }

// Dấu hiệu khách cần người thật hỗ trợ (so khớp không dấu)
const HUMAN = [
  'nhan vien', 'tu van vien', 'nguoi that', 'gap shop', 'chu shop', 'noi chuyen voi shop', 'ho tro truc tiep', 'lien he shop', 'admin',
  'khieu nai', 'hoan tien', 'tra hang', 'doi hang', 'doi tra', 'bi loi', 'hang loi', 'hu hong', 'bi hong', 'bi rach', 'sai hang', 'giao sai',
  'thieu hang', 'chua nhan duoc', 'chua nhan hang', 'giao cham', 'huy don', 'goi lai', 'goi cho', 'that vong', 'lua dao', 'buc minh',
]
export const needsHuman = (text) => {
  const t = ` ${fold(String(text || '')).replace(/\s+/g, ' ')} `
  return HUMAN.some((k) => t.includes(k))
}

// Chat trực tiếp với shop: mã cuộc trò chuyện lưu trên máy khách, tin mới đến ngay qua kênh SSE riêng
export function useLiveChat(open) {
  const [id, setId] = useState(read)
  const [chat, setChat] = useState(null)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])

  const forget = useCallback(() => { write(''); setId(''); setChat(null) }, [])
  const load = useCallback(async () => {
    if (!id) return
    try {
      setChat(await api(`/public/chats/${encodeURIComponent(id)}${openRef.current ? '?read=1' : ''}`))
    } catch (e) {
      if (e.status === 404) forget()
    }
  }, [id, forget])

  useEffect(() => {
    if (!id) return
    load()
    const es = new EventSource(`/api/public/chats/${encodeURIComponent(id)}/events`)
    es.addEventListener('chat', load)
    return () => es.close()
  }, [id, load])
  // Mở khung chat thì đánh dấu đã đọc tin của shop
  useEffect(() => { if (open && chat?.unread) load() }, [open, chat?.unread, load])

  const start = async (info) => {
    const c = await api('/public/chats', { method: 'POST', body: info })
    write(c.id)
    setId(c.id)
    setChat(c)
    return c
  }
  const send = async (text) => setChat(await api(`/public/chats/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { text } }))

  return { id, chat, start, send, forget, unread: open ? 0 : chat?.unread || 0 }
}
