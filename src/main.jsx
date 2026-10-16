import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './features.css'
import App from './App.jsx'
import Shop from './Shop.jsx'
import AdminGate from './AdminGate.jsx'
import Track from './Track.jsx'
import Clip from './Clip.jsx'
import { LoginPage } from './Account.jsx'

// /admin = quản trị, /order = khách đặt hàng, /track/MÃ = theo dõi đơn, /clip = nhận mẫu từ bookmarklet
function routeOf(path) {
  if (/^\/admin(\/|$)/.test(path)) return { name: 'admin' }
  if (/^\/order(\/|$)/.test(path)) return { name: 'order' }
  if (/^\/login\/?$/.test(path)) return { name: 'login' }
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
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
