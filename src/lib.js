import { useEffect, useState } from 'react'

export const STOCK_STATUS = {
  TQ: 'Đang ở kho TQ',
  TRANSIT: 'Đang trên đường về',
  READY: 'Sẵn sàng giao',
}
export const ETA = {
  TQ: 'khoảng 10-15 ngày',
  TRANSIT: 'khoảng 3-7 ngày',
  READY: 'trong 1-3 ngày',
}
// Hành trình đơn (cột Kanban theo thứ tự)
export const ORDER_STATUS = ['Mới', 'Đã mua', 'Kho TQ', 'Đang về', 'Kho VN', 'Đã xuất kho', 'Đang giao', 'Hoàn thành', 'Đã hủy']
export const STATUS_LABEL = {
  'Mới': 'Chờ đặt hàng',
  'Đã mua': 'Đã mua · chờ kho TQ nhận',
  'Kho TQ': 'Đã tới kho TQ',
  'Đang về': 'Đang về VN',
  'Kho VN': 'Kho VN',
  'Đã xuất kho': 'Đã xuất kho',
  'Đang giao': 'Đang giao',
  'Hoàn thành': 'Hoàn thành',
  'Đã hủy': 'Đã hủy',
}
export const FINAL_STATUS = ['Hoàn thành', 'Đã hủy']
export const STALE_DAYS = 5
// Dữ liệu cũ dùng "Đã xác nhận" tương đương "Đã mua"
export const normStatus = (s) => (s === 'Đã xác nhận' ? 'Đã mua' : s)
export const daysIn = (o, now = Date.now()) => (now - new Date(o.statusAt || o.createdAt)) / 86400000
export const isStale = (o, now = Date.now()) => normStatus(o.status) === 'Đã mua' && daysIn(o, now) > STALE_DAYS

// Các bước khách nhìn thấy ở trang theo dõi
export const TRACK_STEPS = ['Đã nhận đơn', 'Đang mua hàng', 'Đang về Việt Nam', 'Đang giao', 'Hoàn thành']
export const trackStep = (status) =>
  ({ 'Mới': 0, 'Đã mua': 1, 'Kho TQ': 1, 'Đang về': 2, 'Kho VN': 2, 'Đã xuất kho': 3, 'Đang giao': 3, 'Hoàn thành': 4 })[normStatus(status)] ?? 0

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newTrackCode(len = 8) {
  const a = new Uint32Array(len)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => CODE_CHARS[n % CODE_CHARS.length]).join('')
}

export const BANKS = [
  ['970436', 'Vietcombank'], ['970407', 'Techcombank'], ['970422', 'MB Bank'], ['970416', 'ACB'], ['970418', 'BIDV'],
  ['970415', 'VietinBank'], ['970432', 'VPBank'], ['970423', 'TPBank'], ['970403', 'Sacombank'], ['970405', 'Agribank'],
  ['970441', 'VIB'], ['970437', 'HDBank'], ['970448', 'OCB'], ['970443', 'SHB'],
]
export const DEFAULT_TEMPLATE =
  'Dạ mẫu {ten} giá gốc {gia_te} tệ, tổng tiền về tay là {gia_vnd} ạ. Chị chuyển khoản cọc giúp em {tien_coc} nhé 💕 Còn lại {con_lai} thanh toán khi nhận hàng.{link_track}'
export const DEFAULT_SHOP = {
  name: 'TN Shop', phone: '', bankBin: '970436', bankAccount: '', bankHolder: '', depositPct: 50, template: DEFAULT_TEMPLATE,
}
export const TEMPLATE_VARS = ['ten', 'gia_te', 'gia_vnd', 'tien_coc', 'con_lai', 'size', 'mau', 'sl', 'ma_don', 'ten_khach', 'stk', 'link_track']

export const fillTemplate = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))

