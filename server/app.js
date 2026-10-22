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
import {
  withCosts, normalizeCfg, DEFAULT_PRICING, SEED_PRODUCTS, priceBreakdown, rateOn, orderTotals, trackStep, TRACK_STEPS, STATUS_LABEL, normStatus,
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
const PUBLIC_FIELDS = ['id', 'name', 'image', 'sizes', 'colors', 'tags', 'category', 'priceVnd', 'stock', 'status', 'createdAt']

// Kênh đẩy tin tức thời (Server-Sent Events): 'admin' và 'public'
const channels = { admin: new Set(), public: new Set() }
const broadcast = (ch, event) => { for (const res of channels[ch]) res.write(`event: ${event}\ndata: ${Date.now()}\n\n`) }
const heartbeat = setInterval(() => { for (const set of Object.values(channels)) for (const res of set) res.write(': ping\n\n') }, 25000)
heartbeat.unref()
const openStream = (ch) => (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  res.write('retry: 3000\n\n')
  channels[ch].add(res)
  req.on('close', () => channels[ch].delete(res))
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n)
const vnToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
const newId = () => 'DH' + crypto.randomBytes(4).toString('hex').toUpperCase()

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
  const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Đăng ký quá nhiều lần, thử lại sau' } })
  const pub = (u) => ({ username: u._id, name: u.name, phone: u.phone || '', role: u.role })

  api.post('/auth/login', loginLimit, async (req, res) => {
    const username = clip(req.body?.username, 40).toLowerCase()
    const u = username && await db.getUser(username)
    if (!u || !verifyPassword(req.body?.password, u.passHash)) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' })
    auth.setCookie(req, res, { username: u._id, role: u.role })
    res.json({ ok: true, user: pub(u) })
  })
  api.post('/auth/register', registerLimit, async (req, res) => {
    const b = req.body || {}
    const username = clip(b.username, 40).toLowerCase()
    const name = clip(b.name, 80)
    const phone = clip(b.phone, 20).replace(/[\s.-]/g, '')
    const pw = String(b.password ?? '')
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) return res.status(400).json({ error: 'Tên đăng nhập 3-30 ký tự: chữ thường không dấu, số, _ hoặc .' })
    if (pw.length < 6 || pw.length > 100) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' })
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập họ tên' })
    if (phone && !/^(\+?84|0)\d{8,10}$/.test(phone)) return res.status(400).json({ error: 'Số điện thoại không hợp lệ' })
    const user = { username, name, phone, role: 'customer', passHash: hashPassword(pw) }
    try {
      await db.createUser(user)
    } catch (e) {
      if (e?.code === 11000) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' })
      throw e
    }
    auth.setCookie(req, res, user)
    res.status(201).json({ ok: true, user: pub({ _id: username, ...user }) })
  })
  api.post('/auth/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }) })
  api.get('/auth/me', async (req, res) => {
    const s = auth.session(req)
    const u = s && await db.getUser(s.username)
    res.json({ user: u ? pub(u) : null })
  })

  // Khách đã đăng nhập xem đơn của mình
  api.get('/me/orders', auth.requireUser, async (req, res) => {
    res.json((await db.ordersByOwner(req.user.username)).map((o) => ({
      id: o.id, trackCode: o.trackCode, createdAt: o.createdAt, status: o.status,
      items: (o.items || []).map(({ name, size, color, qty, price }) => ({ name, size, color, qty, price })),
    })))
  })

  // ---------- Khách: xem mẫu & đặt hàng ----------
  api.get('/public/events', openStream('public'))
  api.get('/public/catalog', async (req, res) => {
    const products = ((await db.getKv('products')) || []).map((p) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, p[k]])))
    res.set('Cache-Control', 'public, max-age=30').json({ products })
  })

  // Chuyển tiếp ảnh mẫu ở domain ngoài (cùng origin) để trình duyệt đọc được pixel khi so khớp ảnh
  api.get('/public/img/:id', async (req, res) => {
    const p = ((await db.getKv('products')) || []).find((x) => x.id === req.params.id)
    const url = httpsUrl(p?.image)
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
      const size = p.sizes?.includes(i.size) ? i.size : p.sizes?.[0] || ''
      const color = p.colors?.includes(i.color) ? i.color : p.colors?.[0] || ''
      items.push({ productId: p.id, name: p.name, size, color, qty, price: p.priceVnd, cost: 0 })
    }
    const order = withCosts({
      id: newId(), trackCode: newTrackCode(), owner: auth.session(req)?.username, createdAt: vnToday(), statusAt: new Date().toISOString(), status: 'Mới', deposit: 0, source: 'shop', customer, items,
    }, products, (await db.getKv('rates')) || [], normalizeCfg(await db.getKv('pricing')))
    await db.saveOrder(order)
    broadcast('admin', 'orders')
    res.status(201).json({ ok: true, id: order.id, trackCode: order.trackCode })
  })

  // Trang theo dõi đơn của khách: chỉ trả dữ liệu rút gọn, tra theo mã ngẫu nhiên khó đoán
  api.get('/public/track/:code', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const code = clip(req.params.code, 20).toUpperCase()
    const o = code ? await db.orderByTrackCode(code) : undefined
    if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' })
    const shop = (await db.getKv('shop')) || {}
    const t = orderTotals(o)
    res.set('Cache-Control', 'no-store').json({
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
    if (['products', 'rates', 'pricing'].includes(req.params.key)) broadcast('public', 'catalog')
    res.json({ ok: true })
  })
  admin.get('/orders', async (req, res) => res.json(await db.listOrders()))
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
    app.use(express.static(distDir, { maxAge: '1h' }))
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')))
  }

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn' })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' })
    console.error(err)
    res.status(500).json({ error: 'Lỗi máy chủ' })
  })

  return { app, db }
}
