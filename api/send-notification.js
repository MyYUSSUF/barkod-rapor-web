import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'
import { getDailyMotivation } from './_daily-motivation.js'
import { getCairoScheduleAttempt } from './_motivation-schedule.js'
import { getNotificationLanguage } from './_notification-language.js'
import { getFcmToken } from './_notification-targets.js'
import {
  createApnsPayload,
  getApnsProviderToken,
  isPermanentApnsTokenFailure,
  readApnsConfiguration,
  sendApnsHttpRequest,
  withApnsClient,
} from './_apns-http2.js'
import {
  createFcmMessage,
  getFirebaseAccessToken,
  isUnregisteredFcmResponse,
  mapWithConcurrency,
  sendFcmHttpRequest,
} from './_fcm-http-v1.js'
import { enforceRequestLimit } from './_rate-limit.js'

const FCM_SEND_CONCURRENCY = 10
const APNS_SEND_CONCURRENCY = 10
const WEB_PUSH_SEND_CONCURRENCY = 10
export const BROADCAST_PAGE_SIZE = 500
export const MAX_BROADCAST_SUBSCRIPTIONS = 2000
const LOOKUP_BATCH_SIZE = 100
const MAX_LOOKUP_ROWS = 10000
export const CLEANUP_BATCH_SIZE = 100
export const MAX_NOTIFICATION_TITLE_LENGTH = 120
export const MAX_NOTIFICATION_BODY_LENGTH = 800
const MAX_NOTIFICATION_TITLE_BYTES = 480
const MAX_NOTIFICATION_BODY_BYTES = 2800
const MAX_NOTIFICATION_URL_LENGTH = 512
const MAX_NOTIFICATION_URL_BYTES = 512
const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class NotificationBackendError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'NotificationBackendError'
    this.statusCode = statusCode
  }
}

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

export function normalizeNotificationTargetUserId(value) {
  if (!isNotBlank(value)) {
    return null
  }

  const targetUserId = String(value).trim().toLowerCase()

  if (!USER_ID_PATTERN.test(targetUserId)) {
    throw new NotificationBackendError('Geçersiz bildirim hedefi.', 400)
  }

  return targetUserId
}

export function normalizeNotificationAutomationId(value, label = 'Otomasyon') {
  if (!isNotBlank(value)) return null

  const automationId = String(value).trim().toLowerCase()

  if (!USER_ID_PATTERN.test(automationId)) {
    throw new NotificationBackendError(`${label} ID geçersiz.`, 400)
  }

  return automationId
}

function secretsMatch(actual, expected) {
  if (!isNotBlank(actual) || !isNotBlank(expected)) {
    return false
  }

  const actualBuffer = Buffer.from(String(actual))
  const expectedBuffer = Buffer.from(String(expected))

  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
}

export function getAuthorizedCronMotivation(
  req,
  { env = process.env, date = new Date() } = {},
) {
  const cronSecret = env.CRON_SECRET

  if (!isNotBlank(cronSecret)) {
    throw new NotificationBackendError(
      'Zamanlayıcı güvenlik ayarı eksik.',
      503,
    )
  }

  const authorization = req.headers?.authorization || req.headers?.Authorization || ''

  if (!secretsMatch(authorization, `Bearer ${cronSecret}`)) {
    throw new NotificationBackendError('Yetkisiz zamanlayıcı isteği.', 401)
  }

  const scheduleAttempt = getCairoScheduleAttempt(date)

  if (!scheduleAttempt) {
    return {
      skipped: true,
      reason: 'outside_cairo_schedule',
    }
  }

  return {
    ...getDailyMotivation(date),
    scheduleAttempt: scheduleAttempt.attempt,
  }
}

export async function claimDailyMotivationRun(supabaseAdmin, motivation) {
  const { data, error } = await supabaseAdmin.rpc(
    'claim_daily_motivation_run',
    {
      p_run_date: motivation.date,
      p_message_id: motivation.messageId,
      // Keep ambiguous, interrupted runs locked beyond the scheduled retry
      // window so a device is not sent the same morning message twice.
      p_lease_minutes: 60,
    },
  )

  if (error) {
    throw new NotificationBackendError(
      'Günlük bildirim kaydı oluşturulamadı.',
    )
  }

  if (data !== true) {
    return { claimed: false, reason: 'already_completed_or_running' }
  }

  return { claimed: true }
}

