import crypto from 'node:crypto'

const COOKIE = 'tb_session'
const TTL_MS = 7 * 24 * 3600 * 1000

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest()
const b64 = (b) => Buffer.from(b).toString('base64url')

export function createAuth({ password, secret }) {
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url')

  const issue = () => {
    const payload = b64(JSON.stringify({ exp: Date.now() + TTL_MS }))
    return `${payload}.${sign(payload)}`
  }

  const verify = (token) => {
    if (!token || typeof token !== 'string') return false
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return false
    const expected = sign(payload)
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now()
    } catch {
      return false
    }
  }

  const readCookie = (req) => {
    const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='))
    return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : ''
  }

  return {
    checkPassword: (input) => crypto.timingSafeEqual(sha(input ?? ''), sha(password)),
    isAuthed: (req) => verify(readCookie(req)),
    setCookie: (req, res) => {
      const secure = req.secure ? '; Secure' : ''
      res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(issue())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}${secure}`)
    },
    clearCookie: (res) => {
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
    },
    require: (req, res, next) => (verify(readCookie(req)) ? next() : res.status(401).json({ error: 'Chưa đăng nhập' })),
  }
}
