import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NOTIFICATION_ADMIN_SECRET = process.env.NOTIFICATION_ADMIN_SECRET

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function cleanKey(value) {
  return String(value || '')
    .replace('Public Key:', '')
    .replace('Private Key:', '')
    .replace('Public key:', '')
    .replace('Private key:', '')
    .replace('PUBLIC KEY:', '')
    .replace('PRIVATE KEY:', '')
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replaceAll(' ', '')
    .replaceAll('\n', '')
    .replaceAll('\r', '')
    .replaceAll('=', '')
    .trim()
}

function getVapidPublicKey() {
  return cleanKey(process.env.VAPID_PUBLIC_KEY)
}

function getVapidPrivateKey() {
  return cleanKey(process.env.VAPID_PRIVATE_KEY)
}

function getVapidSubject() {
  const subject = String(process.env.VAPID_SUBJECT || '').trim()

  if (subject.startsWith('http://') || subject.startsWith('https://') || subject.startsWith('mailto:')) {
    return subject
  }

  return 'https://barkod-rapor-web.vercel.app'
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

function makeSafeError(sendError) {
  return {
    statusCode: sendError.statusCode || null,
    message: sendError.message || 'Bilinmeyen gönderim hatası',
    body: sendError.body ? String(sendError.body).slice(0, 500) : null,
    endpoint: sendError.endpoint || null,
  }
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

    const vapidPublicKey = getVapidPublicKey()
    const vapidPrivateKey = getVapidPrivateKey()
    const vapidSubject = getVapidSubject()

    if (!isNotBlank(vapidPublicKey)) {
      return res.status(500).json({
        error: 'VAPID_PUBLIC_KEY eksik.',
      })
    }

    if (!isNotBlank(vapidPrivateKey)) {
      return res.status(500).json({
        error: 'VAPID_PRIVATE_KEY eksik.',
      })
    }

    webPush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    )

    const supabaseAdmin = createSupabaseAdminClient()

    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, subscription, user_agent, created_at')

    if (error) {
      throw new Error(error.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        total: 0,
        sent: 0,
        failed: 0,
        deleted: 0,
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
    const failedDetails = []

    for (const item of subscriptions) {
      try {
        await webPush.sendNotification(item.subscription, payload)
        sent += 1
      } catch (sendError) {
        failed += 1

        failedDetails.push({
          id: item.id,
          endpointStart: item.endpoint ? String(item.endpoint).slice(0, 80) : null,
          userAgent: item.user_agent || null,
          createdAt: item.created_at || null,
          error: makeSafeError(sendError),
        })

        if (
          sendError.statusCode === 404 ||
          sendError.statusCode === 410 ||
          sendError.statusCode === 400 ||
          sendError.statusCode === 403
        ) {
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
      vapidPublicKeyLength: vapidPublicKey.length,
      vapidSubject,
      failedDetails,
    })
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Bildirim gönderilemedi.',
    })
  }
}