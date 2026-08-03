import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'
import { enforceRequestLimit } from './_rate-limit.js'

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body !== 'string') return req.body

  try {
    return JSON.parse(req.body)
  } catch {
    return {}
  }
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!isNotBlank(supabaseUrl) || !isNotBlank(serviceRoleKey)) {
    throw new Error('Supabase sunucu ayarları eksik.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export default async function handler(req, res) {
  if (handleCors(req, res)) {
    return
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Sadece POST isteği desteklenir.',
      })
    }

    const authResult = await verifyApprovedDeviceRequest(req)

    if (!authResult.ok) {
      return res.status(authResult.statusCode || 403).json({
        error: authResult.error || 'Cihaz doğrulanamadı.',
      })
    }

    if (
      !enforceRequestLimit(res, {
        scope: 'push-registration',
        key: authResult.userId,
        maxRequests: 10,
        windowMs: 5 * 60_000,
        minIntervalMs: 1000,
        errorMessage: 'Bildirim kaydı çok hızlı tekrarlandı.',
      })
    ) {
      return
    }

    const body = parseBody(req)
    const token = String(body.token || '').trim()
    const platform = String(body.platform || '').trim().toLowerCase()

    if (platform !== 'android') {
      return res.status(400).json({ error: 'Geçersiz bildirim platformu.' })
    }

    if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
      return res.status(400).json({ error: 'Geçersiz bildirim anahtarı.' })
    }

    const supabaseAdmin = createSupabaseAdminClient()
    const { error } = await supabaseAdmin
      .from('native_push_subscriptions')
      .upsert(
        {
          user_id: authResult.userId,
          platform,
          token,
          device_name: String(body.deviceName || '').slice(0, 500),
          app_version: String(body.appVersion || '').slice(0, 80),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'token',
        }
      )

    if (error) {
      throw new Error(error.message)
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Bildirim kaydı yapılamadı.',
    })
  }
}
