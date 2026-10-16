import crypto from 'node:crypto'

const COOKIE = 'tb_session'
const TTL_MS = 7 * 24 * 3600 * 1000

const b64 = (b) => Buffer.from(b).toString('base64url')

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  return `${salt.toString('hex')}:${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const a = crypto.scryptSync(String(pw ?? ''), Buffer.from(salt, 'hex'), 64)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function createAuth({ secret }) {
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url')

  const issue = (user) => {
    const payload = b64(JSON.stringify({ u: user.username, r: user.role, exp: Date.now() + TTL_MS }))
    return `${payload}.${sign(payload)}`
  }

  const verify = (token) => {
    if (!token || typeof token !== 'string') return null
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const expected = sign(payload)
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    try {
      const d = JSON.parse(Buffer.from(payload, 'base64url').toString())
      return d.exp > Date.now() && d.u ? { username: d.u, role: d.r } : null
    } catch {
      return null
    }
  }

  const readCookie = (req) => {
    const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='))
    return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : ''
  }

  const session = (req) => verify(readCookie(req))
  const deny = (res, code, msg) => res.status(code).json({ error: msg })

  return {
    session,
    setCookie: (req, res, user) => {
      const secure = req.secure ? '; Secure' : ''
      res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(issue(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}${secure}`)
    },
    clearCookie: (res) => {
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
    },
    requireUser: (req, res, next) => {
      const s = session(req)
      if (!s) return deny(res, 401, 'Vui lòng đăng nhập')
      req.user = s
      next()
    },
    requireAdmin: (req, res, next) => {
      const s = session(req)
      if (!s) return deny(res, 401, 'Chưa đăng nhập')
      if (s.role !== 'admin') return deny(res, 403, 'Tài khoản không có quyền quản trị')
      req.user = s
      next()
    },
  }
}
