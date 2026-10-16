// Bóc tách "Tên, SĐT, số nhà, phường/xã, quận/huyện, tỉnh" từ một đoạn văn bản dán vào.
// Dữ liệu: old = [[tỉnh, [[huyện, [xã…]]…]]…]   new = [[tỉnh, [xã…]]…]

// Bỏ dấu nhưng giữ nguyên độ dài chuỗi để cắt/ghi đè đúng vị trí trên bản gốc
export function fold(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === 'đ' || c === 'Đ') { out += 'd'; continue }
    out += (c.normalize('NFD')[0] || c).toLowerCase()
  }
  return out
}

const ALIASES = {
  'ho chi minh': ['tp hcm', 'tphcm', 'hcm', 'sai gon', 'saigon', 'sg'],
  'ha noi': ['hn', 'hanoi'],
  'da nang': ['dn', 'danang'],
  'hai phong': ['hp'],
  'can tho': ['ct'],
  'thua thien hue': ['hue', 'tt hue'],
  'ba ria vung tau': ['brvt', 'vung tau', 'br vt'],
  'dak lak': ['daklak', 'dac lac'],
  'dak nong': ['daknong', 'dac nong'],
}

const PROV_MARK = ['thanh pho', 'tp', 'tinh']
const DIST_MARK = ['quan', 'q', 'huyen', 'h', 'thi xa', 'tx', 'thanh pho', 'tp']
const WARD_MARK = ['phuong', 'p', 'xa', 'x', 'thi tran', 'tt']
// Tiền tố đầy đủ cần dấu cách/chấm; tiền tố một chữ (p. q. x. h.) bắt buộc có dấu chấm
const markRe = /(?:^|[^a-z0-9])(thanh pho|tinh|quan|huyen|thi xa|thi tran|phuong|xa|tx|tt|tp)[\s.]+$|(?:^|[^a-z0-9])([pqxh])\.\s*$/d
const PREFIX = /^(thanh pho|tinh|quan|huyen|thi xa|thi tran|phuong|xa)\s+/

const isAlnum = (c) => c !== undefined && /[a-z0-9]/.test(c)
const core = (name) => fold(name).replace(PREFIX, '').trim()

function occurrences(N, word) {
  const res = []
  if (!word) return res
  let from = 0
  for (;;) {
    const i = N.indexOf(word, from)
    if (i < 0) break
    from = i + 1
    if (isAlnum(N[i - 1]) || isAlnum(N[i + word.length])) continue
    res.push([i, i + word.length])
  }
  return res
}

// 2 = có tiền tố đúng cấp, 1 = không có tiền tố, 0 = tiền tố của cấp khác (loại)
function scoreAt(N, start, marks) {
  const m = markRe.exec(N.slice(0, start))
  if (!m) return { score: 1, from: start }
  const g = m[1] ? 1 : 2
  if (!marks.includes(m[g])) return { score: 0 }
  return { score: 2, from: m.indices[g][0] }
}

// Chọn đơn vị tốt nhất trong `names`: đúng tiền tố > tên dài hơn > nằm sau trong chuỗi
function best(N, names, marks, aliases = false) {
  let top = null
  for (const name of names) {
    const c = core(name)
    const numeric = /^\d+$/.test(c)
    for (const k of [c, ...(aliases ? ALIASES[c] || [] : [])]) {
      for (const [s, e] of occurrences(N, k)) {
        const sc = scoreAt(N, s, marks)
        if (!sc.score) continue
        if (numeric && sc.score < 2) continue // "1", "12" chỉ hợp lệ khi có Quận/Phường đứng trước
        const cand = { name, score: sc.score, len: k.length, end: e, from: sc.from }
        if (!top || cand.score > top.score || (cand.score === top.score && (cand.len > top.len || (cand.len === top.len && cand.end > top.end)))) top = cand
      }
    }
  }
  return top
}

// Ghi đè đoạn đã nhận diện bằng dấu phẩy để các phần còn lại tách riêng
const blank = (s, a, b) => s.slice(0, a) + ',' + ' '.repeat(Math.max(0, b - a - 1)) + s.slice(b)

const NAME_STOP = /(?:^|\s)(đường|duong|phố|pho|ngõ|ngo|hẻm|hem|ngách|ngach|số|so|thôn|thon|xóm|xom|ấp|ap|tổ|to|khu|kdc|chung cư|chung cu|tòa|toa|lô|lo|nhà|nha|cổng|cong|kiệt|kiet|tầng|tang)(?=\s|$)/i
const LABEL = /(?:^|[\n,;])\s*(?:ho va ten|ho ten|ten khach|ten nguoi nhan|nguoi nhan|ten|khach|sdt|so dien thoai|dien thoai|dt|phone|tel|dia chi|dc|d\/c|address|add)\s*[:：-]\s*/g

function titleCase(s) {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())
}

