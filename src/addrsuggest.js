// Gợi ý địa chỉ khi khách gõ địa chỉ chi tiết: tìm tỉnh/huyện/xã khớp trong cả dữ liệu mới và cũ.
import { fold, smartParse } from './smartpaste'

const MARK_BEFORE = /(?:thanh pho|tinh|quan|huyen|thi xa|thi tran|phuong|xa|tx|tt|tp|[pqxh]\.)\s*$/
const PREFIX = /^(thanh pho|tinh|quan|huyen|thi xa|thi tran|phuong|xa)\s+/
const isAlnum = (c) => c !== undefined && /[a-z0-9]/.test(c)

// Chỉ mục phẳng của tất cả phường/xã, dựng một lần cho mỗi bộ dữ liệu
const indexCache = new WeakMap()
function wardIndex(rows, mode) {
  if (!rows) return []
  if (!indexCache.has(rows)) {
    const list = []
    for (const r of rows) {
      if (mode === 'new') for (const w of r[1]) list.push({ mode, province: r[0], district: '', ward: w, key: fold(w).replace(PREFIX, '').trim() })
      else for (const d of r[1]) for (const w of d[1]) list.push({ mode, province: r[0], district: d[0], ward: w, key: fold(w).replace(PREFIX, '').trim() })
    }
    indexCache.set(rows, list.filter((x) => x.key.length >= 4 && !/^\d+$/.test(x.key)))
  }
  return indexCache.get(rows)
}

function findWord(N, word) {
  let from = 0
  for (;;) {
    const i = N.indexOf(word, from)
    if (i < 0) return null
    from = i + 1
    if (!isAlnum(N[i - 1]) && !isAlnum(N[i + word.length])) return [i, i + word.length]
  }
}

const tidy = (s) => s.replace(/\s+/g, ' ').replace(/(^[\s,;:-]+)|([\s,;:-]+$)/g, '').replace(/\s*,(\s*,)+/g, ',')

export function suggestAddress(text, oldRows, newRows, limit = 5) {
  const raw = String(text || '').normalize('NFC').trim()
  if (raw.length < 3 || !oldRows || !newRows) return []
  const out = []
  const seen = new Set()
  const push = (c) => {
    const k = [c.mode, c.province, c.district, c.ward].join('|')
    if (!seen.has(k)) { seen.add(k); out.push(c) }
  }

  // Có ghi đủ tỉnh + xã (hoặc quận/huyện): khớp chuẩn xác theo từng hệ địa chỉ
  for (const mode of ['new', 'old']) {
    const r = smartParse(raw, mode === 'old' ? oldRows : [], mode === 'new' ? newRows : [])
    if (!r.province || r.mode !== mode) continue
    const complete = r.ward && (mode === 'new' || r.district)
    push({ ...r, street: r.street, score: complete ? 100 : r.ward ? 60 : 40 })
  }

  // Chỉ gõ tên phường/xã: tìm trong toàn quốc, ưu tiên tên dài và có chữ Phường/Xã đứng trước
  const N = fold(raw)
  const found = []
  for (const row of [...wardIndex(newRows, 'new'), ...wardIndex(oldRows, 'old')]) {
    const hit = findWord(N, row.key)
    if (!hit || seen.has([row.mode, row.province, row.district, row.ward].join('|'))) continue
    const marked = MARK_BEFORE.test(N.slice(0, hit[0]))
    const street = tidy(raw.slice(0, hit[0]).replace(/(?:phường|phuong|xã|xa|thị trấn|thi tran|p\.|x\.)\s*$/i, '') + ' ' + raw.slice(hit[1]))
    found.push({ ...row, street, score: 20 + row.key.length + (marked ? 15 : 0) })
  }
  found.sort((a, b) => b.score - a.score)
  for (const f of found.slice(0, limit)) push(f)

  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

export const suggestLabel = (c) => [c.ward, c.district, c.province].filter(Boolean).join(', ')
