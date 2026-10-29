import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/be-vietnam-pro/800.css'
import './index.css'
import './features.css'
import './theme.css'
import './layout.css'
import './admin.css'
import App from './App.jsx'
import Shop from './Shop.jsx'
import AdminGate from './AdminGate.jsx'
import Track from './Track.jsx'
import Clip from './Clip.jsx'
import { LoginPage } from './Account.jsx'
import AccountPage from './AccountPage.jsx'
import CartPage from './CartPage.jsx'
import ProductPage from './ProductPage.jsx'

// /admin = quản trị, /order = khách đặt hàng, /account = tài khoản khách, /cart = giỏ hàng, /p/:id = chi tiết sản phẩm, /track/MÃ = theo dõi đơn, /clip = nhận mẫu từ bookmarklet
function routeOf(path) {
  if (/^\/admin(\/|$)/.test(path)) return { name: 'admin' }
  if (/^\/order(\/|$)/.test(path)) return { name: 'order' }
  if (/^\/login\/?$/.test(path)) return { name: 'login' }
  if (/^\/account(\/|$)/.test(path)) return { name: 'account' }
  if (/^\/cart\/?$/.test(path)) return { name: 'cart' }
  const pm = path.match(/^\/p\/([\w-]{1,40})(\/|$)/)
  if (pm) return { name: 'product', id: pm[1] }
  if (/^\/clip\/?$/.test(path)) return { name: 'clip' }
  const t = path.match(/^\/track\/([A-Za-z0-9]{4,20})\/?$/)
  return t ? { name: 'track', code: t[1].toUpperCase() } : null
}

function Root() {
  const [route, setRoute] = useState(() => routeOf(location.pathname))
  useEffect(() => {
    if (!route) history.replaceState(null, '', '/order')
    const on = () => setRoute(routeOf(location.pathname) ?? { name: 'order' })
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [route])
  if (route?.name === 'admin') return <AdminGate>{(p) => <App {...p} />}</AdminGate>
  if (route?.name === 'login') return <LoginPage />
  if (route?.name === 'account') return <AccountPage />
  if (route?.name === 'cart') return <CartPage />
  if (route?.name === 'product') return <ProductPage id={route.id} />
  if (route?.name === 'clip') return <Clip />
  if (route?.name === 'track') return <Track code={route.code} />
  return <Shop />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {}))
}
