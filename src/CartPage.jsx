import { useAccount } from './Account'
import { Checkout, addrText } from './Checkout'
import { useCart } from './cart'
import { useCatalog } from './catalog'
import { AvatarEditor, BottomBar, SiteHeader, displayName } from './SiteHeader'

// Thẻ người mua: đã đăng nhập thì hiện ảnh, tên, SĐT, địa chỉ mặc định; khách vãng lai vẫn đặt được
function BuyerCard({ user, setUser }) {
  if (user === undefined) return <div className="card buyer skeleton" aria-hidden="true"><div className="sk line" /><div className="sk line short" /></div>
  if (!user) {
    return (
      <div className="card buyer">
        <h3>Mua nhanh không cần tài khoản ✓</h3>
        <p className="muted">Bạn vẫn đặt được nhiều mẫu cùng lúc, chỉ cần điền người nhận và địa chỉ. Đăng ký bằng số điện thoại để:</p>
        <ul className="perks">
          <li>📍 Lưu sổ địa chỉ, lần sau đặt chỉ một chạm</li>
          <li>🛒 Giữ giỏ hàng trên mọi thiết bị</li>
          <li>🧾 Xem lại & theo dõi mọi đơn đã đặt</li>
        </ul>
        <a className="btn-link primary-link" href="/account">Đăng nhập / Đăng ký</a>
      </div>
    )
  }
  const def = (user.addresses || []).find((a) => a.isDefault)
  return (
    <div className="card buyer">
      <div className="buyer-head">
        <AvatarEditor user={user} setUser={setUser} size={64} />
        <div>
          <b>{displayName(user)}</b>
          <small className="muted">{user.phone || user.username}</small>
        </div>
      </div>
      <dl className="buyer-info">
        <div><dt>Giao mặc định</dt><dd>{def ? <>{def.name} · {def.phone}<br /><small className="muted">{addrText(def)}</small></> : <span className="muted">Chưa có — điền ở phần giao hàng, hệ thống sẽ lưu lại</span>}</dd></div>
        <div><dt>Sổ địa chỉ</dt><dd>{(user.addresses || []).length} địa chỉ</dd></div>
      </dl>
      <div className="buyer-links">
        <a className="btn-link" href="/account">🧾 Đơn của tôi</a>
        <a className="btn-link" href="/account/profile">👤 Thông tin tài khoản</a>
      </div>
    </div>
  )
}

// Trang giỏ hàng riêng /cart: xem giỏ, chọn địa chỉ, đặt nhiều mẫu trong một đơn
export default function CartPage() {
  const { products, depositPct, loaded } = useCatalog()
  const { user, setUser } = useAccount()
  const cart = useCart(user)
  return (
    <div className="app shop cart-page">
      <SiteHeader user={user} cartCount={cart.count} backFallback="/order" />
      <main>
        <div className="page-title">
          <h1>Giỏ hàng</h1>
          <a href="/order">← Tiếp tục mua sắm</a>
        </div>
        <div className="cart-layout">
          <Checkout products={products} cart={cart} depositPct={depositPct} user={user} setUser={setUser} loaded={loaded} />
          <aside className="cart-side">
            <BuyerCard user={user} setUser={setUser} />
          </aside>
        </div>
      </main>
      <BottomBar active="cart" cartCount={cart.count} />
    </div>
  )
}
