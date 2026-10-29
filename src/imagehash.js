// So khớp ảnh ngay trong trình duyệt: kết hợp cấu trúc sáng-tối (NCC), phân bố màu và bố cục màu.
// Ảnh khách thường là ảnh mẫu của shop (chụp màn hình, cắt viền, đổi độ sáng) nên thử thêm vài kiểu cắt ảnh khách.
export const SIZE = 32
const BINS = 4
export const CROPS = [[0, 0, 1, 1], [0.08, 0.08, 0.84, 0.84], [0.18, 0.18, 0.64, 0.64], [0, 0, 1, 0.7], [0, 0.3, 1, 0.7], [0, 0.12, 1, 0.76], [0, 0.2, 1, 0.6], [0.1, 0.2, 0.8, 0.6], [0.12, 0.12, 0.76, 0.76]]
export const STRONG = 0.85
export const WEAK = 0.7

const cache = new Map()

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Không tải được ảnh'))
    image.src = src
  })
}

function pixels(image, [x, y, w, h]) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, SIZE, SIZE)
  const iw = image.naturalWidth
  const ih = image.naturalHeight
  ctx.drawImage(image, x * iw, y * ih, w * iw, h * ih, 0, 0, SIZE, SIZE)
  return ctx.getImageData(0, 0, SIZE, SIZE).data
}

// Tự cân sáng để ảnh chụp tối/sáng hơn bản gốc vẫn khớp
function gainOf(rgba) {
  const luma = []
  for (let i = 0; i < rgba.length; i += 4) luma.push(rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114)
  luma.sort((a, b) => a - b)
  const p = luma[Math.floor(luma.length * 0.95)] || 255
  return Math.min(1.6, Math.max(0.7, 225 / Math.max(p, 1)))
}

// rgba: mảng SIZE*SIZE*4
export function features(rgba) {
  const gain = gainOf(rgba)
  const gray = new Float32Array(16 * 16)
  const grid = new Float32Array(4 * 4 * 3)
  const hist = new Float32Array(BINS ** 3)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4
      const r = Math.min(255, rgba[i] * gain)
      const g = Math.min(255, rgba[i + 1] * gain)
      const b = Math.min(255, rgba[i + 2] * gain)
      gray[(y >> 1) * 16 + (x >> 1)] += (r * 0.299 + g * 0.587 + b * 0.114) / 4
      const c = ((y >> 3) * 4 + (x >> 3)) * 3
      grid[c] += r / 64
      grid[c + 1] += g / 64
      grid[c + 2] += b / 64
      hist[(((r | 0) >> 6) * BINS + ((g | 0) >> 6)) * BINS + ((b | 0) >> 6)] += 1 / (SIZE * SIZE)
    }
  }
  const mean = gray.reduce((s, v) => s + v, 0) / gray.length
  let norm = 0
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] -= mean
    norm += gray[i] * gray[i]
  }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < gray.length; i += 1) gray[i] /= norm
  return { gray, grid, hist }
}

export function similarity(a, b) {
  let ncc = 0
  for (let i = 0; i < a.gray.length; i += 1) ncc += a.gray[i] * b.gray[i]
  let inter = 0
  for (let i = 0; i < a.hist.length; i += 1) inter += Math.min(a.hist[i], b.hist[i])
  let diff = 0
  for (let i = 0; i < a.grid.length; i += 1) diff += Math.abs(a.grid[i] - b.grid[i])
  const grid = 1 - diff / (a.grid.length * 255)
  return 0.45 * Math.max(0, ncc) + 0.3 * inter + 0.25 * grid * grid
}

function load(src) {
  if (!cache.has(src)) {
    cache.set(src, loadImage(src).catch((e) => { cache.delete(src); throw e }))
  }
  return cache.get(src)
}

const productFeatures = new Map()
const MAX_PER_PRODUCT = 4 // so khớp tối đa 4 ảnh đầu của mỗi mẫu cho nhanh
// Ảnh ở domain ngoài đọc qua proxy cùng origin (canvas mới đọc được pixel); ảnh shop tải lên (/api/img/...) đọc trực tiếp
function ofImage(p, url, i) {
  const src = /^https?:/i.test(url) ? `/api/public/img/${encodeURIComponent(p.id)}?i=${i}` : url
  const key = p.id + '|' + i + '|' + url.length + '|' + url.slice(-24)
  if (!productFeatures.has(key)) {
    productFeatures.set(key, load(src).then((img) => features(pixels(img, CROPS[0]))).catch((e) => { productFeatures.delete(key); throw e }))
  }
  return productFeatures.get(key)
}
const imagesOf = (p) => (p.images?.length ? p.images : p.image ? [p.image] : []).slice(0, MAX_PER_PRODUCT)

export async function searchProductsByImage(src, products, onProgress = () => {}) {
  const img = await load(src)
  const queries = CROPS.map((c) => features(pixels(img, c)))
  const matches = []
  let scanned = 0
  let skipped = 0
  for (const product of products) {
    const urls = imagesOf(product)
    if (urls.length) {
      // Điểm của mẫu = ảnh giống nhất trong bộ ảnh của mẫu
      const feats = (await Promise.allSettled(urls.map((u, i) => ofImage(product, u, i)))).filter((r) => r.status === 'fulfilled').map((r) => r.value)
      if (feats.length) {
        const score = Math.max(...feats.flatMap((f) => queries.map((q) => similarity(q, f))))
        matches.push({ product, score, similarity: Math.round(score * 100) })
      } else {
        skipped += 1
      }
    }
    scanned += 1
    onProgress(scanned)
  }
  matches.sort((a, b) => b.score - a.score)
  const good = matches.filter((m) => m.score >= WEAK).slice(0, 5)
  return { matches: good, best: good[0]?.score >= STRONG, skipped, scanned }
}
