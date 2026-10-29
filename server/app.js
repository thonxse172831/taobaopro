import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { openDb } from './db.js'
import { createAuth, hashPassword, verifyPassword } from './auth.js'
import { createCaptcha } from './captcha.js'
import {
  withCosts, normalizeCfg, DEFAULT_PRICING, SEED_PRODUCTS, priceBreakdown, rateOn, orderTotals, trackStep, TRACK_STEPS, STATUS_LABEL, normStatus,
  DEFAULT_SHOP, BANKS, depositOf, depositEnabled, DEPOSIT_TTL_HOURS,
} from '../src/lib.js'
import { mapWebhook } from '../src/logistics.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const KV_KEYS = new Set(['products', 'rates', 'pricing', 'links', 'linkcfg', 'shop', 'layouts'])
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newTrackCode = () => Array.from(crypto.randomBytes(8), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('')
const maskName = (n = '') => n.split(' ').filter(Boolean).map((w, i, a) => (i === 0 || i === a.length - 1 ? w : w[0] + '.')).join(' ')
const SOURCE_HOST = /(^|\.)(taobao\.com|tmall\.com|1688\.com|tb\.cn|yangkeduo\.com|pinduoduo\.com)$/
const httpsUrl = (u) => {
  try {
    const x = new URL(u)
    return x.protocol === 'https:' ? x.href.slice(0, 1000) : ''
  } catch { return '' }
}
const itemId = (u) => {
  try {
    const x = new URL(u)
    return x.searchParams.get('id') || x.searchParams.get('goods_id') || (x.pathname.match(/\/offer\/(\d+)/) || [])[1] || ''
  } catch { return '' }
}
const CARRIERS = new Set(['ghn', 'spx', 'jt', 'viettelpost'])
const PUBLIC_FIELDS = ['id', 'name', 'image', 'images', 'sizes', 'colors', 'tags', 'category', 'priceVnd', 'stock', 'status', 'createdAt']

// Kênh đẩy tin tức thời (Server-Sent Events): 'admin' và 'public'
const channels = { admin: new Set(), public: new Set() }
const broadcast = (ch, event) => { for (const res of channels[ch]) res.write(`event: ${event}\ndata: ${Date.now()}\n\n`) }
// Kênh riêng cho từng cuộc chat trực tiếp: khách chỉ nhận tin của cuộc trò chuyện của mình
const chatStreams = new Map()
const pushChat = (id) => { for (const res of chatStreams.get(id) || []) res.write(`event: chat\ndata: ${Date.now()}\n\n`) }
const heartbeat = setInterval(() => {
  for (const set of [...Object.values(channels), ...chatStreams.values()]) for (const res of set) res.write(': ping\n\n')
}, 25000)
heartbeat.unref()
const openStream = (ch) => (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  res.write('retry: 3000\n\n')
  channels[ch].add(res)
  req.on('close', () => channels[ch].delete(res))
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n)
// Chuẩn hóa SĐT di động VN về dạng 0xxxxxxxxx; không hợp lệ thì trả ''
const vnPhone = (v) => {
  let d = String(v ?? '').replace(/[\s.()-]/g, '').replace(/^\+/, '')
  if (/^84\d{9}$/.test(d)) d = '0' + d.slice(2)
  return /^0\d{9}$/.test(d) ? d : ''
}
const vnToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
const newId = () => 'DH' + crypto.randomBytes(4).toString('hex').toUpperCase()
const ORDER_CODE = /DH[0-9A-F]{8}/i
const safeEq = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest())
const DEPOSIT_TTL_MS = DEPOSIT_TTL_HOURS * 3600 * 1000

// Thông tin chuyển khoản cọc cho khách (QR VietQR dựng ở trình duyệt từ các trường này)
const paymentInfo = (o, shop) => ({
  bankBin: shop.bankBin, bankName: BANKS.find((b) => b[0] === shop.bankBin)?.[1] || '', account: shop.bankAccount, holder: shop.bankHolder,
  amount: Math.max(0, (o.depositDue || 0) - (o.depositPaid || 0)), memo: o.id,
  expiresAt: new Date(Date.parse(o.statusAt || o.createdAt) + DEPOSIT_TTL_MS).toISOString(),
})

// Cộng tiền khách chuyển vào đơn; đủ cọc thì đơn chuyển sang "Mới" để shop xử lý (kể cả đơn vừa bị tự hủy vì quá hạn)
function applyPayment(o, amount, ref) {
  const at = new Date().toISOString()
  const paid = (o.depositPaid || 0) + amount
  const next = { ...o, depositPaid: paid, deposit: paid, payments: [...(o.payments || []), { amount, ref, at }] }
  const waiting = o.status === 'Chờ cọc' || (o.status === 'Đã hủy' && o.autoCanceled)
  if (waiting && paid >= (o.depositDue || 0)) {
    Object.assign(next, { status: 'Mới', statusAt: at, paidAt: at })
    delete next.autoCanceled
  }
  return next
}

