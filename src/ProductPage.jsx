import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useAccount } from './Account'
import { Stepper } from './Checkout'
import { ChatWidget } from './Customer'
import { useCart } from './cart'
import { mediaOf, youtubeEmbed, youtubeThumb } from './media'
import { BottomBar, SiteHeader } from './SiteHeader'
import { vnd, depositOf, STOCK_STATUS, ETA } from './lib'

const FROM = { READY: 'Kho Việt Nam', TRANSIT: 'Đang về Việt Nam', TQ: 'Kho Trung Quốc' }

// Khung xem ảnh + video: ảnh/video lớn, mũi tên, vuốt trên điện thoại, dải ảnh nhỏ; bấm ảnh để phóng to toàn màn hình
function MediaViewer({ media, name }) {
  const [i, setI] = useState(0)
  const [zoom, setZoom] = useState(false)
  const touch = useRef(null)
  const cur = media[i]
  const go = (n) => setI((n + media.length) % media.length)

  useEffect(() => {
    if (!zoom) return
    const on = (e) => {
      if (e.key === 'Escape') setZoom(false)
      if (e.key === 'ArrowRight') setI((k) => (k + 1) % media.length)
      if (e.key === 'ArrowLeft') setI((k) => (k - 1 + media.length) % media.length)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [zoom, media.length])

  if (!media.length) return <div className="pdp-stage empty"><span aria-hidden="true">🛍</span><small className="muted">Shop đang cập nhật hình ảnh</small></div>

  const swipe = {
    onTouchStart: (e) => { touch.current = e.touches[0].clientX },
    onTouchEnd: (e) => {
      const dx = e.changedTouches[0].clientX - (touch.current ?? 0)
      if (Math.abs(dx) > 45) go(i + (dx < 0 ? 1 : -1))
    },
  }
  return (
    <div className="pdp-media">
      <div className="pdp-stage" {...swipe}>
        {cur.type === 'video'
          ? cur.yt
            ? <iframe key={cur.src} src={youtubeEmbed(cur.yt)} title={`Video ${name}`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
            : <video key={cur.src} src={cur.src} controls playsInline preload="metadata" />
          : <img key={cur.src} src={cur.src} alt={`${name} – ảnh ${i + 1}`} onClick={() => setZoom(true)} />}
        {media.length > 1 && (
          <>
            <button type="button" className="gallery-nav prev" onClick={() => go(i - 1)} aria-label="Trước">‹</button>
            <button type="button" className="gallery-nav next" onClick={() => go(i + 1)} aria-label="Sau">›</button>
            <span className="gallery-count">{i + 1}/{media.length}</span>
          </>
        )}
        {cur.type === 'image' && <span className="pdp-zoom-hint" aria-hidden="true">⤢ Phóng to</span>}
      </div>
      {media.length > 1 && (
        <div className="pdp-thumbs">
          {media.map((m, k) => (
            <button key={m.src} type="button" className={k === i ? 'on' : ''} onClick={() => setI(k)} onMouseEnter={() => m.type === 'image' && setI(k)} aria-label={m.type === 'video' ? `Xem video ${k + 1}` : `Xem ảnh ${k + 1}`}>
              {m.type === 'video'
                ? <>{m.yt ? <img src={youtubeThumb(m.yt)} alt="" loading="lazy" /> : <video src={m.src} preload="metadata" muted />}<span className="video-play" aria-hidden="true">▶</span></>
                : <img src={m.src} alt="" loading="lazy" />}
            </button>
          ))}
        </div>
      )}
      {zoom && cur.type === 'image' && (
        <div className="lightbox" onClick={() => setZoom(false)} role="dialog" aria-label="Ảnh phóng to">
          <img src={cur.src} alt={name} onClick={(e) => e.stopPropagation()} {...swipe} />
          {media.length > 1 && (
            <>
              <button type="button" className="gallery-nav prev" onClick={(e) => { e.stopPropagation(); go(i - 1) }} aria-label="Trước">‹</button>
              <button type="button" className="gallery-nav next" onClick={(e) => { e.stopPropagation(); go(i + 1) }} aria-label="Sau">›</button>
            </>
          )}
          <button type="button" className="lightbox-close" aria-label="Đóng">✕</button>
          <span className="gallery-count">{i + 1}/{media.length}</span>
        </div>
      )}
    </div>
  )
}

// Trang chi tiết sản phẩm /p/:id (kiểu Shopee): ảnh & video, giá, chọn phân loại, mô tả, sản phẩm tương tự
export default function ProductPage({ id }) {
  const { user } = useAccount()
  const cart = useCart(user)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [qty, setQty] = useState(1)
  const [tried, setTried] = useState(false)
  const [toast, setToast] = useState('')
  const opts = useRef(null)

  useEffect(() => {
    api(`/public/products/${encodeURIComponent(id)}`)
      .then((d) => {
        setData(d)
        // Chỉ tự chọn khi mẫu có đúng một lựa chọn
        if (d.product.sizes?.length === 1) setSize(d.product.sizes[0])
        if (d.product.colors?.length === 1) setColor(d.product.colors[0])
        document.title = `${d.product.name} | TN Shop`
      })
      .catch((e) => setErr(e.message))
  }, [id])

  const p = data?.product
  const needSize = p?.sizes?.length > 0 && !size
  const needColor = p?.colors?.length > 0 && !color
  const add = (buyNow) => {
    if (needSize || needColor) {
      setTried(true)
      opts.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    cart.add({ productId: p.id, size, color, qty })
    if (buyNow) return setTimeout(() => location.assign('/cart'), 120)
    setToast(`Đã thêm ${qty} "${p.name}" vào giỏ`)
    setTimeout(() => setToast(''), 2400)
  }

  return (
    <div className="app shop pdp">
      <SiteHeader user={user} cartCount={cart.count} backFallback="/order" />
      <main>
        {err && (
          <div className="card pdp-missing">
            <span aria-hidden="true">🔍</span>
            <h2>{err}</h2>
            <a className="btn-link primary-link" href="/order">Xem các mẫu khác →</a>
          </div>
        )}
        {!p && !err && (
          <div className="card pdp-main skeleton" aria-busy="true">
            <div className="sk media" /><div><div className="sk line" /><div className="sk line short" /><div className="sk btn" /></div>
          </div>
        )}
        {p && (
          <>
            <nav className="crumbs" aria-label="Đường dẫn">
              <a href="/order">Trang chủ</a><span aria-hidden="true">›</span><a href="/order#catalog">{p.category || 'Sản phẩm'}</a><span aria-hidden="true">›</span><span>{p.name}</span>
            </nav>

            <section className="card pdp-main">
              <MediaViewer media={mediaOf(p)} name={p.name} />
              <div className="pdp-info">
                <h1>{p.name}</h1>
                <div className="pdp-stats">
                  <span className={'stock-chip inline ' + p.status}>{STOCK_STATUS[p.status]}</span>
                  {p.sold > 0 && <span><b>{p.sold}</b> Đã bán</span>}
                  {(p.tags || []).slice(0, 3).map((t) => <span key={t} className="tag">#{t}</span>)}
                </div>
                <div className="pdp-price">
                  <b>{vnd(p.priceVnd)}</b>
                  <small>Giá trọn gói về tay · không phát sinh</small>
                </div>
                <dl className="pdp-rows" ref={opts}>
                  <div><dt>Vận chuyển</dt><dd>🚚 Nhận hàng <b>{ETA[p.status]}</b><br /><small className="muted">Gửi từ: {FROM[p.status] || 'Kho Trung Quốc'}</small></dd></div>
                  {data.depositPct > 0 && <div><dt>Thanh toán</dt><dd>💳 Cọc {data.depositPct}% (≈ {vnd(depositOf(p.priceVnd * qty, data.depositPct))}) qua QR, còn lại trả khi nhận hàng</dd></div>}
                  {p.sizes?.length > 0 && (
                    <div className={tried && needSize ? 'need' : ''}><dt>Size</dt><dd>
                      <div className="chips">{p.sizes.map((s) => <button key={s} type="button" className={s === size ? 'on' : ''} onClick={() => setSize(s)}>{s}</button>)}</div>
                      {tried && needSize && <small className="err">Vui lòng chọn size</small>}
                    </dd></div>
                  )}
                  {p.colors?.length > 0 && (
                    <div className={tried && needColor ? 'need' : ''}><dt>Màu sắc</dt><dd>
                      <div className="chips">{p.colors.map((c) => <button key={c} type="button" className={c === color ? 'on' : ''} onClick={() => setColor(c)}>{c}</button>)}</div>
                      {tried && needColor && <small className="err">Vui lòng chọn màu</small>}
                    </dd></div>
                  )}
                  <div><dt>Số lượng</dt><dd className="pdp-qty"><Stepper value={qty} onChange={setQty} />{p.status === 'READY' && p.stock > 0 && <small className="muted">{p.stock} sản phẩm có sẵn</small>}</dd></div>
                </dl>
                <div className="pdp-actions">
                  <button type="button" className="pdp-add" onClick={() => add(false)}>🛒 Thêm vào giỏ hàng</button>
                  <button type="button" className="primary" onClick={() => add(true)}>Mua ngay</button>
                </div>
                <ul className="trust pdp-trust">
                  <li><b aria-hidden="true">💰</b>Giá trọn gói, không phát sinh</li>
                  <li><b aria-hidden="true">🔒</b>Cọc an toàn qua QR ngân hàng</li>
                  <li><b aria-hidden="true">📦</b>Theo dõi đơn mọi lúc</li>
                </ul>
              </div>
            </section>

            <section className="card pdp-section">
              <h2>Chi tiết sản phẩm</h2>
              <dl className="pdp-specs">
                <div><dt>Danh mục</dt><dd>{p.category || '—'}</dd></div>
                <div><dt>Tình trạng</dt><dd>{STOCK_STATUS[p.status]}</dd></div>
                <div><dt>Gửi từ</dt><dd>{FROM[p.status] || 'Kho Trung Quốc'}</dd></div>
                <div><dt>Thời gian nhận</dt><dd>{ETA[p.status]}</dd></div>
                {p.sizes?.length > 0 && <div><dt>Size</dt><dd>{p.sizes.join(', ')}</dd></div>}
                {p.colors?.length > 0 && <div><dt>Màu sắc</dt><dd>{p.colors.join(', ')}</dd></div>}
                {p.tags?.length > 0 && <div><dt>Từ khóa</dt><dd>{p.tags.map((t) => `#${t}`).join(' ')}</dd></div>}
              </dl>
            </section>

            <section className="card pdp-section">
              <h2>Mô tả sản phẩm</h2>
              {p.description ? <p className="pdp-desc">{p.description}</p> : <p className="muted">Shop đang cập nhật mô tả cho mẫu này. Bạn bấm 💬 để hỏi shop chi tiết nhé!</p>}
            </section>

            {data.related.length > 0 && (
              <section className="pdp-related">
                <h2>Sản phẩm tương tự</h2>
                <div className="products">
                  {data.related.map((r, k) => (
                    <a key={r.id} className="card product mini" href={`/p/${r.id}`} style={{ '--i': k }}>
                      <div className="product-media">
                        {r.image ? <img src={r.image} alt={r.name} loading="lazy" /> : <div className="noimg">Chưa có ảnh</div>}
                      </div>
                      <b>{r.name}</b>
                      <span className="price">{vnd(r.priceVnd)}</span>
                      {r.sold > 0 && <small className="muted">Đã bán {r.sold}</small>}
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {p && (
        <nav className="pdp-bar" aria-label="Mua hàng">
          <button type="button" onClick={() => window.dispatchEvent(new Event('tb-open-chat'))}>💬<span>Chat</span></button>
          <button type="button" className="pdp-bar-add" onClick={() => add(false)}>🛒<span>Thêm vào giỏ</span></button>
          <button type="button" className="primary" onClick={() => add(true)}>Mua ngay</button>
        </nav>
      )}
      <ChatWidget products={p ? [p, ...data.related] : []} user={user} onBuy={(pid) => (pid === p?.id ? add(true) : location.assign(`/p/${pid}`))} />
      {toast && <div className="toast">{toast} <a href="/cart">Xem giỏ →</a></div>}
      <BottomBar active="shop" cartCount={cart.count} />
    </div>
  )
}