// Biến cho câu chốt đơn từ một đơn hàng hoặc một mẫu
export function templateVars({ product, order, shop, origin = '' }) {
  const s = { ...DEFAULT_SHOP, ...shop }
  const pct = Math.min(100, Math.max(0, Number(s.depositPct) || 0)) / 100
  const bank = BANKS.find((b) => b[0] === s.bankBin)?.[1] || ''
  const stk = s.bankAccount ? `${bank} ${s.bankAccount} - ${s.bankHolder}`.trim() : ''
  if (order) {
    const t = orderTotals(order)
    const it = order.items[0] || {}
    const deposit = order.deposit || Math.round((t.revenue * pct) / 1000) * 1000
    return {
      ten: order.items.map((i) => i.name).join(' + '), gia_te: product?.priceCny ?? '', gia_vnd: vnd(t.revenue),
      tien_coc: vnd(deposit), con_lai: vnd(Math.max(0, t.revenue - deposit)), size: it.size || '', mau: it.color || '',
      sl: order.items.reduce((n, i) => n + i.qty, 0), ma_don: order.id, ten_khach: order.customer?.name || '', stk,
      link_track: order.trackCode && origin ? `\nTheo dõi đơn: ${origin}/track/${order.trackCode}` : '',
    }
  }
  const price = product?.priceVnd || 0
  const deposit = Math.round((price * pct) / 1000) * 1000
  return {
    ten: product?.name || '', gia_te: product?.priceCny ?? '', gia_vnd: vnd(price), tien_coc: vnd(deposit), con_lai: vnd(price - deposit),
    size: product?.sizes?.join('/') || '', mau: product?.colors?.join('/') || '', sl: 1, ma_don: '', ten_khach: '', stk, link_track: '',
  }
}
export const CARRIERS = ['GHN', 'SPX', 'J&T', 'Viettel Post']
export const TAX_RATE = 0.015 // 1% GTGT + 0.5% TNCN

export const vnd = (n) => Math.round(n || 0).toLocaleString('vi-VN') + 'đ'
export const today = () => new Date().toISOString().slice(0, 10)
export const uid = () => Math.random().toString(36).slice(2, 9)
export const daysAgo = (d) => Math.floor((Date.now() - new Date(d)) / 86400000)

export function usePersisted(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s ? JSON.parse(s) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(v))
  }, [key, v])
  // Đồng bộ giữa các tab (admin và trang khách mở cùng lúc)
  useEffect(() => {
    const on = (e) => {
      if (e.key !== key || e.newValue == null) return
      try { setV(JSON.parse(e.newValue)) } catch { /* bỏ qua */ }
    }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [key])
  return [v, setV]
}

// Tỷ giá áp dụng = bản ghi gần nhất có ngày <= ngày cần tính
export function rateOn(rates, date) {
  const sorted = [...rates].sort((a, b) => a.date.localeCompare(b.date))
  let r = sorted[0]?.rate || 0
  for (const x of sorted) if (x.date <= date) r = x.rate
  return r
}

export const FEE_MODES = { fixed: 'đ / sản phẩm', kg: 'đ / kg', percent: '% giá nội địa' }
export const DEFAULT_PRICING = {
  defaultWeightKg: 0.5,
  border: { mode: 'kg', value: 5000 }, // phí ship cửa khẩu
  labor: { mode: 'percent', value: 5 }, // tiền công
  ship: { mode: 'kg', value: 30000 }, // tiền ship
}

function fee(f, base, kg) {
  const v = Number(f?.value) || 0
  return f?.mode === 'kg' ? v * kg : f?.mode === 'percent' ? (base * v) / 100 : v
}

// Chi tiết: giá nội địa (¥ → VNĐ) + ship cửa khẩu + tiền công + tiền ship = final
export function priceBreakdown(p, rate, cfg = DEFAULT_PRICING) {
  const kg = Number(p.weightKg) || cfg.defaultWeightKg || 0
  const goods = (Number(p.priceCny) + Number(p.domesticShipCny || 0)) * rate
  const border = fee(cfg.border, goods, kg)
  const labor = fee(cfg.labor, goods, kg)
  const ship = fee(cfg.ship, goods, kg)
  return { goods, border, labor, ship, final: goods + border + labor + ship }
}

export const finalPrice = (p, rate, cfg) => priceBreakdown(p, rate, cfg).final
export const costVnd = finalPrice