export async function createApp(env = process.env) {
  const ADMIN_USER = String(env.ADMIN_USER || 'thanhngancao').toLowerCase()
  const distDir = path.join(ROOT, 'dist')

  const db = await openDb(env.MONGODB_URI, env.MONGODB_DB || 'taobaopro')
  const secret = env.SESSION_SECRET || crypto.createHash('sha256').update('tb-session:' + env.MONGODB_URI).digest('hex')
  const auth = createAuth({ secret })

  // Tài khoản admin mặc định; nếu đặt ADMIN_PASSWORD thì mật khẩu admin luôn đồng bộ theo biến này
  const adminRow = await db.getUser(ADMIN_USER)
  if (!adminRow) {
    await db.createUser({ username: ADMIN_USER, name: 'Quản trị', phone: '', role: 'admin', passHash: hashPassword(env.ADMIN_PASSWORD || 'test123') })
    if (!env.ADMIN_PASSWORD) console.warn(`[cảnh báo] Tài khoản admin "${ADMIN_USER}" dùng mật khẩu mặc định, hãy đổi bằng ADMIN_PASSWORD`)
  } else if (env.ADMIN_PASSWORD && !verifyPassword(env.ADMIN_PASSWORD, adminRow.passHash)) {
    await db.setUserPassword(ADMIN_USER, hashPassword(env.ADMIN_PASSWORD))
  }

  if ((await db.getKv('products')) === undefined) await db.setKv('products', SEED_PRODUCTS)
  if ((await db.getKv('rates')) === undefined) await db.setKv('rates', [{ date: '2026-01-01', rate: 3600 }])
  if ((await db.getKv('pricing')) === undefined) await db.setKv('pricing', DEFAULT_PRICING)

  // Đơn chờ cọc quá hạn tự hủy (tiền về muộn vẫn được ghi nhận và khôi phục đơn)
  const expireDeposits = async () => {
    const now = Date.now()
    let n = 0
    for (const o of await db.ordersByStatus('Chờ cọc')) {
      if (now - Date.parse(o.statusAt || o.createdAt) < DEPOSIT_TTL_MS) continue
      await db.saveOrder({ ...o, status: 'Đã hủy', statusAt: new Date().toISOString(), autoCanceled: true, note: [o.note, `Tự hủy: quá ${DEPOSIT_TTL_HOURS} giờ chưa chuyển cọc`].filter(Boolean).join(' · ') })
      n += 1
    }
    if (n) broadcast('admin', 'orders')
  }
  setInterval(() => expireDeposits().catch((e) => console.error('[hủy đơn chờ cọc]', e)), 10 * 60 * 1000).unref()

  const app = express()
  app.disable('x-powered-by')
  if (env.TRUST_PROXY) app.set('trust proxy', Number(env.TRUST_PROXY) || env.TRUST_PROXY)

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        connectSrc: ["'self'", 'https:', 'http:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }))
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/events') && compression.filter(req, res) }))
  app.use(express.json({ limit: '8mb' }))

  const api = express.Router()

  // Chặn CSRF: yêu cầu ghi phải cùng origin
  api.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/webhook/')) return next()
    const origin = req.headers.origin
    if (!origin || req.headers['sec-fetch-site'] === 'same-origin') return next()
    let host
    try { host = new URL(origin).host } catch { return res.status(403).json({ error: 'Origin không hợp lệ' }) }
    const fwd = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
    const allowed = new Set([req.headers.host, fwd, ...String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''))].filter(Boolean))
    if (!allowed.has(host)) return res.status(403).json({ error: 'Origin không hợp lệ' })
    next()
  })

  api.get('/health', (req, res) => res.json({ ok: true }))

  // ---------- Tài khoản: đăng nhập / đăng ký ----------
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { error: 'Thử lại sau 15 phút' } })
  const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Đăng ký quá nhiều lần, thử lại sau' } })
  const captcha = createCaptcha({ secret })
  const pub = (u) => ({ username: u._id, name: u.name, phone: u.phone || '', role: u.role, addresses: u.addresses || [], avatar: u.avatar || '' })
  const PHONE = /^(\+?84|0)\d{8,10}$/
  const cleanPhone = (v) => clip(v, 20).replace(/[\s.-]/g, '')

  // Khách đăng nhập bằng SĐT (0xxxxxxxxx / +84… đều được); admin vẫn dùng tên đăng nhập
  api.post('/auth/login', loginLimit, async (req, res) => {
    const raw = clip(req.body?.username, 40)
    const username = vnPhone(raw) || raw.toLowerCase()
    const u = username && await db.getUser(username)
    if (!u || !verifyPassword(req.body?.password, u.passHash)) return res.status(401).json({ error: 'Sai số điện thoại hoặc mật khẩu' })
    auth.setCookie(req, res, { username: u._id, role: u.role })
    res.json({ ok: true, user: pub(u) })
  })

  // Captcha chữ + số cho form đăng ký (chống đăng ký hàng loạt)
  api.get('/auth/captcha', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), (req, res) => {
    res.set('Cache-Control', 'no-store').json(captcha.issue())
  })

  // Đăng ký: SĐT + mật khẩu + captcha; SĐT chính là tên đăng nhập
  api.post('/auth/register', registerLimit, async (req, res) => {
    const b = req.body || {}
    const bad = captcha.check(b.captchaToken, b.captcha)
    if (bad) return res.status(400).json({ error: bad, captcha: true })
    const phone = vnPhone(b.phone)
    const pw = String(b.password ?? '')
    if (!phone) return res.status(400).json({ error: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0)' })
    if (pw.length < 6 || pw.length > 100) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' })
    if (b.confirm !== undefined && String(b.confirm) !== pw) return res.status(400).json({ error: 'Mật khẩu nhập lại không khớp' })
    const user = { username: phone, name: '', phone, role: 'customer', passHash: hashPassword(pw) }
    try {
      await db.createUser(user)
    } catch (e) {
      if (e?.code === 11000) return res.status(409).json({ error: 'Số điện thoại này đã được đăng ký, vui lòng đăng nhập' })
      throw e
    }
    auth.setCookie(req, res, user)
    res.status(201).json({ ok: true, user: pub({ _id: phone, ...user }) })
  })
  api.post('/auth/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }) })
  api.get('/auth/me', async (req, res) => {
    const s = auth.session(req)
    const u = s && await db.getUser(s.username)
    res.json({ user: u ? pub(u) : null })
  })

  // Khách đã đăng nhập xem đơn của mình
  api.get('/me/orders', auth.requireUser, async (req, res) => {
    res.json((await db.ordersByOwner(req.user.username)).map((o) => {
      const t = orderTotals(o)
      return {
        id: o.id, trackCode: o.trackCode, createdAt: o.createdAt, status: normStatus(o.status), label: STATUS_LABEL[normStatus(o.status)] || o.status,
        total: t.revenue, deposit: o.deposit || 0, cod: t.cod, depositDue: o.depositDue || 0,
        items: (o.items || []).map(({ productId, name, size, color, qty, price }) => ({ productId, name, size, color, qty, price })),
      }
    }))
  })

  // Hồ sơ khách: họ tên, SĐT và sổ địa chỉ nhận hàng (tối đa 10)
  const cleanAddress = (a) => {
    const x = {
      id: clip(a?.id, 20) || crypto.randomBytes(4).toString('hex'), label: clip(a?.label, 30),
      name: clip(a?.name, 100), phone: cleanPhone(a?.phone), mode: a?.mode === 'old' ? 'old' : 'new',
      province: clip(a?.province, 100), district: clip(a?.district, 100), ward: clip(a?.ward, 100), street: clip(a?.street, 200), isDefault: !!a?.isDefault,
    }
    if (x.mode === 'new') x.district = ''
    if (!x.name || !PHONE.test(x.phone) || !x.province || !x.ward || !x.street || (x.mode === 'old' && !x.district)) return null
    return x
  }
  api.put('/me/profile', auth.requireUser, async (req, res) => {
    const b = req.body || {}
    const name = clip(b.name, 80)
    // Tài khoản đăng ký bằng SĐT: SĐT là tên đăng nhập nên không cho đổi
    const phone = vnPhone(req.user.username) || cleanPhone(b.phone)
    if (phone && !PHONE.test(phone)) return res.status(400).json({ error: 'Số điện thoại không hợp lệ' })
    const raw = Array.isArray(b.addresses) ? b.addresses.slice(0, 10) : []
    const addresses = raw.map(cleanAddress)
    if (addresses.some((a) => !a)) return res.status(400).json({ error: 'Địa chỉ chưa đủ thông tin (người nhận, SĐT, tỉnh, phường/xã, số nhà)' })
    // Luôn có đúng một địa chỉ mặc định
    const def = Math.max(0, addresses.findIndex((a) => a.isDefault))
    addresses.forEach((a, i) => { a.isDefault = i === def })
    await db.updateUser(req.user.username, { name, phone, addresses })
    res.json({ ok: true, user: pub({ ...(await db.getUser(req.user.username)) }) })
  })
  // Giỏ hàng theo tài khoản (đồng bộ giữa các thiết bị); giá luôn lấy theo mẫu lúc đặt nên chỉ lưu mẫu/size/màu/SL
  api.get('/me/cart', auth.requireUser, async (req, res) => {
    const u = await db.getUser(req.user.username)
    res.set('Cache-Control', 'no-store').json({ items: u?.cart || [] })
  })
  // Ảnh đại diện: trình duyệt đã cắt vuông + thu nhỏ, gửi lên dạng data URL (tối đa ~200KB); '' = xóa ảnh
  api.put('/me/avatar', auth.requireUser, async (req, res) => {
    const avatar = String(req.body?.avatar ?? '')
    if (avatar && (avatar.length > 280000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar))) {
      return res.status(400).json({ error: 'Ảnh đại diện không hợp lệ hoặc quá lớn' })
    }
    await db.updateUser(req.user.username, { avatar })
    res.json({ ok: true, user: pub(await db.getUser(req.user.username)) })
  })
  api.put('/me/cart', auth.requireUser, async (req, res) => {
    const raw = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : null
    if (!raw) return res.status(400).json({ error: 'Giỏ hàng không hợp lệ' })
    const items = raw
      .map((i) => ({ productId: clip(i?.productId, 40), size: clip(i?.size, 60), color: clip(i?.color, 60), qty: Math.min(99, Math.max(1, Math.floor(Number(i?.qty)) || 1)) }))
      .filter((i) => i.productId)
    await db.updateUser(req.user.username, { cart: items })
    res.json({ ok: true, items })
  })
  api.post('/me/password', auth.requireUser, loginLimit, async (req, res) => {
    const u = await db.getUser(req.user.username)
    if (!u || !verifyPassword(req.body?.current, u.passHash)) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' })
    const pw = String(req.body?.next ?? '')
    if (pw.length < 6 || pw.length > 100) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' })
    await db.setUserPassword(u._id, hashPassword(pw))
    res.json({ ok: true })
  })

  // ---------- Khách: xem mẫu & đặt hàng ----------
  api.get('/public/events', openStream('public'))
  api.get('/public/catalog', async (req, res) => {
    const products = ((await db.getKv('products')) || []).map((p) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, p[k]])))
    const shop = { ...DEFAULT_SHOP, ...(await db.getKv('shop')) }
    res.set('Cache-Control', 'no-cache').json({ products, depositPct: depositEnabled(shop) ? Number(shop.depositPct) : 0 })
  })

  // Chuyển tiếp ảnh mẫu ở domain ngoài (cùng origin) để trình duyệt đọc được pixel khi so khớp ảnh
  // ?i=n: ảnh thứ n trong bộ ảnh của mẫu (mặc định ảnh chính)
  api.get('/public/img/:id', async (req, res) => {
    const p = ((await db.getKv('products')) || []).find((x) => x.id === req.params.id)
    const list = p?.images?.length ? p.images : [p?.image]
    const url = httpsUrl(list[Math.max(0, Math.floor(Number(req.query.i)) || 0)])
    let host = ''
    try { host = new URL(url).hostname } catch { /* không có ảnh */ }
    if (!url || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return res.status(404).end()
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
      const type = r.headers.get('content-type') || ''
      const buf = Buffer.from(await r.arrayBuffer())
      if (!r.ok || !type.startsWith('image/') || buf.length > 6 * 1024 * 1024) return res.status(404).end()
      res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' }).send(buf)
    } catch {
      res.status(404).end()
    }
  })

  // Ảnh mẫu do shop tải lên: tên ngẫu nhiên, nội dung không đổi → cho trình duyệt cache lâu
  api.get('/img/:id', async (req, res) => {
    const img = /^[a-f0-9]{24}$/.test(req.params.id) && await db.getImage(req.params.id)
    if (!img) return res.status(404).end()
    res.set({ 'Content-Type': img.type, 'Cache-Control': 'public, max-age=31536000, immutable' }).send(Buffer.from(img.data?._bsontype === 'Binary' ? img.data.buffer : img.data))
  })

  const orderLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Bạn đặt quá nhiều đơn, vui lòng thử lại sau' } })
  api.post('/public/orders',   orderLimit, async (req, res) => {
    const b = req.body || {}
    const c = b.customer || {}
      const products = (await db.getKv('products')) || []
    const customer = {
      name: clip(c.name, 100), phone: clip(c.phone, 20).replace(/[\s.-]/g, ''),
      province: clip(c.province, 100), district: clip(c.district, 100), ward: clip(c.ward, 100),
      address: clip(c.address, 200), addressMode: c.addressMode === 'old' ? 'old' : 'new',
    }
    if (!customer.name) return res.status(400).json({ error: 'Vui lòng nhập họ tên' })
    if (!/^(\+?84|0)\d{8,10}$/.test(customer.phone)) return res.status(400).json({ error: 'Số điện thoại không hợp lệ' })
    if (!customer.province || !customer.ward || !customer.address) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ địa chỉ' })
    if (customer.addressMode === 'old' && !customer.district) return res.status(400).json({ error: 'Vui lòng chọn Quận/Huyện' })
    const raw = Array.isArray(b.items) ? b.items.slice(0, 20) : []
    if (!raw.length) return res.status(400).json({ error: 'Đơn hàng trống' })

    const items = []
    for (const i of raw) {
      const p = products.find((x) => x.id === i?.productId)
      if (!p) return res.status(400).json({ error: 'Mẫu hàng không tồn tại' })
      const qty = Math.min(99, Math.max(1, Math.floor(Number(i.qty)) || 1))
      // Mẫu nhiều size/màu thì khách phải tự chọn; chỉ tự điền khi mẫu có đúng một lựa chọn
      const pick = (opts = [], v) => (opts.includes(v) ? v : opts.length === 1 ? opts[0] : opts.length ? null : '')
      const size = pick(p.sizes, i.size)
      const color = pick(p.colors, i.color)
      if (size === null) return res.status(400).json({ error: `Vui lòng chọn size cho mẫu "${p.name}"` })
      if (color === null) return res.status(400).json({ error: `Vui lòng chọn màu cho mẫu "${p.name}"` })
      items.push({ productId: p.id, name: p.name, size, color, qty, price: p.priceVnd, cost: 0 })
    }
    const order = withCosts({
      id: newId(), trackCode: newTrackCode(), owner: auth.session(req)?.username, createdAt: vnToday(), statusAt: new Date().toISOString(), status: 'Mới', deposit: 0, source: 'shop', customer, items,
      ...(clip(b.note, 300) && { note: clip(b.note, 300) }),
    }, products, (await db.getKv('rates')) || [], normalizeCfg(await db.getKv('pricing')))
    // Shop đã cài tài khoản nhận cọc: đơn chờ khách chuyển khoản, SePay báo tiền về thì tự xác nhận
    const shop = { ...DEFAULT_SHOP, ...(await db.getKv('shop')) }
    const due = depositEnabled(shop) ? depositOf(orderTotals(order).revenue, shop.depositPct) : 0
    if (due > 0) Object.assign(order, { status: 'Chờ cọc', depositDue: due, depositPaid: 0 })
    await db.saveOrder(order)
    broadcast('admin', 'orders')
    res.status(201).json({ ok: true, id: order.id, trackCode: order.trackCode, payment: due > 0 ? paymentInfo(order, shop) : null })
  })

  // Trang theo dõi đơn của khách: chỉ trả dữ liệu rút gọn, tra theo mã ngẫu nhiên khó đoán
  api.get('/public/track/:code', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const code = clip(req.params.code, 20).toUpperCase()
    const o = code ? await db.orderByTrackCode(code) : undefined
    if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' })
    const shop = { ...DEFAULT_SHOP, ...(await db.getKv('shop')) }
    const t = orderTotals(o)
    res.set('Cache-Control', 'no-store').json({
      payment: o.status === 'Chờ cọc' ? paymentInfo(o, shop) : null, depositDue: o.depositDue || 0,
      id: o.id, createdAt: o.createdAt, statusAt: o.statusAt || null, status: normStatus(o.status), label: STATUS_LABEL[normStatus(o.status)] || o.status,
      step: trackStep(o.status), steps: TRACK_STEPS, canceled: o.status === 'Đã hủy',
      customer: maskName(o.customer?.name), carrier: o.carrier || '', tracking: o.tracking || '',
      items: o.items.map(({ name, size, color, qty, price }) => ({ name, size, color, qty, price })),
      total: t.revenue, deposit: o.deposit || 0, cod: t.cod,
      shop: { name: shop.name || 'TN Shop', phone: shop.phone || '' },
    })
  })

  api.get('/public/orders/:id', rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true,   legacyHeaders: false }), async (req, res) => {
      const o = await db.getOrder(req.params.id)
    const phone = clip(req.query.phone, 20).replace(/[\s.-]/g, '')
    if (!o || !phone || o.customer?.phone !== phone) return res.status(404).json({ error: 'Không tìm thấy đơn' })
    res.json({ id: o.id, status: o.status, createdAt: o.createdAt, carrier: o.carrier, tracking: o.tracking, items: o.items.map(({ name, size, color, qty, price }) => ({ name, size, color, qty, price })) })
  })

  // ---------- Chat trực tiếp với shop (khi bot không giải quyết được) ----------
  // Mã cuộc trò chuyện là chuỗi ngẫu nhiên 16 byte, khó đoán: ai giữ mã (trình duyệt của khách) mới đọc/gửi được
  const CHAT_ID = /^[A-Za-z0-9_-]{20,40}$/
  const chatView = (c) => ({ id: c._id, status: c.status, name: c.name, messages: (c.messages || []).map(({ from, text, at }) => ({ from, text, at })), unread: c.unreadCustomer || 0 })
  const loadChat = async (req, res) => {
    const c = CHAT_ID.test(req.params.id) && await db.getChat(req.params.id)
    if (!c) { res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện' }); return null }
    return c
  }
  api.post('/public/chats', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Bạn đã mở quá nhiều cuộc trò chuyện, thử lại sau' } }), async (req, res) => {
    const b = req.body || {}
    const s = auth.session(req)
    const u = s && await db.getUser(s.username)
    const name = clip(b.name, 80) || u?.name || ''
    const phone = vnPhone(b.phone) || vnPhone(u?.phone) || vnPhone(u?._id) || ''
    if (!name && !u) return res.status(400).json({ error: 'Vui lòng cho shop biết tên của bạn' })
    if (!phone) return res.status(400).json({ error: 'Vui lòng nhập số điện thoại để shop liên hệ lại' })
    // Kèm đoạn đã trò chuyện với bot để nhân viên nắm ngay khách hỏi gì
    const history = (Array.isArray(b.history) ? b.history.slice(-20) : [])
      .filter((m) => (m?.from === 'me' || m?.from === 'bot') && m.text)
      .map((m) => ({ from: m.from, text: clip(m.text, 500), at: new Date().toISOString() }))
    const id = crypto.randomBytes(16).toString('base64url')
    const reason = clip(b.reason, 200)
    await db.createChat({
      _id: id, name: name || u?._id, phone, user: u?._id || null, status: 'waiting', reason, unreadShop: 1, unreadCustomer: 0,
      messages: [...history, { from: 'system', text: 'Khách yêu cầu gặp nhân viên' + (reason ? `: ${reason}` : ''), at: new Date().toISOString() }],
    })
    broadcast('admin', 'chats')
    res.status(201).json(chatView(await db.getChat(id)))
  })
  api.get('/public/chats/:id', async (req, res) => {
    const c = await loadChat(req, res)
    if (!c) return
    if (req.query.read && c.unreadCustomer) await db.updateChat(c._id, { unreadCustomer: 0 })
    res.set('Cache-Control', 'no-store').json(chatView(c))
  })
  api.get('/public/chats/:id/events', async (req, res) => {
    if (!(await loadChat(req, res))) return
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    res.write('retry: 3000\n\n')
    if (!chatStreams.has(req.params.id)) chatStreams.set(req.params.id, new Set())
    chatStreams.get(req.params.id).add(res)
    req.on('close', () => {
      const set = chatStreams.get(req.params.id)
      set?.delete(res)
      if (set && !set.size) chatStreams.delete(req.params.id)
    })
  })
  api.post('/public/chats/:id/messages', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Bạn gửi hơi nhanh, đợi chút nhé' } }), async (req, res) => {
    const c = await loadChat(req, res)
    if (!c) return
    const text = clip(req.body?.text, 1000)
    if (!text) return res.status(400).json({ error: 'Tin nhắn trống' })
    // Khách nhắn lại sau khi đã kết thúc → mở lại, chờ nhân viên
    const set = c.status === 'closed' ? { status: 'waiting' } : {}
    const next = await db.addChatMessage(c._id, { from: 'me', text }, set, { unreadShop: 1 })
    broadcast('admin', 'chats')
    pushChat(c._id)
    res.json(chatView(next))
  })

  // ---------- Webhook SePay: báo có tiền vào tài khoản ngân hàng ----------
  // Cấu hình ở SePay: URL https://tenmien.com/api/webhook/sepay, kiểu chứng thực "API Key" = SEPAY_API_KEY
  api.post('/webhook/sepay', async (req, res) => {
    const key = env.SEPAY_API_KEY
    if (!key) return res.status(503).json({ success: false, error: 'Chưa cấu hình SEPAY_API_KEY' })
    const given = String(req.headers.authorization || '').replace(/^Apikey\s+/i, '')
    if (!safeEq(given, key)) return res.status(401).json({ success: false, error: 'Sai API key' })
    const b = req.body || {}
    if (b.id == null) return res.status(400).json({ success: false, error: 'Thiếu id giao dịch' })
    // Luôn trả 200 cho giao dịch hợp lệ (kể cả không khớp đơn) để SePay không gửi lại
    if (b.transferType !== 'in') return res.json({ success: true, ignored: 'out' })
    const amount = Math.round(Number(b.transferAmount) || 0)
    const content = clip(`${b.code || ''} ${b.content || ''}`, 500)
    const shop = { ...DEFAULT_SHOP, ...(await db.getKv('shop')) }
    if (shop.bankAccount && b.accountNumber && String(b.accountNumber) !== shop.bankAccount) return res.json({ success: true, ignored: 'account' })
    const payId = `sepay:${b.id}`
    const orderId = (content.match(ORDER_CODE) || [])[0]?.toUpperCase() || null
    const fresh = await db.addPayment({ _id: payId, amount, content, gateway: clip(b.gateway, 40), ref: clip(b.referenceCode, 60), orderId: null })
    if (!fresh) return res.json({ success: true, duplicate: true })
    const o = orderId && await db.getOrder(orderId)
    if (!o || amount <= 0) {
      broadcast('admin', 'payments')
      return res.json({ success: true, matched: false })
    }
    if (!(await db.claimPayment(payId, o.id))) return res.json({ success: true, duplicate: true })
    const next = applyPayment(o, amount, payId)
    await db.saveOrder(next)
    broadcast('admin', 'orders')
    broadcast('admin', 'payments')
    res.json({ success: true, matched: true, id: o.id, status: next.status })
  })

  // ---------- Webhook hãng vận chuyển ----------
  api.post('/webhook/:carrier', async (req, res) => {
    const expected = env.WEBHOOK_SECRET
    if (!expected) return res.status(503).json({ error: 'Webhook chưa được bật (thiếu WEBHOOK_SECRET)' })
    const given = String(req.headers['x-webhook-secret'] || req.query.secret || '')
    const a = crypto.createHash('sha256').update(given).digest()
    const e = crypto.createHash('sha256').update(expected).digest()
    if (!crypto.timingSafeEqual(a, e)) return res.status(401).json({ error: 'Sai secret' })
    if (!CARRIERS.has(req.params.carrier)) return res.status(404).json({ error: 'Hãng không hỗ trợ' })
    const m = mapWebhook(req.body || {})
    const o = m.trackingId && await db.orderByTracking(String(m.trackingId))
    if (!o) return res.status(404).json({ error: 'Không thấy mã vận đơn' })
    const next = { ...o, status: m.status, statusAt: new Date().toISOString() }
    if (m.status === 'Hoàn thành' && !next.deliveredAt) next.deliveredAt = vnToday()
    await db.saveOrder(next)
    broadcast('admin', 'orders')
    res.json({ ok: true, id: o.id, status: next.status })
  })

  // ---------- Admin ----------
  const admin = express.Router()
  admin.use(auth.requireAdmin)
  admin.get('/events', openStream('admin'))
  admin.get('/state', async (req, res) => res.json({ ...(await db.allKv()), orders: await db.listOrders() }))
  admin.put('/state/:key', async (req, res) => {
    if (!KV_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Khóa không hợp lệ' })
    if (req.body === undefined || !('value' in req.body)) return res.status(400).json({ error: 'Thiếu value' })
    await db.setKv(req.params.key, req.body.value)
    if (['products', 'rates', 'pricing', 'shop'].includes(req.params.key)) broadcast('public', 'catalog')
    res.json({ ok: true })
  })
  admin.get('/orders', async (req, res) => res.json(await db.listOrders()))
  admin.get('/payments', async (req, res) => res.json(await db.listPayments()))

  // Tải ảnh mẫu lên (trình duyệt đã nén sẵn): chỉ nhận JPEG/PNG/WebP thật (kiểm tra cả chữ ký file), tối đa 3MB
  const IMG_SIG = { 'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8, 'image/png': (b) => b.subarray(0, 4).toString('hex') === '89504e47', 'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' }
  admin.post('/images', async (req, res) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(String(req.body?.data || ''))
    if (!m) return res.status(400).json({ error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP' })
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Ảnh quá lớn (tối đa 3MB)' })
    if (!IMG_SIG[m[1]](buf)) return res.status(400).json({ error: 'Tệp không phải ảnh hợp lệ' })
    const id = crypto.randomBytes(12).toString('hex')
    await db.saveImage({ _id: id, type: m[1], size: buf.length, data: buf })
    res.status(201).json({ url: `/api/img/${id}` })
  })

  // Hộp tin nhắn của shop
  admin.get('/chats', async (req, res) => {
    res.json((await db.listChats()).map((c) => ({
      id: c._id, name: c.name, phone: c.phone, user: c.user, status: c.status, reason: c.reason, unread: c.unreadShop || 0,
      last: c.messages?.[0] ? { from: c.messages[0].from, text: c.messages[0].text, at: c.messages[0].at } : null, updatedAt: c.updatedAt, createdAt: c.createdAt,
    })))
  })
  admin.get('/chats/:id', async (req, res) => {
    const c = await loadChat(req, res)
    if (!c) return
    if (c.unreadShop) { await db.updateChat(c._id, { unreadShop: 0 }); broadcast('admin', 'chats') }
    res.json({ ...chatView(c), phone: c.phone, user: c.user, reason: c.reason, createdAt: c.createdAt })
  })
  admin.post('/chats/:id/messages', async (req, res) => {
    const c = await loadChat(req, res)
    if (!c) return
    const text = clip(req.body?.text, 2000)
    if (!text) return res.status(400).json({ error: 'Tin nhắn trống' })
    const next = await db.addChatMessage(c._id, { from: 'shop', text, by: req.user.username }, { status: 'open', unreadShop: 0 }, { unreadCustomer: 1 })
    pushChat(c._id)
    broadcast('admin', 'chats')
    res.json({ ...chatView(next), phone: next.phone, user: next.user, reason: next.reason, createdAt: next.createdAt })
  })
  admin.post('/chats/:id/close', async (req, res) => {
    const c = await loadChat(req, res)
    if (!c) return
    const next = await db.addChatMessage(c._id, { from: 'system', text: 'Nhân viên đã kết thúc cuộc trò chuyện. Bạn cứ nhắn tiếp nếu cần hỗ trợ thêm nhé!' }, { status: 'closed', unreadShop: 0 })
    pushChat(c._id)
    broadcast('admin', 'chats')
    res.json({ ...chatView(next), phone: next.phone, user: next.user, reason: next.reason, createdAt: next.createdAt })
  })
  // Khách ghi sai nội dung chuyển khoản: shop gán tay giao dịch vào đơn
  admin.post('/payments/:id/assign', async (req, res) => {
    const p = await db.getPayment(req.params.id)
    if (!p) return res.status(404).json({ error: 'Không thấy giao dịch' })
    if (p.orderId) return res.status(409).json({ error: `Giao dịch đã gán vào đơn ${p.orderId}` })
    const o = await db.getOrder(clip(req.body?.orderId, 20).toUpperCase())
    if (!o) return res.status(404).json({ error: 'Không thấy đơn hàng' })
    if (!(await db.claimPayment(p._id, o.id))) return res.status(409).json({ error: 'Giao dịch vừa được gán vào đơn khác' })
    const next = applyPayment(o, p.amount, p._id)
    await db.saveOrder(next)
    broadcast('admin', 'orders')
    broadcast('admin', 'payments')
    res.json({ ok: true, id: o.id, status: next.status })
  })
  admin.put('/orders/:id', async (req, res) => {
    const o = req.body
    if (!o || o.id !== req.params.id || !o.customer || !Array.isArray(o.items)) return res.status(400).json({ error: 'Đơn không hợp lệ' })
    if (!o.trackCode) o.trackCode = newTrackCode()
    await db.saveOrder(o)
    broadcast('admin', 'orders')
    res.json({ ok: true })
  })

  // Lưu mẫu 1 chạm từ bookmarklet (trang /clip gọi sau khi quản trị viên đã đăng nhập)
  admin.post('/clip', async (req, res) => {
    const b = req.body || {}
    const url = httpsUrl(b.url)
    let host = ''
    try { host = new URL(url).hostname } catch { /* url rỗng */ }
    if (!url || !SOURCE_HOST.test(host)) return res.status(400).json({ error: 'Chỉ hỗ trợ link Taobao/1688/Tmall/Pinduoduo' })
    const name = clip(b.name, 200)
    if (!name) return res.status(400).json({ error: 'Không đọc được tên sản phẩm' })
    const priceCny = Math.max(0, Number(b.priceCny) || 0)
    const images = (Array.isArray(b.images) ? b.images : []).map(httpsUrl).filter(Boolean).slice(0, 12)
    const products = (await db.getKv('products')) || []
    const iid = itemId(url)
    const dup = products.find((p) => p.sourceUrl && (p.sourceUrl === url || (iid && itemId(p.sourceUrl) === iid)))
    if (dup) return res.json({ ok: true, duplicate: true, id: dup.id, name: dup.name })

    const cfg = normalizeCfg(await db.getKv('pricing'))
    const rate = rateOn((await db.getKv('rates')) || [], vnToday())
    const final = Math.ceil(priceBreakdown({ priceCny, weightKg: 0 }, rate, cfg).final / 1000) * 1000
    const p = {
      id: crypto.randomBytes(4).toString('hex'), name, image: images[0] || '', images, sourceUrl: url, priceCny, domesticShipCny: 0, weightKg: 0,
      sizes: ['Free size'], colors: ['Mặc định'], tags: ['mới lưu'], category: 'Chưa phân loại', priceVnd: final, stock: 0, status: 'TQ', createdAt: vnToday(),
    }
    await db.setKv('products', [p, ...products])
    broadcast('admin', 'state')
    broadcast('public', 'catalog')
    res.status(201).json({ ok: true, id: p.id, name: p.name, priceCny, priceVnd: final, images: images.length })
  })
  admin.delete('/orders/:id', async (req, res) => { await db.deleteOrder(req.params.id); broadcast('admin', 'orders'); res.json({ ok: true }) })
  api.use('/admin', admin)

  api.use((req, res) => res.status(404).json({ error: 'Không tìm thấy' }))
  app.use('/api', api)

  // ---------- Giao diện (bản build) ----------
  if (fs.existsSync(distDir)) {
    app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' }))
    // index.html / sw.js / manifest không được cache lâu: deploy xong khách vào là thấy giao diện mới ngay
    const noCache = (res, file) => { if (/\.(html|webmanifest)$|[\\/]sw\.js$/.test(file)) res.setHeader('Cache-Control', 'no-cache') }
    app.use(express.static(distDir, { maxAge: '1h', setHeaders: noCache }))
    app.get(/^\/(?!api\/).*/, (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(distDir, 'index.html')))
  }

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn' })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' })
    console.error(err)
    res.status(500).json({ error: 'Lỗi máy chủ' })
  })

  return { app, db }
}
