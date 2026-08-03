import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import adminPanelHandler from './api/admin-panel.js'
import deviceAccessHandler from './api/device-access.js'
import reportPdfHandler from './api/report-pdf.js'
import reportUrlHandler from './api/report-url.js'
import sendNotificationHandler from './api/send-notification.js'
import appVersionHandler from './api/app-version.js'
import pushRegistrationHandler from './api/push-registration.js'

try {
  process.loadEnvFile?.('.env.local')
} catch (error) {
  console.log('.env.local yüklenemedi:', error.message)
}

const app = express()
const port = process.env.PORT || 3001
const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)

app.use(cors())
app.use(express.json())

app.all('/api/app-version', appVersionHandler)
app.all('/api/device-access', deviceAccessHandler)
app.all('/api/admin-panel', adminPanelHandler)
app.all('/api/report-pdf', reportPdfHandler)
app.all('/api/report-url', reportUrlHandler)
app.all('/api/send-notification', sendNotificationHandler)
app.all('/api/push-registration', pushRegistrationHandler)

app.use(express.static(path.join(currentDirectory, 'dist')))
app.use((req, res) => {
  res.sendFile(path.join(currentDirectory, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Barkod Rapor Web çalışıyor: http://localhost:${port}`)
})
