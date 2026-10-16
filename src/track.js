// Nhận diện mã vận đơn Trung Quốc trong đoạn văn bản được copy/dán
const PATTERNS = [
  { carrier: 'YTO (Viên Thông)', re: /\b(YT\d{12,16})\b/i },
  { carrier: 'SF Express', re: /\b(SF\d{12,15})\b/i },
  { carrier: 'JD Logistics', re: /\b(JD[A-Z]{0,2}\d{10,16})\b/i },
  { carrier: 'J&T Express TQ', re: /\b(JT\d{12,15})\b/i },
  { carrier: 'China Post (EMS)', re: /\b([A-Z]{2}\d{9}CN)\b/i },
]
// Hãng chỉ có số thuần → cần từ khoá hãng đi kèm
const KEYWORDS = [
  { carrier: 'ZTO (Trung Thông)', kw: /(zto|trung thông|中通)/i },
  { carrier: 'STO (Thân Thông)', kw: /(sto\b|thân thông|申通)/i },
  { carrier: 'YunDa (Vận Đạt)', kw: /(yunda|韵达|vận đạt)/i },
  { carrier: 'Best Express', kw: /(best express|百世|bai shi)/i },
  { carrier: 'JT Express', kw: /(j&t|jt express|极兔)/i },
  { carrier: 'YTO (Viên Thông)', kw: /(yto|圆通|viên thông)/i },
  { carrier: 'Cainiao', kw: /(cainiao|菜鸟)/i },
]

// Trả về { code, carrier } hoặc null
export function detectCnTracking(text) {
  const t = String(text || '').slice(0, 2000)
  if (!t.trim()) return null
  for (const p of PATTERNS) {
    const m = t.match(p.re)
    if (m) return { code: m[1].toUpperCase(), carrier: p.carrier }
  }
  const nums = [...t.matchAll(/(?:^|[^\d.])(\d{10,20})(?![\d.])/g)].map((m) => m[1])
  if (nums.length) {
    const k = KEYWORDS.find((x) => x.kw.test(t))
    if (k) return { code: nums[0], carrier: k.carrier }
  }
  return null
}

const WAITING = ['Mới', 'Đã mua', 'Đã xác nhận']
// Đơn gần nhất đang chờ gán mã vận đơn TQ
export function nearestWaitingOrder(orders) {
  return orders
    .filter((o) => WAITING.includes(o.status) && !o.cnTracking && o.status !== 'Đã hủy')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
}
