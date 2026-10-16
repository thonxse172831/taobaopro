// Hàm này chạy TRÊN trang Taobao/1688/PDD nên phải tự chứa (không dùng biến/hàm bên ngoài)
function scrapePage() {
  const abs = (u) => {
    try { return new URL(u, location.href).href } catch { return '' }
  }
  // Bỏ hậu tố thu nhỏ để lấy ảnh gốc nét nhất
  const hires = (u) => abs(u)
    .replace(/_\d+x\d+[^/]*$/i, '')
    .replace(/\.(jpg|jpeg|png|webp)_[^/]*$/i, '.$1')
    .replace(/\.\d+x\d+(\.(jpg|jpeg|png|webp))/i, '$1')
    .replace(/\?.*$/, '')
  const meta = (n) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content || ''

  const name = (meta('og:title') || document.querySelector('h1')?.innerText || document.title || '')
    .replace(/[-_|–]\s*(淘宝网|天猫|taobao|tmall|阿里巴巴|1688|拼多多).*$/i, '').trim()

  let price = 0
  const sel = '[class*="rice"],[class*="Price"],[class*="amount"],[data-spm*="rice"]'
  for (const el of document.querySelectorAll(sel)) {
    const m = (el.innerText || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
    const v = m ? parseFloat(m[1]) : 0
    if (v > 0 && v < 100000) { price = v; break }
  }
  if (!price) {
    const m = (document.body.innerText || '').replace(/,/g, '').match(/[¥￥]\s*(\d+(?:\.\d+)?)/)
    if (m) price = parseFloat(m[1])
  }

  const seen = new Set()
  const images = []
  const add = (u) => {
    if (!u || /^data:/.test(u)) return
    const h = hires(u)
    if (!/^https:/.test(h) || /\.(gif|svg)$/i.test(h) || seen.has(h)) return
    seen.add(h)
    images.push(h)
  }
  add(meta('og:image'))
  const big = [...document.images]
    .map((i) => ({ i, a: (i.naturalWidth || i.width) * (i.naturalHeight || i.height) }))
    .filter((x) => x.a >= 200 * 200)
    .sort((a, b) => b.a - a.a)
  for (const { i } of big) add(i.currentSrc || i.src || i.getAttribute('data-src'))

  return { name, priceCny: price, images: images.slice(0, 9), url: location.href }
}

// Bookmarklet: thu thập dữ liệu rồi mở trang /clip của shop, dữ liệu truyền qua phần #hash (không gửi lên máy chủ)
export function bookmarkletHref(origin) {
  const code = `(function(){var s=${scrapePage.toString()};try{var d=s();if(!d.name){alert('Không đọc được sản phẩm');return}`
    + `var w=window.open(${JSON.stringify(origin)}+'/clip#'+encodeURIComponent(JSON.stringify(d)),'tb_clip','width=420,height=520');`
    + `if(!w)alert('Trình duyệt chặn cửa sổ bật lên, hãy cho phép rồi bấm lại')}catch(e){alert('Lỗi: '+e.message)}})()`
  return 'javascript:' + encodeURIComponent(code)
}

export { scrapePage }
