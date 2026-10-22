import { useEffect, useMemo, useRef, useState } from 'react'
import { suggestAddress, suggestLabel } from './addrsuggest'

export const norm = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim()

const cache = {}
function load(kind) {
  cache[kind] ||= fetch(`${import.meta.env.BASE_URL}data/vn-${kind}.json`).then((r) => {
    if (!r.ok) throw new Error('Không tải được dữ liệu địa chỉ')
    return r.json()
  })
  return cache[kind]
}

// old: [[tỉnh, [[huyện, [xã…]]…]]…]   new: [[tỉnh, [xã…]]…]
export function useVnData(mode) {
  const [data, setData] = useState({})
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    load(mode).then((d) => live && setData((x) => ({ ...x, [mode]: d })), (e) => live && setErr(e.message))
    return () => { live = false }
  }, [mode])
  return { rows: data[mode], err }
}

function Combo({ label, options, value, onChange, disabled, placeholder, required }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const list = useMemo(() => {
    const n = norm(q)
    const r = n ? options.filter((o) => norm(o).includes(n)) : options
    return r.slice(0, 60)
  }, [q, options])

  const pick = (o) => {
    onChange(o)
    setQ('')
    setOpen(false)
  }
  return (
    <label className="combo" ref={ref}>
      {label}{required && ' *'}
      <input
        disabled={disabled}
        placeholder={placeholder}
        value={open ? q : value}
        onFocus={() => { setQ(''); setOpen(true) }}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && open && list[0]) { e.preventDefault(); pick(list[0]) }
          if (e.key === 'Escape') setOpen(false)
        }}
        autoComplete="off"
      />
      {open && !disabled && (
        <ul className="combo-list">
          {list.map((o) => <li key={o} className={o === value ? 'sel' : ''} onMouseDown={(e) => { e.preventDefault(); pick(o) }}>{o}</li>)}
          {!list.length && <li className="none">Không thấy kết quả</li>}
        </ul>
      )}
    </label>
  )
}

export const EMPTY_ADDR = { mode: 'new', province: '', district: '', ward: '', street: '' }

export function addrError(a) {
  if (!a.province) return 'Vui lòng chọn Tỉnh/Thành phố'
  if (a.mode === 'old' && !a.district) return 'Vui lòng chọn Quận/Huyện'
  if (!a.ward) return 'Vui lòng chọn Phường/Xã'
  if (!a.street.trim()) return 'Vui lòng nhập số nhà, tên đường'
  return ''
}

export function AddressPicker({ value, onChange }) {
  const { mode } = value
  const { rows, err } = useVnData(mode)
  const provinces = useMemo(() => (rows || []).map((r) => r[0]), [rows])
  const prov = (rows || []).find((r) => r[0] === value.province)
  const districts = useMemo(() => (mode === 'old' && prov ? prov[1].map((d) => d[0]) : []), [mode, prov])
  const wards = useMemo(() => {
    if (!prov) return []
    if (mode === 'new') return prov[1]
    return prov[1].find((d) => d[0] === value.district)?.[1] || []
  }, [mode, prov, value.district])

  const set = (patch) => onChange({ ...value, ...patch })
  const setMode = (m) => {
    onChange({ ...EMPTY_ADDR, mode: m, street: value.street })
  }

  const oldD = useVnData('old').rows
  const newD = useVnData('new').rows
  const suggestions = useMemo(() => {
    if (!oldD || !newD || value.street.trim().length < 3) return []
    return suggestAddress(value.street, oldD, newD).filter((c) => !(
      c.mode === mode && c.province === value.province && (c.district || '') === value.district && (c.ward || '') === value.ward
    ))
  }, [oldD, newD, value, mode])

  const preview = [value.street, value.ward, value.district, value.province].filter(Boolean).join(', ')

  return (
    <div className="addr">
      <div className="seg">
        <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>Địa chỉ mới <small>34 tỉnh/thành · bỏ cấp huyện</small></button>
        <button type="button" className={mode === 'old' ? 'on' : ''} onClick={() => setMode('old')}>Địa chỉ cũ <small>63 tỉnh/thành · tỉnh–huyện–xã</small></button>
      </div>
      {err && <small className="err">{err}</small>}
      <div className="grid2" style={{ gap: 12 }}>
        <Combo label="Tỉnh/Thành phố" required options={provinces} value={value.province} placeholder={rows ? 'Gõ để tìm…' : 'Đang tải…'} onChange={(v) => set({ province: v, district: '', ward: '' })} />
        {mode === 'old' && (
          <Combo label="Quận/Huyện" required options={districts} value={value.district} disabled={!value.province} placeholder="Chọn tỉnh trước" onChange={(v) => set({ district: v, ward: '' })} />
        )}
        <Combo label="Phường/Xã" required options={wards} value={value.ward} disabled={!value.province || (mode === 'old' && !value.district)} placeholder={mode === 'old' ? 'Chọn quận/huyện trước' : 'Chọn tỉnh trước'} onChange={(v) => set({ ward: v })} />
        <label>Số nhà, tên đường *<input value={value.street} onChange={(e) => set({ street: e.target.value })} placeholder="VD: 12 Lê Lợi, Bến Thành, Quận 1" /></label>
      </div>
      {suggestions.length > 0 && (
        <div className="addr-sug">
          <small className="muted">Gợi ý theo địa chỉ bạn nhập:</small>
          {suggestions.map((c, i) => (
            <button type="button" key={i} className="addr-chip" onClick={() => onChange({ mode: c.mode, province: c.province, district: c.district || '', ward: c.ward || '', street: c.street || value.street })}>
              <span className={`tag ${c.mode}`}>{c.mode === 'new' ? 'Mới' : 'Cũ'}</span> {suggestLabel(c)}
            </button>
          ))}
        </div>
      )}
      {preview && <p className="addr-preview">📍 {preview}</p>}
    </div>
  )
}