export function getDailyMotivationRunStatus({ sent = 0, failed = 0 } = {}) {
  if (failed <= 0) {
    return 'completed'
  }

  // A partially delivered broadcast is terminal for the day. Retrying the
  // entire broadcast would send the same message again to successful targets.
  return sent > 0 ? 'partial' : 'failed'
}

async function finishDailyMotivationRun(
  supabaseAdmin,
  motivation,
  { status, summary = null },
) {
  try {
    const { error } = await supabaseAdmin
      .from('daily_motivation_runs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        delivery_summary: summary,
      })
      .eq('run_date', motivation.date)

    if (error) {
      console.error('Günlük bildirim sonucu kaydedilemedi.', {
        code: error.code || null,
      })
    }
  } catch {
    // Gönderim sonucunun kaydedilememesi ikinci bir bildirime yol açmamalı.
  }
}

function makeSafeCleanupError({ provider, affected, error }) {
  const cleanCode = String(error?.code || '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 64)

  return {
    provider,
    operation: 'cleanup',
    affected,
    error: {
      message: 'Geçersiz bildirim kaydı temizlenemedi.',
      code: cleanCode || null,
    },
  }
}

export async function cleanupInvalidSubscriptionIds(
  supabaseAdmin,
  { table, ids = [], provider },
) {
  const uniqueIds = [...new Set(ids.filter(isNotBlank))]
  const result = {
    requested: uniqueIds.length,
    deleted: 0,
    failed: 0,
    errors: [],
  }

  for (let index = 0; index < uniqueIds.length; index += CLEANUP_BATCH_SIZE) {
    const batch = uniqueIds.slice(index, index + CLEANUP_BATCH_SIZE)
    let cleanupResult

    try {
      cleanupResult = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .in('id', batch)
    } catch (error) {
      cleanupResult = { count: null, error }
    }

    const { count, error } = cleanupResult || {}

    if (error || !Number.isInteger(count) || count < 0) {
      const cleanupError = error || { code: 'COUNT_UNAVAILABLE' }
      console.error(`${provider} geçersiz kayıt temizliği başarısız:`, cleanupError)
      result.failed += batch.length
      result.errors.push(
        makeSafeCleanupError({
          provider,
          affected: batch.length,
          error: cleanupError,
        }),
      )
      continue
    }

    result.deleted += count
  }

  return result
}

function normalizeText(value, fallback) {
  const cleanValue = String(value ?? '').trim()
  return cleanValue || fallback
}

function validateTextLimit(value, {
  label,
  maxLength,
  maxBytes,
}) {
  if (Array.from(value).length > maxLength) {
    throw new NotificationBackendError(
      `${label} en fazla ${maxLength} karakter olabilir.`,
      400,
    )
  }

  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    throw new NotificationBackendError(
      `${label} UTF-8 olarak en fazla ${maxBytes} bayt olabilir.`,
      400,
    )
  }
}

export function validateNotificationPayload({ title, body, url } = {}) {
  const payload = {
    title: normalizeText(title, 'Elvan Barkod Rapor'),
    body: normalizeText(body, 'Yeni bildiriminiz var.'),
    url: normalizeText(url, '/'),
  }

  validateTextLimit(payload.title, {
    label: 'Bildirim başlığı',
    maxLength: MAX_NOTIFICATION_TITLE_LENGTH,
    maxBytes: MAX_NOTIFICATION_TITLE_BYTES,
  })
  validateTextLimit(payload.body, {
    label: 'Bildirim mesajı',
    maxLength: MAX_NOTIFICATION_BODY_LENGTH,
    maxBytes: MAX_NOTIFICATION_BODY_BYTES,
  })
  validateTextLimit(payload.url, {
    label: 'Bildirim bağlantısı',
    maxLength: MAX_NOTIFICATION_URL_LENGTH,
    maxBytes: MAX_NOTIFICATION_URL_BYTES,
  })

  return payload
}

export function getScheduledNotificationPayload(
  motivation,
  notificationLanguage,
) {
  const language = getNotificationLanguage(notificationLanguage)
  const localizedPayload =
    motivation?.messages?.[language] ||
    motivation?.localized?.[language] ||
    {}

  return validateNotificationPayload({
    title: localizedPayload.title || motivation?.title,
    body: localizedPayload.body || motivation?.body,
    url: localizedPayload.url || motivation?.url,
  })
}

