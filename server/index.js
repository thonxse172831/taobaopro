import { createApp } from './app.js'

try { process.loadEnvFile() } catch { /* không có file .env */ }

const port = Number(process.env.PORT) || 3000
const { app, db } = await createApp()
const server = app.listen(port, '0.0.0.0', () => console.log(`TaobaoPro chạy tại http://localhost:${port}`))

const stop = () => server.close(async () => { await db.close(); process.exit(0) })
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
