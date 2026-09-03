import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { handleCors } from './_cors.js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import {
  findDueAutomationOccurrence,
  getAutomationNotificationPayload,
  normalizeAutomationId,
  normalizeAutomationInput,
  NotificationAutomationError,
  serializeAutomation,
} from './_notification-automation.js'
import { enforceRequestLimit } from './_rate-limit.js'

const AUTOMATION_SELECT = [
  'id',
  'system_key',
  'name',
  'content_type',
  'audience_type',
  'target_user_id',
  'delivery_scope',
  'timezone',
  'send_time',
  'days_of_week',
  'title_tr',
  'body_tr',
  'title_en',
  'body_en',
  'url',
  'is_active',
  'created_by',
  'created_at',
  'updated_at',
].join(', ')

const RUN_SELECT = [
  'id',
  'automation_id',
  'scheduled_for',
  'status',
  'total',
  'sent',
  'failed',
  'error',
  'started_at',
  'completed_at',
].join(', ')

const DELIVERY_SELECT = [
  'id',
  'source',
  'automation_id',
  'automation_run_id',
  'created_by',
  'target_user_id',
  'title',
  'body',
  'localized_messages',
  'total',
  'sent',
  'failed',
  'created_at',
].join(', ')

const MAX_HISTORY_ROWS = 50

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function getHeader(req, name) {
  const headers = req?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || ''
}

function secretsMatch(actual, expected) {
  if (!isNotBlank(actual) || !isNotBlank(expected)) return false

  const actualBuffer = Buffer.from(String(actual))
  const expectedBuffer = Buffer.from(String(expected))

  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
}

function parseBody(req) {
  if (!req?.body) return {}

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      throw new NotificationAutomationError('İstek içeriği geçersiz.')
    }
  }

  return req.body
}