export function smartParse(raw, oldRows, newRows) {
  let T = String(raw || '').normalize('NFC').replace(/\r/g, '\n')
  let N = fold(T)
  const out = { name: '', phone: '', mode: 'new', province: '', district: '', ward: '', street: '' }
  const cut = (hit) => { T = blank(T, hit.from, hit.end); N = blank(N, hit.from, hit.end) }

  // Nhãn kiểu "SĐT:", "Địa chỉ:"
  for (const m of [...N.matchAll(LABEL)]) {
    const s = m.index + (/^[\n,;]/.test(m[0]) ? 1 : 0)
    cut({ from: s, end: m.index + m[0].length })
  }

  // Số điện thoại (10 số bắt đầu bằng 0, hoặc +84/84 + 9 số)
  const pm = N.match(/(^|\D)((?:\+?84|0)[\s.-]?(?:\d[\s.-]?){8}\d)(?!\d)/)
  if (pm) {
    const from = pm.index + pm[1].length
    let d = pm[2].replace(/\D/g, '')
    if (d.startsWith('84')) d = '0' + d.slice(2)
    if (d.length === 10) out.phone = d
    cut({ from, end: from + pm[2].length })
  }

  // "p.12" / "q1" → "phuong 12" / "quan 1" (độ dài đổi nên làm đồng thời trên T và N)
  let adj = 0
  for (const m of [...N.matchAll(/(^|[^a-z0-9])([pq])\.?\s*(\d{1,2})(?![a-z0-9])/g)]) {
    const s = m.index + m[1].length + adj
    const word = m[2] === 'p' ? 'Phường ' : 'Quận '
    const len = m[0].length - m[1].length
    T = T.slice(0, s) + word + m[3] + T.slice(s + len)
    N = N.slice(0, s) + fold(word) + m[3] + N.slice(s + len)
    adj += word.length + m[3].length - len
  }

  const oldRow = (n) => oldRows.find((r) => r[0] === n)
  const newRow = (n) => newRows.find((r) => r[0] === n)
  const oldProv = oldRows?.length ? best(N, oldRows.map((r) => r[0]), PROV_MARK, true) : null
  const newProv = newRows?.length ? best(N, newRows.map((r) => r[0]), PROV_MARK, true) : null

  // 1) Địa chỉ cũ: tỉnh + quận/huyện (+ xã)
  let done = false
  if (oldProv) {
    const prov = oldRow(oldProv.name)
    const wipe = { from: oldProv.from, end: oldProv.end }
    cut(wipe) // bỏ phần tỉnh khỏi chuỗi để không nhận nhầm quận/huyện trùng tên tỉnh
    const dist = best(N, prov[1].map((d) => d[0]), DIST_MARK)
    if (dist) {
      const dd = prov[1].find((d) => d[0] === dist.name)
      const ward = best(N, dd[1], WARD_MARK)
      Object.assign(out, { mode: 'old', province: prov[0], district: dd[0], ward: ward?.name || '' })
      if (ward) cut(ward)
      cut(dist)
      done = true
    }
  }
  // 2) Địa chỉ mới: tỉnh + xã (không có cấp huyện)
  if (!done && newProv) {
    const prov = newRow(newProv.name)
    const ward = best(N, prov[1], WARD_MARK)
    if (ward) {
      Object.assign(out, { mode: 'new', province: prov[0], ward: ward.name })
      cut(ward)
      cut(newProv)
      done = true
    }
  }
  // 3) Chỉ có tỉnh cũ + xã: suy ra quận/huyện nếu xã là duy nhất trong tỉnh
  if (!done && oldProv) {
    const prov = oldRow(oldProv.name)
    const found = []
    for (const d of prov[1]) {
      const w = best(N, d[1], WARD_MARK)
      if (w) found.push({ d: d[0], w })
    }
    Object.assign(out, { mode: 'old', province: prov[0] })
    if (found.length === 1) {
      out.district = found[0].d
      out.ward = found[0].w.name
      cut(found[0].w)
    }
    done = true
  }
  // 4) Chỉ nhận ra tỉnh mới
  if (!done && newProv) {
    Object.assign(out, { mode: 'new', province: newRow(newProv.name)[0] })
    cut(newProv)
  }

  // Phần còn lại: tên + số nhà/tên đường
  const segs = T.split(/[,;\n]+/).map((s) => s.replace(/\s+/g, ' ').replace(/^[-:\s]+|[-:\s]+$/g, '')).filter(Boolean)
  let nameIdx = segs.findIndex((s) => !/\d/.test(s) && !NAME_STOP.test(s) && s.split(' ').length <= 7)
  if (nameIdx < 0 && segs.length) {
    const m = segs[0].match(/^(\D*?)\s+(\d.*)$/)
    if (m && m[1].split(' ').length >= 2 && !NAME_STOP.test(m[1])) {
      segs.splice(0, 1, m[1], m[2])
      nameIdx = 0
    }
  }
  if (nameIdx >= 0) out.name = titleCase(segs.splice(nameIdx, 1)[0])
  out.street = segs.join(', ')
  return out
}
