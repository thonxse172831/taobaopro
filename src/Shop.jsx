import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatWidget } from './Customer'
import { ProductPicker } from './Checkout'
import { useAccount } from './Account'
import { useCart } from './cart'
import { useCatalog } from './catalog'
import { BottomBar, SiteHeader } from './SiteHeader'
import { ScanIcon } from './ui'
import { productImages } from './images'
import { vnd, STOCK_STATUS, ETA } from './lib'

const MAX_IMAGE = 12 * 1024 * 1024

// Ô tìm kiếm chung: gõ chữ hoặc bấm biểu tượng quét / kéo thả ảnh để tìm mẫu giống
function SearchBar({ q, setQ, img, onImage, onClearImage, busy }) {
  const file = useRef(null)
  const [drag, setDrag] = useState(false)
  return (
    <div
      className={'hero-search' + (drag ? ' drag' : '')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onImage(e.dataTransfer.files[0]) }}
    >
      <span className="search-icon" aria-hidden="true">⌕</span>
      {img ? (
        <span className="search-image-chip">
          <img src={img} alt="" />
          {busy ? 'Đang tìm mẫu giống ảnh…' : 'Đang tìm theo ảnh'}
          <button type="button" className="chip-x" onClick={onClearImage} aria-label="Bỏ tìm theo ảnh">✕</button>
        </span>
      ) : (
        <input type="search" placeholder="Tìm mẫu, hoặc quét ảnh để tìm mẫu giống…" aria-label="Tìm mẫu" value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { onImage(e.target.files[0]); e.target.value = '' }} />
      <button type="button" className="search-camera" onClick={() => file.current?.click()} title="Tìm kiếm bằng hình ảnh" aria-label="Tìm kiếm bằng hình ảnh"><ScanIcon size={24} busy={busy} /></button>
      {drag && <span className="search-drop-hint">Thả ảnh vào đây để tìm mẫu giống</span>}
    </div>
  )
}

