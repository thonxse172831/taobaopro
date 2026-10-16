import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Shop from './Shop.jsx'
import AdminGate from './AdminGate.jsx'

// /admin = quản trị, /order = trang khách; đường dẫn khác chuyển về /order
const routeOf = (path) => (/^\/admin(\/|$)/.test(path) ? 'admin' : /^\/order(\/|$)/.test(path) ? 'order' : null)

function Root() {
  const [route, setRoute] = useState(() => routeOf(location.pathname))
  useEffect(() => {
    if (!route) history.replaceState(null, '', '/order')
    const on = () => setRoute(routeOf(location.pathname) ?? 'order')
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [route])
  if (route === 'admin') return <AdminGate>{(p) => <App {...p} />}</AdminGate>
  return <Shop />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
