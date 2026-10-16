// Tạo payload VietQR (EMVCo, NAPAS 247) để quét bằng mọi app ngân hàng
const tlv = (id, val) => id + String(val.length).padStart(2, '0') + val

export function crc16(s) {
  let crc = 0xffff
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const ascii = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 25)

export function vietQrPayload({ bin, account, amount, memo }) {
  const acc = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', account)) + tlv('02', 'QRIBFTTA')
  let p = tlv('00', '01') + tlv('01', amount > 0 ? '12' : '11') + tlv('38', acc) + tlv('53', '704')
  if (amount > 0) p += tlv('54', String(Math.round(amount)))
  p += tlv('58', 'VN')
  if (memo) p += tlv('62', tlv('08', ascii(memo)))
  p += '6304'
  return p + crc16(p)
}

export async function vietQrDataUrl(opts) {
  const QR = await import('qrcode')
  return (QR.default || QR).toDataURL(vietQrPayload(opts), { margin: 1, width: 260, errorCorrectionLevel: 'M' })
}
