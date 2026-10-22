import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const svgCaptcha = createRequire(import.meta.url)('svg-captcha')
const TTL_MS = 5 * 60 * 1000

// Captcha chữ + số không cần lưu DB: đáp án băm HMAC nằm trong token đã ký; mỗi token chỉ dùng được một lần
export function createCaptcha({ secret }) {
  const sign = (s) => crypto.createHmac('sha256', secret).update('captcha:' + s).digest('base64url')
  const used = new Map() // nonce → hạn dùng, để chặn gửi lại cùng một token
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, exp] of used) if (exp < now) used.delete(k) }, 60 * 1000)
  sweep.unref()

  return {
    issue() {
      const c = svgCaptcha.create({ size: 5, ignoreChars: '0oO1lIi', noise: 3, color: true, width: 150, height: 50 })
      const nonce = crypto.randomBytes(9).toString('base64url')
      const exp = Date.now() + TTL_MS
      const payload = `${nonce}.${exp}.${sign(`${nonce}.${exp}.${c.text.toLowerCase()}`)}`
      return { token: `${payload}.${sign(payload)}`, svg: c.data }
    },
    // Trả '' nếu đúng, ngược lại là thông báo lỗi
    check(token, answer) {
      const [nonce, exp, h, sig] = String(token || '').split('.')
      if (!nonce || !exp || !h || !sig) return 'Vui lòng nhập mã xác thực'
      const payload = `${nonce}.${exp}.${h}`
      const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
      if (!eq(sig, sign(payload))) return 'Mã xác thực không hợp lệ'
      if (Number(exp) < Date.now()) return 'Mã xác thực đã hết hạn, vui lòng lấy mã mới'
      if (used.has(nonce)) return 'Mã xác thực đã được dùng, vui lòng lấy mã mới'
      used.set(nonce, Number(exp))
      const ans = String(answer || '').trim().toLowerCase().slice(0, 10)
      if (!eq(h, sign(`${nonce}.${exp}.${ans}`))) return 'Mã xác thực không đúng'
      return ''
    },
  }
}