// Trang dành cho khách: chỉ thấy giá bán, size, màu, thời gian nhận hàng (không có giá vốn)
export default function Shop() {
  const { products, loaded } = useCatalog()
  const { user } = useAccount()
  const cart = useCart(user)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [picking, setPicking] = useState(null) // { product, mode: 'cart' | 'buy' }
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [img, setImg] = useState(null) // { url, busy, result, error }

  useEffect(() => () => img?.url && URL.revokeObjectURL(img.url), [img?.url])

  const tags = useMemo(() => [...new Set(products.flatMap((p) => p.tags))], [products])
  const shown = products.filter((p) => {
    const hay = (p.name + ' ' + p.category + ' ' + p.tags.join(' ')).toLowerCase()
    return hay.includes(q.toLowerCase()) && (!tag || p.tags.includes(tag))
  })
  // Tìm bằng ảnh: lưới mẫu hiện kết quả theo độ giống, kèm % khớp
  const imageHits = img?.result?.matches || []
  const grid = img ? imageHits.map((m) => ({ ...m.product, similarity: m.similarity })) : shown

  const notify = (m) => {
    setToast(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  const searchImage = async (f) => {
    if (!f) return
    if (!f.type.startsWith('image/') || f.size > MAX_IMAGE) return notify('Vui lòng chọn ảnh JPG/PNG/WebP dưới 12 MB')
    const url = URL.createObjectURL(f)
    setImg({ url, busy: true })
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      const { searchProductsByImage } = await import('./imagehash.js')
      const result = await searchProductsByImage(url, products)
      setImg((x) => (x?.url === url ? { url, busy: false, result } : x))
    } catch {
      setImg((x) => (x?.url === url ? { url, busy: false, error: 'Không đọc được ảnh này, hãy thử ảnh khác.' } : x))
    }
  }

  // "Thêm vào giỏ" / "Đặt hàng" ở mẫu hoặc khung chat → chọn size, màu, số lượng
  const open = (id, mode = 'cart') => {
    const p = products.find((x) => x.id === id)
    if (p) setPicking({ product: p, mode })
  }
  const onAdd = (line, buyNow) => {
    const name = picking.product.name
    cart.add(line)
    setPicking(null)
    // Đợi giỏ ghi xuống máy rồi mới chuyển trang
    if (buyNow) setTimeout(() => location.assign('/cart'), 120)
    else notify(`Đã thêm "${name}" vào giỏ`)
  }

  return (
    <div className="app shop">
      <SiteHeader user={user} cartCount={cart.count} />
      <main>
        <section className="hero">
          <span className="hero-kicker"><i aria-hidden="true" />Order Taobao · 1688 · Pinduoduo</span>
          <h1>Mẫu hot mới về, <em>giá rõ ràng</em> 🔥</h1>
          <p>Thêm nhiều mẫu vào giỏ, đặt một lần, shop xác nhận ngay.</p>
          <SearchBar q={q} setQ={setQ} img={img?.url} busy={img?.busy} onImage={searchImage} onClearImage={() => setImg(null)} />
          {!img && (
            <div className="chips" style={{ justifyContent: 'center' }}>
              <button className={!tag ? 'on' : ''} onClick={() => setTag('')}>Tất cả</button>
              {tags.map((t) => <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(t)}>#{t}</button>)}
            </div>
          )}
          <ul className="trust">
            <li><b aria-hidden="true">💰</b>Giá trọn gói, không phát sinh</li>
            <li><b aria-hidden="true">🔒</b>Cọc an toàn qua QR ngân hàng</li>
            <li><b aria-hidden="true">📦</b>Theo dõi đơn mọi lúc</li>
          </ul>
        </section>

        <div className="section-title" id="catalog">
          <h2>{img ? 'Kết quả tìm theo ảnh' : 'Mẫu đang bán'}</h2>
          {img ? <button type="button" onClick={() => setImg(null)}>✕ Xem tất cả mẫu</button> : loaded && <span className="muted">{shown.length} mẫu</span>}
        </div>
        {img?.error && <p className="err">{img.error}</p>}
        {img?.result && !imageHits.length && <p className="image-no-match">Chưa tìm thấy mẫu đủ giống. Hãy thử ảnh rõ sản phẩm hơn, hoặc gõ tên mẫu vào ô tìm kiếm.</p>}
        {img?.result?.skipped > 0 && <small className="muted">Không đọc được ảnh của {img.result.skipped} mẫu nên chưa so khớp được.</small>}
        <div className="products">
          {(!loaded || img?.busy) && Array.from({ length: img?.busy ? 3 : 6 }, (_, i) => (
            <div className="card product skeleton" key={i} aria-hidden="true">
              <div className="sk media" /><div className="sk line" /><div className="sk line short" /><div className="sk btn" />
            </div>
          ))}
          {!img?.busy && grid.map((p, i) => (
            <article className={'card product' + (img && i === 0 && img.result?.best ? ' best' : '')} key={p.id} style={{ '--i': i }}>
              <div className={'product-media' + (productImages(p).length > 1 ? ' multi' : '')} onClick={() => open(p.id, 'cart')} role="button" tabIndex={-1} title="Xem ảnh & chọn phân loại">
                {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="noimg">Chưa có ảnh</div>}
                {productImages(p).length > 1 && <img className="alt-img" src={productImages(p)[1]} alt="" loading="lazy" aria-hidden="true" />}
                {productImages(p).length > 1 && <span className="img-count">📷 {productImages(p).length}</span>}
                <span className={'stock-chip ' + p.status}>{STOCK_STATUS[p.status]}</span>
                {p.similarity != null && <span className="match-chip">Khớp {p.similarity}%</span>}
              </div>
              <b>{p.name}</b>
              <span className="price">{vnd(p.priceVnd)}</span>
              <small className="product-meta">Size {p.sizes.join(' · ')} — {p.colors.join(', ')}</small>
              <small className="eta">🚚 Nhận hàng {ETA[p.status]}</small>
              <div className="product-actions">
                <button type="button" className="add-cart" onClick={() => open(p.id, 'cart')} aria-label={`Thêm ${p.name} vào giỏ`} title="Thêm vào giỏ">🛒<span>Thêm vào giỏ</span></button>
                <button type="button" className="primary" onClick={() => open(p.id, 'buy')}>Đặt hàng</button>
              </div>
            </article>
          ))}
          {loaded && !img && !shown.length && <p className="muted">Không có mẫu phù hợp. Thử từ khoá khác hoặc bấm biểu tượng quét để tìm bằng hình ảnh nhé!</p>}
        </div>
      </main>
      {picking && <ProductPicker product={picking.product} mode={picking.mode} onAdd={onAdd} onClose={() => setPicking(null)} />}
      <ChatWidget products={products} user={user} onBuy={(id) => open(id, 'buy')} />
      {toast && <div className="toast">{toast} <a href="/cart">Xem giỏ →</a></div>}
      <BottomBar active="shop" cartCount={cart.count} />
    </div>
  )
}
