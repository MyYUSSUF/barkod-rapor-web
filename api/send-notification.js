import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'
import { enforceRequestLimit } from './_rate-limit.js'

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

  if (
    subject.startsWith('http://') ||
    subject.startsWith('https://') ||
    subject.startsWith('mailto:')
  ) {
    return subject
  }

  return 'https://barkod-rapor-web.vercel.app'
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!isNotBlank(supabaseUrl)) {
    throw new Error('SUPABASE_URL veya VITE_SUPABASE_URL eksik.')
  }

  if (!isNotBlank(serviceRoleKey)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function verifyAdminRequest(req, secret) {
  const notificationAdminSecret = process.env.NOTIFICATION_ADMIN_SECRET
  const secretIsValid =
    isNotBlank(secret) &&
    isNotBlank(notificationAdminSecret) &&
    secret === notificationAdminSecret

  if (secretIsValid) {
    return {
      ok: true,
      method: 'secret',
      userId: null,
    }
  }

  const approvedDeviceResult = await verifyApprovedDeviceRequest(req, {
    requireAdmin: true,
  })

  if (!approvedDeviceResult.ok) {
    return approvedDeviceResult
  }

  return {
    ok: true,
    method: 'supabase_admin',
    userId: approvedDeviceResult.userId,
  }
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
  if (handleCors(req, res)) {
    return
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Sadece POST isteği desteklenir.',
      })
    }

    const { secret, title, body, url } = req.body || {}

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

    const supabaseAdmin = createSupabaseAdminClient()
    const authResult = await verifyAdminRequest(req, secret)

    if (!authResult.ok) {
      return res.status(401).json({
        error: authResult.error || 'Yetkisiz istek.',
      })
    }

    if (
      !enforceRequestLimit(res, {
        scope: 'send-notification',
        key: authResult.userId || 'admin-secret',
        maxRequests: 3,
        windowMs: 5 * 60_000,
        minIntervalMs: 10_000,
        errorMessage:
          'Bildirim gönderimi çok hızlı tekrarlandı. Lütfen biraz bekleyin.',
      })
    ) {
      return
    }

    webPush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    )

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
      authMethod: authResult.method,
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