export function validateLocalizedNotificationPayloads(
  localizedMessages,
  { fallbackUrl = '/' } = {},
) {
  if (localizedMessages === null || localizedMessages === undefined) {
    return null
  }

  if (
    typeof localizedMessages !== 'object' ||
    Array.isArray(localizedMessages)
  ) {
    throw new NotificationBackendError(
      'Çok dilli bildirim içeriği geçersiz.',
      400,
    )
  }

  const result = {}

  for (const language of ['tr', 'en']) {
    const message = localizedMessages[language]

    if (
      !message ||
      typeof message !== 'object' ||
      !isNotBlank(message.title) ||
      !isNotBlank(message.body)
    ) {
      throw new NotificationBackendError(
        `${language.toUpperCase()} bildirim başlığı ve mesajı zorunludur.`,
        400,
      )
    }

    result[language] = validateNotificationPayload({
      title: message.title,
      body: message.body,
      url: message.url || fallbackUrl,
    })
  }

  return result
}

export function getLocalizedNotificationPayload(
  localizedMessages,
  notificationLanguage,
) {
  const language = getNotificationLanguage(notificationLanguage)
  return localizedMessages?.[language] || localizedMessages?.tr
}

export async function fetchAllPages(fetchPage, options = {}) {
  const {
    pageSize = BROADCAST_PAGE_SIZE,
    maxRows = MAX_BROADCAST_SUBSCRIPTIONS,
    label = 'Kayıtlar',
  } = options
  const rows = []
  let expectedCount = null

  while (expectedCount === null || rows.length < expectedCount) {
    const remainingExpected = expectedCount === null
      ? pageSize
      : Math.min(pageSize, expectedCount - rows.length)
    const from = rows.length
    const to = from + Math.max(1, remainingExpected) - 1
    const { data, error, count } = await fetchPage(from, to)

    if (error) {
      throw new NotificationBackendError(error.message || `${label} okunamadı.`)
    }

    if (expectedCount === null && Number.isInteger(count)) {
      expectedCount = count

      if (expectedCount > maxRows) {
        throw new NotificationBackendError(
          `${label} güvenli gönderim sınırını aşıyor (${expectedCount}/${maxRows}).`,
          503,
        )
      }
    }

    const pageRows = Array.isArray(data) ? data : []
    rows.push(...pageRows)

    if (rows.length > maxRows) {
      throw new NotificationBackendError(
        `${label} güvenli gönderim sınırını aşıyor (${rows.length}/${maxRows}).`,
        503,
      )
    }

    if (expectedCount !== null) {
      if (rows.length >= expectedCount) break

      if (pageRows.length === 0) {
        throw new NotificationBackendError(`${label} sayfalaması tamamlanamadı.`)
      }

      continue
    }

    if (pageRows.length < remainingExpected) break
  }

  return rows
}

function fetchTablePages(supabaseAdmin, {
  table,
  columns,
  label,
  maxRows = MAX_BROADCAST_SUBSCRIPTIONS,
  applyFilters,
}) {
  return fetchAllPages(
    (from, to) => {
      let query = supabaseAdmin
        .from(table)
        .select(columns, { count: 'exact' })

      if (applyFilters) {
        query = applyFilters(query)
      }

      return query.order('id', { ascending: true }).range(from, to)
    },
    { label, maxRows },
  )
}

async function fetchRowsForValues(supabaseAdmin, {
  table,
  columns,
  filterColumn,
  values,
  label,
}) {
  const uniqueValues = [...new Set((values || []).filter(isNotBlank))]
  const rows = []

  for (let index = 0; index < uniqueValues.length; index += LOOKUP_BATCH_SIZE) {
    const batch = uniqueValues.slice(index, index + LOOKUP_BATCH_SIZE)
    const batchRows = await fetchTablePages(supabaseAdmin, {
      table,
      columns,
      label,
      maxRows: MAX_LOOKUP_ROWS,
      applyFilters: (query) => query.in(filterColumn, batch),
    })

    rows.push(...batchRows)

    if (rows.length > MAX_LOOKUP_ROWS) {
      throw new NotificationBackendError(
        `${label} güvenli sorgu sınırını aşıyor.`,
        503,
      )
    }
  }

  return rows
}

function deviceKey(userId, deviceHash) {
  return `${String(userId || '')}:${String(deviceHash || '').trim()}`
}

