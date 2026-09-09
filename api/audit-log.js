import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'

function bodyOf(req) { if (!req.body) return {}; if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } } return req.body }
function client() { const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error('Supabase sunucu ayarları eksik.'); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) }

export default async function handler(req, res) {
  if (handleCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Yalnızca POST desteklenir.' })
  try {
    const auth = await verifyApprovedDeviceRequest(req)
    if (!auth.ok) return res.status(auth.statusCode || 401).json({ error: auth.error || 'Yetkisiz istek.' })
    const input = bodyOf(req)
    const eventType = String(input.eventType || '').trim()
    if (!['login', 'logout', 'report'].includes(eventType)) return res.status(400).json({ error: 'Geçersiz audit olayı.' })
    const clean = (value, max) => String(value || '').slice(0, max) || null
    const table = eventType === 'report' ? 'report_logs' : 'login_logs'
    const row = eventType === 'report'
      ? { user_id: auth.userId, barcode: clean(input.barcode, 120), report_code: clean(input.reportCode, 80), report_name: clean(input.reportName, 160), device_name: clean(input.deviceName, 160), app_version: clean(input.appVersion, 40) }
      : { user_id: auth.userId, event_type: eventType, device_name: clean(input.deviceName, 160), app_version: clean(input.appVersion, 40) }
    const { error } = await client().from(table).insert(row)
    if (error) throw error
    return res.status(201).json({ success: true })
  } catch (error) { return res.status(500).json({ error: error.message || 'Audit kaydı yazılamadı.' }) }
}
