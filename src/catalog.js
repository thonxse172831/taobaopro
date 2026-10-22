import { useEffect, useState } from 'react'
import { api } from './api'

// Danh sách mẫu cho trang khách; admin sửa mẫu/giá thì server đẩy sự kiện để tải lại ngay
export function useCatalog() {
  const [products, setProducts] = useState([])
  const [depositPct, setDepositPct] = useState(0)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const load = () => api('/public/catalog')
      .then((r) => { setProducts(r.products); setDepositPct(r.depositPct || 0) })
      .catch(() => {})
      .finally(() => setLoaded(true))
    load()
    const es = new EventSource('/api/public/events')
    es.addEventListener('catalog', load)
    return () => es.close()
  }, [])
  return { products, depositPct, loaded }
}
