import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:muhammetyusuf2506@gmail.com'
const NOTIFICATION_ADMIN_SECRET = process.env.NOTIFICATION_ADMIN_SECRET

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function createSupabaseAdminClient() {
  if (!isNotBlank(SUPABASE_URL)) {
    throw new Error('SUPABASE_URL veya VITE_SUPABASE_URL eksik.')
  }

  if (!isNotBlank(SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik.')
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Sadece POST isteği desteklenir.',
      })
    }

    const { secret, title, body, url } = req.body || {}

    if (!isNotBlank(NOTIFICATION_ADMIN_SECRET)) {
      return res.status(500).json({
        error: 'NOTIFICATION_ADMIN_SECRET Vercel ortam değişkeninde eksik.',
      })
    }

    if (secret !== NOTIFICATION_ADMIN_SECRET) {
      return res.status(401).json({
        error: 'Yetkisiz istek.',
      })
    }

    if (!isNotBlank(VAPID_PUBLIC_KEY) || !isNotBlank(VAPID_PRIVATE_KEY)) {
      return res.status(500).json({
        error: 'VAPID anahtarları eksik.',
      })
    }

    webPush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    )

    const supabaseAdmin = createSupabaseAdminClient()

    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, subscription')

    if (error) {
      throw new Error(error.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        total: 0,
        sent: 0,
        failed: 0,
        message: 'Kayıtlı bildirim cihazı yok.',
      })
    }

    const payload = JSON.stringify({
      title: isNotBlank(title) ? title : 'Elvan Barkod Rapor',
      body: isNotBlank(body) ? body : 'Yeni bildiriminiz var.',
      url: isNotBlank(url) ? url : '/',
    })

    let sent = 0
    let failed = 0
    const deletedIds = []

    for (const item of subscriptions) {
      try {
        await webPush.sendNotification(item.subscription, payload)
        sent += 1
      } catch (sendError) {
        failed += 1

        if (sendError.statusCode === 404 || sendError.statusCode === 410) {
          deletedIds.push(item.id)
        }
      }
    }

    if (deletedIds.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('id', deletedIds)
    }

    return res.status(200).json({
      total: subscriptions.length,
      sent,
      failed,
      deleted: deletedIds.length,
    })
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Bildirim gönderilemedi.',
    })
  }
}