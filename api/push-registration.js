import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'
import {
  parseOptionalNotificationLanguage,
  SUPPORTED_NOTIFICATION_LANGUAGES,
} from './_notification-language.js'
import { enforceRequestLimit } from './_rate-limit.js'

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

class PushRegistrationError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'PushRegistrationError'
    this.statusCode = statusCode
  }
}

function getHeader(req, name) {
  const headers = req?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || ''
}

export function hashDeviceToken(deviceToken) {
  return crypto
    .createHash('sha256')
    .update(String(deviceToken || ''))
    .digest('hex')
}

export function normalizePushRegistrationRequest(body = {}) {
  const action = String(body.action || 'register').trim().toLowerCase()
  const platform = String(
    body.platform || (action === 'unregister' ? 'android' : ''),
  ).trim().toLowerCase()
  const token = String(body.token || '').trim()
  const rawNotificationLanguage = body.notificationLanguage
  const notificationLanguage = parseOptionalNotificationLanguage(
    rawNotificationLanguage,
  )

  if (!['register', 'unregister'].includes(action)) {
    throw new PushRegistrationError('Geçersiz bildirim kayıt işlemi.')
  }

  if (!['android', 'ios', 'ios-sandbox'].includes(platform)) {
    throw new PushRegistrationError('Geçersiz bildirim platformu.')
  }

  if (
    (action === 'register' || token) &&
    (token.length < 20 || token.length > 4096 || /\s/.test(token))
  ) {
    throw new PushRegistrationError('Geçersiz bildirim anahtarı.')
  }

  if (
    isNotBlank(rawNotificationLanguage) &&
    !SUPPORTED_NOTIFICATION_LANGUAGES.has(
      String(rawNotificationLanguage).trim().toLowerCase(),
    )
  ) {
    throw new PushRegistrationError('Geçersiz bildirim dili.')
  }

  return { action, platform, token, notificationLanguage }
}

export function createNativeSubscriptionRecord({
  userId,
  deviceHash,
  platform,
  token,
  deviceName,
  appVersion,
  notificationLanguage,
  now = new Date(),
}) {
  const record = {
    user_id: userId,
    device_hash: deviceHash,
    platform,
    token,
    device_name: String(deviceName || '').slice(0, 500),
    app_version: String(appVersion || '').slice(0, 80),
    updated_at: now.toISOString(),
  }

  // Older app builds do not send a language. Omitting the column keeps an
  // already learned preference intact during their periodic token refreshes.
  if (notificationLanguage) {
    record.notification_language = notificationLanguage
  }

  return record
}

function isMissingDeviceHashColumn(error) {
  return String(error?.message || '').includes('device_hash')
}

function isMissingNotificationLanguageColumn(error) {
  return String(error?.message || '').includes('notification_language')
}

export async function replaceNativePushSubscription(
  supabaseAdmin,
  subscriptionRecord,
) {
  const { error: deviceCleanupError } = await supabaseAdmin
    .from('native_push_subscriptions')
    .delete()
    .eq('device_hash', subscriptionRecord.device_hash)
    .neq('token', subscriptionRecord.token)

  if (deviceCleanupError && !isMissingDeviceHashColumn(deviceCleanupError)) {
    throw new Error(deviceCleanupError.message)
  }

  const legacySchema = Boolean(deviceCleanupError)

  const record = legacySchema
    ? Object.fromEntries(
        Object.entries(subscriptionRecord).filter(([key]) => key !== 'device_hash'),
      )
    : subscriptionRecord
  let { error } = await supabaseAdmin
    .from('native_push_subscriptions')
    .upsert(record, { onConflict: 'token' })

  if (error && isMissingNotificationLanguageColumn(error)) {
    const { notification_language: ignoredLanguage, ...legacyLanguageRecord } =
      record
    void ignoredLanguage

    const fallbackResult = await supabaseAdmin
      .from('native_push_subscriptions')
      .upsert(legacyLanguageRecord, { onConflict: 'token' })
    error = fallbackResult.error
  }

  if (error) {
    throw new Error(error.message)
  }

  return { legacySchema }
}

async function deleteNativeSubscriptionByUserToken(
  supabaseAdmin,
  { userId, token, legacyOnly = false },
) {
  let query = supabaseAdmin
    .from('native_push_subscriptions')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('token', token)

  if (legacyOnly) {
    query = query.is('device_hash', null)
  }

  const { count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return Number.isInteger(count) ? count : 0
}

async function hasLegacyNativeSubscription(supabaseAdmin, userId) {
  const { count, error } = await supabaseAdmin
    .from('native_push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('device_hash', null)

  if (error) {
    throw new Error(error.message)
  }

  return Number.isInteger(count) && count > 0
}

export async function unregisterNativePushSubscription(
  supabaseAdmin,
  { userId, deviceHash, token },
) {
  const { count, error } = await supabaseAdmin
    .from('native_push_subscriptions')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('device_hash', deviceHash)

  if (error && isMissingDeviceHashColumn(error)) {
    if (!token) {
      return { deleted: 0, legacyTokenRequired: true }
    }

    const deleted = await deleteNativeSubscriptionByUserToken(supabaseAdmin, {
      userId,
      token,
    })

    return { deleted, legacyTokenRequired: false }
  }

  if (error) {
    throw new Error(error.message)
  }

  const deletedByDeviceHash = Number.isInteger(count) ? count : 0

  if (deletedByDeviceHash > 0) {
    return { deleted: deletedByDeviceHash, legacyTokenRequired: false }
  }

  if (token) {
    const deleted = await deleteNativeSubscriptionByUserToken(supabaseAdmin, {
      userId,
      token,
      legacyOnly: true,
    })

    return { deleted, legacyTokenRequired: false }
  }

  return {
    deleted: 0,
    legacyTokenRequired: await hasLegacyNativeSubscription(
      supabaseAdmin,
      userId,
    ),
  }
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

    const body = parseBody(req)
    const { action, platform, token, notificationLanguage } =
      normalizePushRegistrationRequest(body)
    const deviceToken = String(getHeader(req, 'x-device-token') || '').trim()
    const deviceHash = hashDeviceToken(deviceToken)

    if (
      !enforceRequestLimit(res, {
        scope: `push-registration-${action}`,
        key: `${authResult.userId}:${deviceHash}`,
        maxRequests: action === 'unregister' ? 5 : 10,
        windowMs: 5 * 60_000,
        minIntervalMs: action === 'unregister' ? 0 : 1000,
        errorMessage: 'Bildirim kaydı çok hızlı tekrarlandı.',
      })
    ) {
      return
    }

    const supabaseAdmin = createSupabaseAdminClient()

    if (action === 'unregister') {
      const result = await unregisterNativePushSubscription(supabaseAdmin, {
        userId: authResult.userId,
        deviceHash,
        token,
      })

      return res.status(200).json({
        success: true,
        action,
        ...result,
      })
    }

    const subscriptionRecord = createNativeSubscriptionRecord({
      userId: authResult.userId,
      deviceHash,
      platform,
      token,
      deviceName: body.deviceName,
      appVersion: body.appVersion,
      notificationLanguage,
    })
    const result = await replaceNativePushSubscription(
      supabaseAdmin,
      subscriptionRecord,
    )

    return res.status(200).json({ success: true, action, ...result })
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Bildirim kaydı yapılamadı.',
    })
  }
}