function createSupabaseAdminClient(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!isNotBlank(supabaseUrl) || !isNotBlank(serviceRoleKey)) {
    throw new NotificationAutomationError(
      'Bildirim otomasyonu sunucu ayarları eksik.',
      503,
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function isAuthorizedAutomationCron(req, env = process.env) {
  const cronSecret = env.CRON_SECRET

  if (!isNotBlank(cronSecret)) return false

  return secretsMatch(
    getHeader(req, 'authorization'),
    `Bearer ${cronSecret}`,
  )
}

export function getNotificationSendEndpoint(env = process.env) {
  const configuredUrl = String(
    env.PUBLIC_APP_URL || env.APP_BASE_URL || env.SITE_URL || '',
  ).trim()
  const vercelUrl = String(env.VERCEL_URL || '').trim()
  const baseUrl = configuredUrl ||
    (vercelUrl ? `https://${vercelUrl}` : 'https://barkod-rapor-web.vercel.app')

  let parsedUrl

  try {
    parsedUrl = new URL('/api/send-notification', baseUrl)
  } catch {
    throw new NotificationAutomationError(
      'Bildirim gönderim adresi geçersiz.',
      503,
    )
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new NotificationAutomationError(
      'Bildirim gönderim adresi geçersiz.',
      503,
    )
  }

  return parsedUrl.toString()
}

async function assertActiveTargetUser(supabaseAdmin, targetUserId) {
  if (!targetUserId) return

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, is_active')
    .eq('id', targetUserId)
    .maybeSingle()

  if (error) {
    throw new NotificationAutomationError(
      'Hedef kullanıcı doğrulanamadı.',
      500,
    )
  }

  if (!data || data.is_active === false) {
    throw new NotificationAutomationError(
      'Aktif bir hedef kullanıcı seçilmelidir.',
      400,
    )
  }
}

async function listNotificationCenter(supabaseAdmin) {
  const [automationsResult, runsResult, deliveriesResult] = await Promise.all([
    supabaseAdmin
      .from('notification_automations')
      .select(AUTOMATION_SELECT)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('notification_automation_runs')
      .select(RUN_SELECT)
      .order('started_at', { ascending: false })
      .limit(MAX_HISTORY_ROWS),
    supabaseAdmin
      .from('notification_delivery_logs')
      .select(DELIVERY_SELECT)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_ROWS),
  ])

  const firstError =
    automationsResult.error || runsResult.error || deliveriesResult.error

  if (firstError) {
    throw new NotificationAutomationError(
      'Bildirim merkezi verileri alınamadı.',
      500,
    )
  }

  return {
    automations: (automationsResult.data || []).map(serializeAutomation),
    runs: runsResult.data || [],
    deliveries: deliveriesResult.data || [],
  }
}

async function createAutomation(supabaseAdmin, authResult, body) {
  const automation = normalizeAutomationInput(body)
  await assertActiveTargetUser(supabaseAdmin, automation.target_user_id)

  const { data, error } = await supabaseAdmin
    .from('notification_automations')
    .insert({
      ...automation,
      created_by: authResult.userId,
    })
    .select(AUTOMATION_SELECT)
    .single()

  if (error) {
    throw new NotificationAutomationError('Otomasyon oluşturulamadı.', 500)
  }

  return serializeAutomation(data)
}

async function updateAutomation(supabaseAdmin, body) {
  const automationId = normalizeAutomationId(body.id || body.automationId)
  const activeValue = body.isActive ?? body.is_active
  let updatePayload

  if (body.action === 'set_active') {
    if (typeof activeValue !== 'boolean') {
      throw new NotificationAutomationError('Otomasyon durumu geçersiz.')
    }

    updatePayload = { is_active: activeValue }
  } else {
    updatePayload = normalizeAutomationInput(body)
    await assertActiveTargetUser(
      supabaseAdmin,
      updatePayload.target_user_id,
    )
  }

  const { data, error } = await supabaseAdmin
    .from('notification_automations')
    .update({
      ...updatePayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', automationId)
    .select(AUTOMATION_SELECT)
    .maybeSingle()

  if (error) {
    throw new NotificationAutomationError('Otomasyon güncellenemedi.', 500)
  }

  if (!data) {
    throw new NotificationAutomationError('Otomasyon bulunamadı.', 404)
  }

  return serializeAutomation(data)
}

async function deleteAutomation(supabaseAdmin, body) {
  const automationId = normalizeAutomationId(body.id || body.automationId)
  const { data, error } = await supabaseAdmin
    .from('notification_automations')
    .delete()
    .eq('id', automationId)
    .select('id, name')
    .maybeSingle()

  if (error) {
    throw new NotificationAutomationError('Otomasyon silinemedi.', 500)
  }

  if (!data) {
    throw new NotificationAutomationError('Otomasyon bulunamadı.', 404)
  }

  return data
}

async function claimAutomationRun(supabaseAdmin, automationId, scheduledFor) {
  const { data, error } = await supabaseAdmin
    .from('notification_automation_runs')
    .insert({
      automation_id: automationId,
      scheduled_for: scheduledFor,
      status: 'started',
    })
    .select('id')
    .single()

  if (error?.code === '23505') return null

  if (error || !data?.id) {
    throw new NotificationAutomationError(
      'Otomasyon çalıştırma kaydı oluşturulamadı.',
      500,
    )
  }

  return data
}

function getSafeDeliverySummary(payload = {}) {
  return {
    total: Number(payload.total) || 0,
    sent: Number(payload.sent) || 0,
    failed: Number(payload.failed) || 0,
    webSent: Number(payload.webSent) || 0,
    nativeSent: Number(payload.nativeSent) || 0,
    deleted: Number(payload.deleted) || 0,
  }
}

async function finishAutomationRun(
  supabaseAdmin,
  runId,
  { status, summary = {}, errorMessage = null },
) {
  const counts = getSafeDeliverySummary(summary)
  const { error } = await supabaseAdmin
    .from('notification_automation_runs')
    .update({
      status,
      total: counts.total,
      sent: counts.sent,
      failed: counts.failed,
      response: counts,
      error: errorMessage ? String(errorMessage).slice(0, 500) : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (error) {
    console.error('Otomasyon sonucu kaydedilemedi.', {
      code: error.code || null,
    })
  }
}

async function dispatchAutomation(
  supabaseAdmin,
  automation,
  scheduledFor,
  { env, fetchImpl },
) {
  const run = await claimAutomationRun(
    supabaseAdmin,
    automation.id,
    scheduledFor,
  )

  if (!run) {
    return {
      automationId: automation.id,
      name: automation.name,
      status: 'skipped',
      reason: 'already_claimed',
    }
  }

  try {
    const notificationAdminSecret = env.NOTIFICATION_ADMIN_SECRET

    if (!isNotBlank(notificationAdminSecret)) {
      throw new NotificationAutomationError(
        'Bildirim gönderim güvenlik ayarı eksik.',
        503,
      )
    }

    const notification = getAutomationNotificationPayload(
      automation,
      new Date(scheduledFor),
    )
    const response = await fetchImpl(getNotificationSendEndpoint(env), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notificationAdminSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.url,
        localizedMessages: notification.localizedMessages,
        targetUserId: automation.target_user_id,
        singleDevice:
          automation.audience_type === 'user' &&
          automation.delivery_scope === 'latest_device',
        automationId: automation.id,
        automationRunId: run.id,
      }),
    })
    let responsePayload = {}

    try {
      responsePayload = await response.json()
    } catch {
      responsePayload = {}
    }

    const summary = getSafeDeliverySummary(responsePayload)

    if (!response.ok) {
      const message = String(
        responsePayload.error || `Bildirim servisi HTTP ${response.status} yanıtı verdi.`,
      ).slice(0, 500)

      await finishAutomationRun(supabaseAdmin, run.id, {
        status: 'failed',
        summary,
        errorMessage: message,
      })

      return {
        automationId: automation.id,
        name: automation.name,
        status: 'failed',
        ...summary,
      }
    }

    await finishAutomationRun(supabaseAdmin, run.id, {
      status: 'completed',
      summary,
    })

    return {
      automationId: automation.id,
      name: automation.name,
      status: 'completed',
      ...summary,
    }
  } catch (error) {
    await finishAutomationRun(supabaseAdmin, run.id, {
      status: 'failed',
      errorMessage: error.message || 'Bildirim otomasyonu çalıştırılamadı.',
    })

    return {
      automationId: automation.id,
      name: automation.name,
      status: 'failed',
      total: 0,
      sent: 0,
      failed: 0,
    }
  }
}

export async function dispatchDueAutomations(
  supabaseAdmin,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = new Date(),
    lookbackMinutes = 5,
  } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new NotificationAutomationError('Bildirim gönderim servisi kullanılamıyor.', 503)
  }

  const { data, error } = await supabaseAdmin
    .from('notification_automations')
    .select(AUTOMATION_SELECT)
    .eq('is_active', true)

  if (error) {
    throw new NotificationAutomationError('Aktif otomasyonlar alınamadı.', 500)
  }

  const dueAutomations = (data || [])
    .map((automation) => ({
      automation: serializeAutomation(automation),
      scheduledFor: findDueAutomationOccurrence(
        automation,
        now,
        lookbackMinutes,
      ),
    }))
    .filter((item) => item.scheduledFor)

  const results = []

  for (const item of dueAutomations) {
    results.push(
      await dispatchAutomation(
        supabaseAdmin,
        item.automation,
        item.scheduledFor,
        { env, fetchImpl },
      ),
    )
  }

  return {
    checkedAt: now.toISOString(),
    due: dueAutomations.length,
    completed: results.filter((item) => item.status === 'completed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
    results,
  }
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  try {
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS')
      return res.status(405).json({
        error: 'Sadece GET, POST, PATCH ve DELETE desteklenir.',
      })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    if (
      ['GET', 'POST'].includes(req.method) &&
      isAuthorizedAutomationCron(req)
    ) {
      const dispatchResult = await dispatchDueAutomations(supabaseAdmin)
      return res.status(200).json({ success: true, ...dispatchResult })
    }

    const authResult = await verifyApprovedDeviceRequest(req, {
      requireAdmin: true,
    })

    if (!authResult.ok) {
      return res.status(authResult.statusCode || 401).json({
        error: authResult.error || 'Yetkisiz istek.',
      })
    }

    const body = parseBody(req)
    const isReadRequest = req.method === 'GET'

    if (
      !enforceRequestLimit(res, {
        scope: isReadRequest
          ? 'notification-automations-read'
          : 'notification-automations-change',
        key: authResult.userId,
        maxRequests: isReadRequest ? 120 : 30,
        windowMs: 60_000,
        minIntervalMs: isReadRequest ? 0 : 250,
        errorMessage:
          'Bildirim otomasyonu işlemi çok hızlı tekrarlandı. Lütfen kısa bir süre bekleyin.',
      })
    ) {
      return
    }

    if (req.method === 'POST') {
      const automation = await createAutomation(
        supabaseAdmin,
        authResult,
        body,
      )
      return res.status(201).json({ success: true, automation })
    }

    if (req.method === 'PATCH') {
      const automation = await updateAutomation(supabaseAdmin, body)
      return res.status(200).json({ success: true, automation })
    }

    if (req.method === 'DELETE') {
      const automation = await deleteAutomation(supabaseAdmin, body)
      return res.status(200).json({ success: true, automation })
    }

    const notificationCenter = await listNotificationCenter(supabaseAdmin)
    return res.status(200).json({ success: true, ...notificationCenter })
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500
    const message = statusCode >= 500
      ? 'Bildirim merkezi işlemi tamamlanamadı.'
      : error.message

    if (statusCode >= 500) {
      console.error('Bildirim merkezi hatası:', {
        name: error?.name || 'Error',
        message: error?.message || 'Bilinmeyen hata',
      })
    }

    return res.status(statusCode).json({ error: message })
  }
}