export function filterEligibleNotificationTargets({
  webSubscriptions = [],
  nativeSubscriptions = [],
  profiles = [],
  userDevices = [],
} = {}) {
  const activeUserIds = new Set(
    profiles
      .filter((profile) => profile?.id && profile.is_active !== false)
      .map((profile) => profile.id),
  )
  const deviceStatusByKey = new Map()
  const usersWithRevokedDevices = new Set()

  for (const device of userDevices) {
    if (!device?.user_id || !device?.device_hash) continue
    deviceStatusByKey.set(
      deviceKey(device.user_id, device.device_hash),
      device.status,
    )

    if (device.status === 'revoked') {
      usersWithRevokedDevices.add(device.user_id)
    }
  }

  const eligibleWebSubscriptions = []
  const eligibleNativeSubscriptions = []
  const skipped = {
    inactiveProfile: 0,
    revokedDevice: 0,
    missingDevice: 0,
    legacyUnmappedDevice: 0,
  }

  for (const subscription of webSubscriptions) {
    if (!activeUserIds.has(subscription?.user_id)) {
      skipped.inactiveProfile += 1
      continue
    }

    eligibleWebSubscriptions.push(subscription)
  }

  for (const subscription of nativeSubscriptions) {
    if (!activeUserIds.has(subscription?.user_id)) {
      skipped.inactiveProfile += 1
      continue
    }

    const deviceHash = String(subscription?.device_hash || '').trim()

    if (!deviceHash) {
      if (usersWithRevokedDevices.has(subscription.user_id)) {
        skipped.legacyUnmappedDevice += 1
        continue
      }

      eligibleNativeSubscriptions.push(subscription)
      continue
    }

    const deviceStatus = deviceStatusByKey.get(
      deviceKey(subscription.user_id, deviceHash),
    )

    if (deviceStatus === 'revoked') {
      skipped.revokedDevice += 1
      continue
    }

    if (!deviceStatus) {
      skipped.missingDevice += 1
      continue
    }

    eligibleNativeSubscriptions.push(subscription)
  }

  return {
    webSubscriptions: eligibleWebSubscriptions,
    nativeSubscriptions: eligibleNativeSubscriptions,
    skipped,
    storedTotal: webSubscriptions.length + nativeSubscriptions.length,
  }
}

async function fetchSubscriptionRows(supabaseAdmin, {
  table,
  baseColumns,
  optionalColumns = [],
  label,
  applyFilters,
}) {
  let selectedOptionalColumns = [...optionalColumns]

  while (true) {
    try {
      const rows = await fetchTablePages(supabaseAdmin, {
        table,
        columns: [...baseColumns, ...selectedOptionalColumns].join(', '),
        label,
        applyFilters,
      })
      const missingColumns = optionalColumns.filter(
        (column) => !selectedOptionalColumns.includes(column),
      )

      return rows.map((row) => ({
        ...row,
        ...Object.fromEntries(missingColumns.map((column) => [column, null])),
      }))
    } catch (error) {
      const message = String(error?.message || error || '')
      const missingColumn = selectedOptionalColumns.find((column) =>
        message.includes(column),
      )

      if (!missingColumn) throw error

      selectedOptionalColumns = selectedOptionalColumns.filter(
        (column) => column !== missingColumn,
      )
    }
  }
}

export function limitNotificationTargetsToLatest(targets = {}) {
  const webSubscriptions = targets.webSubscriptions || []
  const nativeSubscriptions = targets.nativeSubscriptions || []
  const candidates = [
    ...webSubscriptions.map((item) => ({ item, type: 'web' })),
    ...nativeSubscriptions.map((item) => ({ item, type: 'native' })),
  ]

  if (candidates.length <= 1) {
    return targets
  }

  const latest = candidates.reduce((currentLatest, candidate) => {
    const candidateTime = new Date(
      candidate.item.updated_at || candidate.item.created_at || 0,
    ).getTime()
    const latestTime = new Date(
      currentLatest.item.updated_at || currentLatest.item.created_at || 0,
    ).getTime()

    return candidateTime > latestTime ? candidate : currentLatest
  })

  return {
    ...targets,
    webSubscriptions: latest.type === 'web' ? [latest.item] : [],
    nativeSubscriptions: latest.type === 'native' ? [latest.item] : [],
    skipped: {
      ...(targets.skipped || {}),
      otherDevices:
        Number(targets.skipped?.otherDevices || 0) + candidates.length - 1,
    },
  }
}