// Bù giá trị mặc định cho cài đặt cũ thiếu trường
export function normalizeCfg(saved) {
  return {
    ...DEFAULT_PRICING,
    ...saved,
    border: { ...DEFAULT_PRICING.border, ...saved?.border },
    labor: { ...DEFAULT_PRICING.labor, ...saved?.labor },
    ship: { ...DEFAULT_PRICING.ship, ...saved?.ship },
  }
}

// Gắn giá vốn (theo tỷ giá ngày tạo đơn + cài đặt hiện tại) vào từng dòng hàng
export function withCosts(order, products, rates, cfg) {
  const rate = rateOn(rates, order.createdAt)
  return {
    ...order,
    items: order.items.map((i) => {
      const p = products.find((x) => x.id === i.productId)
      return { ...i, cost: p ? costVnd(p, rate, cfg) : 0 }
    }),
  }
}

export const fullAddress = (c) => [c.address, c.ward, c.district, c.province].filter(Boolean).join(', ')

export function orderTotals(o) {
  const revenue = o.items.reduce((s, i) => s + i.price * i.qty, 0) + (o.shipFee || 0)
  const cost = o.items.reduce((s, i) => s + i.cost * i.qty, 0)
  const tax = o.status === 'Hoàn thành' ? revenue * TAX_RATE : 0
  return { revenue, cost, tax, profit: revenue - cost - tax, cod: Math.max(0, revenue - (o.deposit || 0)) }
}

export const SEED_PRODUCTS = [
  {
    id: 'p1', name: 'Áo khoác phao dáng ngắn', image: '', sourceUrl: 'https://item.taobao.com/item.htm?id=1001',
    priceCny: 120, domesticShipCny: 8, weightKg: 0.8, sizes: ['S', 'M', 'L'], colors: ['Đen', 'Be'],
    tags: ['áo khoác', 'mùa đông', 'hot trend'], category: 'Áo khoác', priceVnd: 690000, stock: 12, status: 'READY', createdAt: '2026-08-20',
  },
  {
    id: 'p2', name: 'Váy len dáng dài', image: '', sourceUrl: 'https://detail.1688.com/offer/1002.html',
    priceCny: 85, domesticShipCny: 5, weightKg: 0.5, sizes: ['S', 'M'], colors: ['Xám', 'Kem'],
    tags: ['váy', 'mùa đông'], category: 'Váy', priceVnd: 450000, stock: 20, status: 'TRANSIT', createdAt: '2026-10-01',
  },
  {
    id: 'p3', name: 'Áo thun oversize', image: '', sourceUrl: 'https://item.taobao.com/item.htm?id=1003',
    priceCny: 25, domesticShipCny: 3, weightKg: 0.25, sizes: ['M', 'L', 'XL'], colors: ['Trắng', 'Đen'],
    tags: ['áo thun', 'hot trend'], category: 'Áo thun', priceVnd: 180000, stock: 30, status: 'TQ', createdAt: '2026-10-10',
  },
]

// Chuyển ảnh (URL/dataURL) thành PNG blob để ghi vào clipboard
async function toPngBlob(src) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = rej
    img.src = src
  })
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d').drawImage(img, 0, 0)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'))
}

export function customerText(p) {
  return [
    `🛍 ${p.name}`,
    `💰 Giá: ${vnd(p.priceVnd)}`,
    `📏 Size còn: ${p.sizes.join(', ') || '—'}`,
    `🎨 Màu: ${p.colors.join(', ') || '—'}`,
    `🚚 ${STOCK_STATUS[p.status]} - nhận hàng ${ETA[p.status]}`,
  ].join('\n')
}

// Trả về 'image+text' | 'text'
export async function copyForCustomer(p) {
  const text = customerText(p)
  if (p.image && window.ClipboardItem) {
    try {
      const png = await toPngBlob(p.image)
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png, 'text/plain': new Blob([text], { type: 'text/plain' }) }),
      ])
      return 'image+text'
    } catch {
      /* fallback sang text */
    }
  }
  await navigator.clipboard.writeText(text)
  return 'text'
}
