import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import adminPanelHandler from './api/admin-panel.js'
import deviceAccessHandler from './api/device-access.js'
import reportPdfHandler from './api/report-pdf.js'
import reportUrlHandler from './api/report-url.js'
import sendNotificationHandler from './api/send-notification.js'
import appVersionHandler from './api/app-version.js'
import pushRegistrationHandler from './api/push-registration.js'
import auditLogHandler from './api/audit-log.js'
import notificationAutomationsHandler from './api/notification-automations.js'
import { applyCors } from './api/_cors.js'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)

export function createLocalServer() {
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Referrer-Policy', 'no-referrer')
    applyCors(req, res)
    if (req.method === 'OPTIONS') return res.status(204).end()
    next()
  })
  app.use(express.json({ limit: '100kb' }))

  app.all('/api/app-version', appVersionHandler)
  app.all('/api/device-access', deviceAccessHandler)
  app.all('/api/admin-panel', adminPanelHandler)
  app.all('/api/report-pdf', reportPdfHandler)
  app.all('/api/report-url', reportUrlHandler)
  app.all('/api/send-notification', sendNotificationHandler)
  app.all('/api/push-registration', pushRegistrationHandler)
  app.all('/api/audit-log', auditLogHandler)
  app.all('/api/notification-automations', notificationAutomationsHandler)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API yolu bulunamadı.' }))

  // Hatalı JSON/büyük gövde HTML veya teknik hata yığını döndürmez.
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500
    return res.status(status).json({ error: status === 500 ? 'İstek işlenemedi.' : 'İstek gövdesi geçersiz veya çok büyük.' })
  })

  app.use(express.static(path.join(currentDirectory, 'dist')))
  app.use((req, res) => {
    res.sendFile(path.join(currentDirectory, 'dist', 'index.html'))
  })

  return app
}

// İçe aktarma testte sunucu başlatmaz, .env.local/üretim ayarlarını okumaz.
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  try {
    process.loadEnvFile?.('.env.local')
  } catch {
    console.log('.env.local yüklenmedi; mevcut ortam değişkenleri kullanılacak.')
  }
  const port = process.env.PORT || 3001
  createLocalServer().listen(port, () => {
    console.log(`Barkod Rapor Web çalışıyor: http://localhost:${port}`)
  })
}