async function loadNotificationTargets(
  supabaseAdmin,
  { targetUserId, singleDevice = false } = {},
) {
  const applyTargetFilter = targetUserId
    ? (query) => query.eq('user_id', targetUserId)
    : undefined
  const webSubscriptions = await fetchSubscriptionRows(supabaseAdmin, {
    table: 'push_subscriptions',
    baseColumns: [
      'id',
      'user_id',
      'endpoint',
      'subscription',
      'user_agent',
      'created_at',
      'updated_at',
    ],
    optionalColumns: ['notification_language'],
    label: 'Web Push kayıtları',
    applyFilters: applyTargetFilter,
  })
  const nativeSubscriptions = await fetchSubscriptionRows(supabaseAdmin, {
    table: 'native_push_subscriptions',
    baseColumns: [
      'id',
      'user_id',
      'platform',
      'token',
      'device_name',
      'app_version',
      'created_at',
      'updated_at',
    ],
    optionalColumns: ['device_hash', 'notification_language'],
    label: 'Yerel bildirim kayıtları',
    applyFilters: applyTargetFilter,
  })

  const storedTotal = webSubscriptions.length + nativeSubscriptions.length

  if (storedTotal > MAX_BROADCAST_SUBSCRIPTIONS) {
    throw new NotificationBackendError(
      `Toplam bildirim kaydı güvenli gönderim sınırını aşıyor (${storedTotal}/${MAX_BROADCAST_SUBSCRIPTIONS}).`,
      503,
    )
  }

  const userIds = [
    ...webSubscriptions.map((item) => item.user_id),
    ...nativeSubscriptions.map((item) => item.user_id),
  ]
  const nativeUserIds = nativeSubscriptions.map((item) => item.user_id)
  const [profiles, userDevices] = await Promise.all([
    fetchRowsForValues(supabaseAdmin, {
      table: 'profiles',
      columns: 'id, is_active',
      filterColumn: 'id',
      values: userIds,
      label: 'Bildirim kullanıcıları',
    }),
    fetchRowsForValues(supabaseAdmin, {
      table: 'user_devices',
      columns: 'id, user_id, device_hash, status',
      filterColumn: 'user_id',
      values: nativeUserIds,
      label: 'Bildirim cihazları',
    }),
  ])

  const targets = filterEligibleNotificationTargets({
    webSubscriptions,
    nativeSubscriptions,
    profiles,
    userDevices,
  })

  return targetUserId && singleDevice
    ? limitNotificationTargetsToLatest(targets)
    : targets
}

