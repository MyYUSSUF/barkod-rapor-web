import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'
import { getFcmToken } from './_notification-targets.js'
import {
  createFcmMessage,
  getFirebaseAccessToken,
  isUnregisteredFcmResponse,
  mapWithConcurrency,
  sendFcmHttpRequest,
} from './_fcm-http-v1.js'
import { enforceRequestLimit } from './_rate-limit.js'

const FCM_SEND_CONCURRENCY = 10

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

    const supabaseAdmin = createSupabaseAdminClient()
    const authResult = await verifyAdminRequest(req, secret)

    if (!authResult.ok) {
      return res.status(authResult.statusCode || 401).json({
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

    const { data: webSubscriptions, error: webSubscriptionsError } =
      await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, subscription, user_agent, created_at')

    if (webSubscriptionsError) {
      throw new Error(webSubscriptionsError.message)
    }

    const { data: nativeSubscriptions, error: nativeSubscriptionsError } =
      await supabaseAdmin
        .from('native_push_subscriptions')
        .select('id, token, device_name, app_version, created_at')

    if (nativeSubscriptionsError) {
      throw new Error(nativeSubscriptionsError.message)
    }

    const totalSubscriptions =
      (webSubscriptions?.length || 0) + (nativeSubscriptions?.length || 0)

    if (totalSubscriptions === 0) {
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
    const payloadData = JSON.parse(payload)

    let sent = 0
    let failed = 0
    let webSent = 0
    let nativeSent = 0
    const deletedWebIds = []
    const deletedNativeIds = []
    const failedDetails = []

    if ((webSubscriptions?.length || 0) > 0) {
      if (!isNotBlank(vapidPublicKey) || !isNotBlank(vapidPrivateKey)) {
        failed += webSubscriptions.length
        failedDetails.push({
          provider: 'web-push',
          affected: webSubscriptions.length,
          error: {
            message: 'Web Push sunucu ayarları eksik.',
          },
        })
      } else {
        webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

        for (const item of webSubscriptions) {
          try {
            await webPush.sendNotification(item.subscription, payload)
            sent += 1
            webSent += 1
          } catch (sendError) {
            failed += 1

            failedDetails.push({
              id: item.id,
              provider: 'web-push',
              endpointStart: item.endpoint
                ? String(item.endpoint).slice(0, 80)
                : null,
              userAgent: item.user_agent || null,
              createdAt: item.created_at || null,
              error: makeSafeError(sendError),
            })

            if (
              sendError.statusCode === 404 ||
              sendError.statusCode === 410
            ) {
              deletedWebIds.push(item.id)
            }
          }
        }
      }
    }

    if (nativeSubscriptions.length > 0) {
      try {
        const { accessToken, projectId } = await getFirebaseAccessToken(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
        )
        const nativeResults = await mapWithConcurrency(
          nativeSubscriptions,
          FCM_SEND_CONCURRENCY,
          async (item) => {
            const token = getFcmToken(item)

            if (!token) {
              return {
                item,
                ok: false,
                statusCode: null,
                errorCode: 'TOKEN_MISSING',
                message: 'FCM cihaz anahtarı eksik.',
                shouldDelete: false,
              }
            }

            try {
              const response = await sendFcmHttpRequest({
                accessToken,
                projectId,
                message: createFcmMessage({
                  token,
                  title: payloadData.title,
                  body: payloadData.body,
                  url: payloadData.url,
                }),
              })
              const fcmErrorDetail = response.payload?.error?.details?.find(
                (detail) =>
                  detail?.['@type'] ===
                  'type.googleapis.com/google.firebase.fcm.v1.FcmError',
              )

              return {
                item,
                ok: response.ok,
                statusCode: response.statusCode,
                errorCode:
                  fcmErrorDetail?.errorCode ||
                  response.payload?.error?.status ||
                  null,
                message: response.message,
                shouldDelete: isUnregisteredFcmResponse(
                  response.statusCode,
                  response.payload,
                ),
              }
            } catch (sendError) {
              return {
                item,
                ok: false,
                statusCode: null,
                errorCode: 'NETWORK_ERROR',
                message: sendError.message || 'FCM ağ hatası',
                shouldDelete: false,
              }
            }
          },
        )

        nativeResults.forEach((result) => {
          if (result.ok) {
            sent += 1
            nativeSent += 1
            return
          }

          failed += 1
          failedDetails.push({
            id: result.item.id,
            provider: 'fcm',
            userAgent: result.item.device_name || null,
            createdAt: result.item.created_at || null,
            error: {
              message: result.message || 'FCM gönderim hatası',
              code: result.errorCode,
              statusCode: result.statusCode,
            },
          })

          if (result.shouldDelete) {
            deletedNativeIds.push(result.item.id)
          }
        })
      } catch (firebaseError) {
        failed += nativeSubscriptions.length
        failedDetails.push({
          provider: 'fcm',
          affected: nativeSubscriptions.length,
          error: {
            message: firebaseError.message || 'FCM yapılandırma hatası',
          },
        })
      }
    }

    if (deletedWebIds.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('id', deletedWebIds)
    }

    if (deletedNativeIds.length > 0) {
      await supabaseAdmin
        .from('native_push_subscriptions')
        .delete()
        .in('id', deletedNativeIds)
    }

    return res.status(200).json({
      total: totalSubscriptions,
      sent,
      failed,
      webSent,
      nativeSent,
      deleted: deletedWebIds.length + deletedNativeIds.length,
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
