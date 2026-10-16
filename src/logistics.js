// Lớp adapter vận chuyển. Mỗi hãng khai báo URL + cách map payload.
// Gọi thật cần backend (giấu token, tránh CORS); ở chế độ mock sẽ giả lập phản hồi.
export const CARRIER_CONFIG = {
  GHN: { url: 'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create', webhook: '/api/webhook/ghn' },
  SPX: { url: 'https://api.spx.vn/v1/orders', webhook: '/api/webhook/spx' },
  'J&T': { url: 'https://api.jtexpress.vn/v1/orders', webhook: '/api/webhook/jt' },
  'Viettel Post': { url: 'https://partner.viettelpost.vn/v2/order/createOrder', webhook: '/api/webhook/viettelpost' },
}

// Payload chuẩn hóa, dùng chung cho mọi hãng
export function buildShipment(order, totals, pkg) {
  const c = order.customer
  return {
    reference: order.id,
    to_name: c.name,
    to_phone: c.phone,
    to_province: c.province,
    to_district: c.district,
    to_ward: c.ward,
    to_address: c.address,
    weight_gram: Math.round(pkg.weightKg * 1000),
    length: pkg.length,
    width: pkg.width,
    height: pkg.height,
    cod_amount: totals.cod,
    items: order.items.map((i) => ({ name: i.name, quantity: i.qty })),
  }
}

export async function createShipment(carrier, payload, { mock = true, token = '' } = {}) {
  if (mock) {
    await new Promise((r) => setTimeout(r, 500))
    const code = carrier.replace(/\W/g, '').toUpperCase() + Math.random().toString(36).slice(2, 9).toUpperCase()
    return { trackingId: code, waybillUrl: `https://example.com/waybill/${code}.pdf` }
  }
  const res = await fetch(CARRIER_CONFIG[carrier].url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Token: token },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`${carrier} API lỗi ${res.status}`)
  const d = await res.json()
  return { trackingId: d.tracking_id || d.order_code, waybillUrl: d.waybill_url || d.label_url }
}

// Chuẩn hóa webhook của các hãng về trạng thái nội bộ. Gọi hàm này trong handler POST /api/webhook/:carrier
export function mapWebhook(body) {
  const s = String(body.status || '').toLowerCase()
  const trackingId = body.OrderCode || body.tracking_id || body.billCode
  if (['delivered', 'delivered_success', 'giao thành công'].includes(s)) return { trackingId, status: 'Hoàn thành' }
  if (['cancel', 'returned'].includes(s)) return { trackingId, status: 'Đã hủy' }
  return { trackingId, status: 'Đang giao' }
}