export function getDeliveryResponseStatus({ total, sent, failed }) {
  return total > 0 && sent === 0 && failed > 0 ? 502 : 200
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
  const authorization =
    req.headers?.authorization || req.headers?.Authorization || ''
  const secretIsValid =
    isNotBlank(notificationAdminSecret) &&
    (
      secretsMatch(secret, notificationAdminSecret) ||
      secretsMatch(authorization, `Bearer ${notificationAdminSecret}`)
    )

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

async function recordNotificationDelivery(
  supabaseAdmin,
  {
    source,
    automationId,
    automationRunId,
    createdBy,
    targetUserId,
    payload,
    localizedMessages,
    total,
    sent,
    failed,
  },
) {
  try {
    const { error } = await supabaseAdmin
      .from('notification_delivery_logs')
      .insert({
        source,
        automation_id: automationId,
        automation_run_id: automationRunId,
        created_by: createdBy,
        target_user_id: targetUserId,
        title: payload.title,
        body: payload.body,
        localized_messages: localizedMessages,
        total,
        sent,
        failed,
      })

    if (error) {
      console.error('Bildirim teslim kaydı oluşturulamadı.', {
        code: error.code || null,
      })
    }
  } catch {
    // Bildirim başarıyla gönderildiyse geçmiş kaydı gönderimi başarısız yapmamalı.
  }
}

async function verifyClaimedAutomationRun(
  supabaseAdmin,
  { automationId, automationRunId },
) {
  if (!automationId || !automationRunId) return

  const { data, error } = await supabaseAdmin
    .from('notification_automation_runs')
    .select('id, status')
    .eq('id', automationRunId)
    .eq('automation_id', automationId)
    .maybeSingle()

  if (error) {
    throw new NotificationBackendError(
      'Otomasyon çalıştırma kaydı doğrulanamadı.',
      500,
    )
  }

  if (!data || data.status !== 'started') {
    throw new NotificationBackendError(
      'Otomasyon çalıştırma kaydı geçerli değil.',
      409,
    )
  }
}

export default async function handler(req, res) {
  let scheduledMotivation = null
  let scheduledSupabaseAdmin = null
  let scheduledRunClaimed = false
  let scheduledSent = 0

  if (handleCors(req, res)) {
    return
  }

  try {
    const isCronRequest = req.method === 'GET'

    if (!isCronRequest && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS')
      return res.status(405).json({
        error: 'Yalnızca GET ve POST istekleri desteklenir.',
      })
    }

    scheduledMotivation = isCronRequest
      ? getAuthorizedCronMotivation(req)
      : null

    if (isCronRequest && scheduledMotivation?.skipped) {
      return res.status(200).json(scheduledMotivation)
    }

    let bodyData = req.body || {}

    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData)
      } catch {
        throw new NotificationBackendError('İstek içeriği geçersiz.', 400)
      }
    }

    const requestData = scheduledMotivation || bodyData
    const { secret, title, body, url, localizedMessages } = requestData

    const vapidPublicKey = getVapidPublicKey()
    const vapidPrivateKey = getVapidPrivateKey()
    const vapidSubject = getVapidSubject()

    const supabaseAdmin = createSupabaseAdminClient()
    scheduledSupabaseAdmin = isCronRequest ? supabaseAdmin : null
    const authResult = isCronRequest
      ? { ok: true, method: 'scheduled_motivation', userId: null }
      : await verifyAdminRequest(req, secret)

    if (!authResult.ok) {
      return res.status(authResult.statusCode || 401).json({
        error: authResult.error || 'Yetkisiz istek.',
      })
    }

    const targetUserId = isCronRequest
      ? null
      : normalizeNotificationTargetUserId(requestData.targetUserId)
    const singleDevice = Boolean(targetUserId && requestData.singleDevice === true)
    const automationId = isCronRequest
      ? null
      : normalizeNotificationAutomationId(requestData.automationId)
    const automationRunId = isCronRequest
      ? null
      : normalizeNotificationAutomationId(
        requestData.automationRunId,
        'Otomasyon çalıştırma',
      )

    if (
      (automationId || automationRunId) &&
      authResult.method !== 'secret'
    ) {
      throw new NotificationBackendError(
        'Otomasyon gönderim bilgisi yalnızca zamanlayıcı tarafından kullanılabilir.',
        403,
      )
    }

    if (Boolean(automationId) !== Boolean(automationRunId)) {
      throw new NotificationBackendError(
        'Otomasyon gönderim bilgisi eksik.',
        400,
      )
    }

    await verifyClaimedAutomationRun(supabaseAdmin, {
      automationId,
      automationRunId,
    })

    if (
      // A dispatcher request is already protected by its unique database run
      // claim; the human/manual send throttle must not block another schedule.
      !automationId &&
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

    if (scheduledMotivation) {
      const claim = await claimDailyMotivationRun(
        supabaseAdmin,
        scheduledMotivation,
      )

      if (!claim.claimed) {
        return res.status(200).json({
          skipped: true,
          reason: claim.reason,
          scheduledMotivation: {
            date: scheduledMotivation.date,
            messageId: scheduledMotivation.messageId,
          },
        })
      }

      scheduledRunClaimed = true
    }

    const localizedPayloads = scheduledMotivation
      ? null
      : validateLocalizedNotificationPayloads(localizedMessages, {
        fallbackUrl: url,
      })
    const payloadData = localizedPayloads?.en ||
      validateNotificationPayload({ title, body, url })
    const scheduledPayloads = new Map()
    const getPayloadForTarget = (target) => {
      if (localizedPayloads) {
        return getLocalizedNotificationPayload(
          localizedPayloads,
          target?.notification_language,
        )
      }

      if (!scheduledMotivation) {
        return payloadData
      }

      const notificationLanguage = getNotificationLanguage(
        target?.notification_language,
      )

      if (!scheduledPayloads.has(notificationLanguage)) {
        scheduledPayloads.set(
          notificationLanguage,
          getScheduledNotificationPayload(
            scheduledMotivation,
            notificationLanguage,
          ),
        )
      }

      return scheduledPayloads.get(notificationLanguage)
    }

    const {
      webSubscriptions,
      nativeSubscriptions,
      skipped,
      storedTotal,
    } = await loadNotificationTargets(supabaseAdmin, {
      targetUserId,
      singleDevice,
    })
    const androidSubscriptions = nativeSubscriptions.filter(
      (item) => !item.platform || item.platform === 'android',
    )
    const iosSubscriptions = nativeSubscriptions.filter(
      (item) => item.platform === 'ios',
    )
    const iosSandboxSubscriptions = nativeSubscriptions.filter(
      (item) => item.platform === 'ios-sandbox',
    )
    const totalSubscriptions = webSubscriptions.length + nativeSubscriptions.length

    if (totalSubscriptions === 0) {
      if (scheduledMotivation) {
        await finishDailyMotivationRun(supabaseAdmin, scheduledMotivation, {
          status: 'completed',
          summary: { total: 0, sent: 0, failed: 0 },
        })
      }

      await recordNotificationDelivery(supabaseAdmin, {
        source: scheduledMotivation
          ? 'daily_motivation'
          : automationId ? 'automation' : 'manual',
        automationId,
        automationRunId,
        createdBy: authResult.userId,
        targetUserId,
        payload: payloadData,
        localizedMessages:
          localizedPayloads || scheduledMotivation?.messages || null,
        total: 0,
        sent: 0,
        failed: 0,
      })

      return res.status(200).json({
        total: 0,
        sent: 0,
        failed: 0,
        deleted: 0,
        storedTotal,
        skipped,
        message: 'Uygun kayıtlı bildirim cihazı yok.',
      })
    }

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

        const webResults = await mapWithConcurrency(
          webSubscriptions,
          WEB_PUSH_SEND_CONCURRENCY,
          async (item) => {
            try {
              await webPush.sendNotification(
                item.subscription,
                JSON.stringify(getPayloadForTarget(item)),
              )
              return { item, ok: true }
            } catch (sendError) {
              return {
                item,
                ok: false,
                sendError,
                shouldDelete:
                  sendError.statusCode === 404 || sendError.statusCode === 410,
              }
            }
          },
        )

        webResults.forEach((result) => {
          if (result.ok) {
            sent += 1
            webSent += 1
            if (scheduledMotivation) scheduledSent += 1
            return
          }

          failed += 1
          failedDetails.push({
            id: result.item.id,
            provider: 'web-push',
            endpointStart: result.item.endpoint
              ? String(result.item.endpoint).slice(0, 80)
              : null,
            userAgent: result.item.user_agent || null,
            createdAt: result.item.created_at || null,
            error: makeSafeError(result.sendError),
          })

          if (result.shouldDelete) {
            deletedWebIds.push(result.item.id)
          }
        })
      }
    }

    if (androidSubscriptions.length > 0) {
      try {
        const { accessToken, projectId } = await getFirebaseAccessToken(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
        )
        const nativeResults = await mapWithConcurrency(
          androidSubscriptions,
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
              const targetPayload = getPayloadForTarget(item)
              const response = await sendFcmHttpRequest({
                accessToken,
                projectId,
                message: createFcmMessage({
                  token,
                  title: targetPayload.title,
                  body: targetPayload.body,
                  url: targetPayload.url,
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
            if (scheduledMotivation) scheduledSent += 1
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
        failed += androidSubscriptions.length
        failedDetails.push({
          provider: 'fcm',
          affected: androidSubscriptions.length,
          error: {
            message: firebaseError.message || 'FCM yapılandırma hatası',
          },
        })
      }
    }

    const sendApnsGroup = async (subscriptions, environment) => {
      if (subscriptions.length === 0) {
        return
      }

      const providerName =
        environment === 'sandbox' ? 'apns-sandbox' : 'apns-production'

      try {
        const configuration = readApnsConfiguration(process.env, environment)
        const providerToken = getApnsProviderToken(configuration)

        const apnsResults = await withApnsClient({
          environment,
          task: (client) =>
            mapWithConcurrency(
              subscriptions,
              APNS_SEND_CONCURRENCY,
              async (item) => {
                try {
                  const apnsPayload = createApnsPayload(
                    getPayloadForTarget(item),
                  )
                  const response = await sendApnsHttpRequest({
                    client,
                    token: item.token,
                    providerToken,
                    bundleId: configuration.bundleId,
                    payload: apnsPayload,
                  })

                  return {
                    item,
                    ...response,
                    shouldDelete: isPermanentApnsTokenFailure(
                      response.statusCode,
                      response.reason,
                    ),
                  }
                } catch (sendError) {
                  return {
                    item,
                    ok: false,
                    statusCode: null,
                    reason: 'NETWORK_ERROR',
                    message: sendError.message || 'APNs ağ hatası',
                    shouldDelete: false,
                  }
                }
              },
            ),
        })

        apnsResults.forEach((result) => {
          if (result.ok) {
            sent += 1
            nativeSent += 1
            if (scheduledMotivation) scheduledSent += 1
            return
          }

          failed += 1
          failedDetails.push({
            id: result.item.id,
            provider: providerName,
            userAgent: result.item.device_name || null,
            createdAt: result.item.created_at || null,
            error: {
              message: result.message || 'APNs gönderim hatası',
              code: result.reason,
              statusCode: result.statusCode,
            },
          })

          if (result.shouldDelete) {
            deletedNativeIds.push(result.item.id)
          }
        })
      } catch (apnsError) {
        failed += subscriptions.length
        failedDetails.push({
          provider: providerName,
          affected: subscriptions.length,
          error: {
            message: apnsError.message || 'APNs yapılandırma hatası',
          },
        })
      }
    }

    await sendApnsGroup(iosSubscriptions, 'production')
    await sendApnsGroup(iosSandboxSubscriptions, 'sandbox')

    const [webCleanup, nativeCleanup] = await Promise.all([
      cleanupInvalidSubscriptionIds(supabaseAdmin, {
        table: 'push_subscriptions',
        ids: deletedWebIds,
        provider: 'web-push',
      }),
      cleanupInvalidSubscriptionIds(supabaseAdmin, {
        table: 'native_push_subscriptions',
        ids: deletedNativeIds,
        provider: 'native-push',
      }),
    ])
    const cleanup = {
      requested: webCleanup.requested + nativeCleanup.requested,
      deleted: webCleanup.deleted + nativeCleanup.deleted,
      failed: webCleanup.failed + nativeCleanup.failed,
    }
    failedDetails.push(...webCleanup.errors, ...nativeCleanup.errors)

    const responseStatus = getDeliveryResponseStatus({
      total: totalSubscriptions,
      sent,
      failed,
    })
    const responsePayload = {
      total: totalSubscriptions,
      storedTotal,
      sent,
      failed,
      webSent,
      nativeSent,
      skipped,
      deleted: cleanup.deleted,
      cleanupFailed: cleanup.failed,
      cleanup,
      authMethod: authResult.method,
      targeted: Boolean(targetUserId),
      singleDevice,
      vapidPublicKeyLength: vapidPublicKey.length,
      vapidSubject,
      failedDetails,
    }

    if (scheduledMotivation) {
      responsePayload.scheduledMotivation = {
        date: scheduledMotivation.date,
        messageId: scheduledMotivation.messageId,
        attempt: scheduledMotivation.scheduleAttempt,
      }

      await finishDailyMotivationRun(supabaseAdmin, scheduledMotivation, {
        status: getDailyMotivationRunStatus({ sent, failed }),
        summary: {
          total: responsePayload.total,
          sent: responsePayload.sent,
          failed: responsePayload.failed,
        },
      })
    }

    await recordNotificationDelivery(supabaseAdmin, {
      source: scheduledMotivation
        ? 'daily_motivation'
        : automationId ? 'automation' : 'manual',
      automationId,
      automationRunId,
      createdBy: authResult.userId,
      targetUserId,
      payload: payloadData,
      localizedMessages:
        localizedPayloads || scheduledMotivation?.messages || null,
      total: responsePayload.total,
      sent: responsePayload.sent,
      failed: responsePayload.failed,
    })

    if (responseStatus !== 200) {
      responsePayload.error = 'Bildirim hiçbir uygun cihaza teslim edilemedi.'
    }

    return res.status(responseStatus).json(responsePayload)
  } catch (error) {
    if (
      scheduledRunClaimed &&
      scheduledMotivation &&
      scheduledSupabaseAdmin
    ) {
      await finishDailyMotivationRun(
        scheduledSupabaseAdmin,
        scheduledMotivation,
        {
          status: getDailyMotivationRunStatus({
            sent: scheduledSent,
            failed: 1,
          }),
        },
      )
    }

    return res.status(error.statusCode || 500).json({
      error: error.message || 'Bildirim gönderilemedi.',
    })
  }
}
