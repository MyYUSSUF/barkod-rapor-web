import { randomUUID } from 'node:crypto'
import { readNotificationData, withNotificationTimeout, notificationErrorDiagnostics, safeNotificationDatabaseCode } from './_notification-retry.js'

const TABLE = 'notification_automation_runs'
export const MAX_NOTIFICATION_RUN_ATTEMPTS = 3
const TOKEN_PATTERN = /^[0-9a-f-]{36}$/i

export class NotificationRunError extends Error {
  constructor(code, statusCode = 503, databaseError, metadata = {}) {
    super(code === 'RUN_CONFLICT'
      ? 'Bildirim çalışması daha önce başlatılmış veya kapatılmış.'
      : 'Bildirim çalışma kaydı doğrulanamadı; gönderim durduruldu.')
    this.code = code
    this.statusCode = statusCode
    // Preserve only structured error codes, never DB messages/details or row values.
    const databaseCode = safeNotificationDatabaseCode(databaseError?.code)
    if (databaseCode) this.databaseCode = databaseCode
    const diagnostic = notificationErrorDiagnostics({ ...databaseError, cause: databaseError?.cause, ...metadata })
    for (const key of ['httpStatus', 'failureKind', 'elapsedMs', 'timeoutMs', 'networkCode', 'attempts']) {
      if (diagnostic[key] != null) this[key] = diagnostic[key]
    }
  }
}

// No write retry: a timeout can mean the write committed but its response was lost.
async function writeRun(operation) {
  const startedAt = Date.now()
  try {
    const result = await withNotificationTimeout(operation, 5000, 'RUN_WRITE_UNCERTAIN')
    return { ...result, diagnostics: {
      httpStatus: result?.status, elapsedMs: Date.now() - startedAt, attempts: 1,
    } }
  } catch (error) {
    throw new NotificationRunError('RUN_WRITE_UNCERTAIN', 503, error, { elapsedMs: Date.now() - startedAt, attempts: 1 })
  }
}

function state(attempt, token, phase, extra = {}) {
  return { protocol: 1, attempt, token, phase, retryable: false, ...extra }
}

function context(row) {
  return { ...row.response, id: row.id, automationId: row.automation_id }
}

export function notificationCounts(payload = {}) {
  return Object.fromEntries(['total', 'sent', 'failed', 'webSent', 'nativeSent', 'deleted'].map((key) => {
    const n = Number(payload[key])
    return [key, Number.isSafeInteger(n) && n >= 0 ? n : 0]
  }))
}

export async function readNotificationRun(db, id) {
  const { data } = await readNotificationData((signal) => db.from(TABLE)
    .select('id, automation_id, status, response, total, sent, failed, error')
    .eq('id', id).abortSignal(signal).maybeSingle())
  return data
}

// Unique occurrence + conditional UPDATE is the lock, not a process-local flag.
export async function claimNotificationRun(db, automationId, scheduledFor, now = new Date()) {
  const token = randomUUID()
  const response = state(1, token, 'claimed')
  const { data, error, diagnostics } = await writeRun((signal) => db.from(TABLE)
    .insert({ automation_id: automationId, scheduled_for: scheduledFor, status: 'started', response })
    .select('id').abortSignal(signal).single())
  if (!error && data?.id) return { id: data.id, automationId, ...response }
  if (error?.code !== '23505') throw new NotificationRunError('RUN_WRITE_UNCERTAIN', 503, error, diagnostics)

  const result = await readNotificationData((signal) => db.from(TABLE)
    .select('id, automation_id, status, response, sent')
    .eq('automation_id', automationId).eq('scheduled_for', scheduledFor)
    .abortSignal(signal).maybeSingle())
  const old = result.data
  const previous = old?.response
  // Legacy failures, unknown outcomes, partial sends and running workers never retry.
  if (old?.status !== 'failed' || old.sent !== 0 || previous?.protocol !== 1 ||
      previous.phase !== 'preflight_failed' || previous.retryable !== true ||
      !TOKEN_PATTERN.test(previous.token || '') || !Number.isInteger(previous.attempt) ||
      previous.attempt < 1 || previous.attempt >= MAX_NOTIFICATION_RUN_ATTEMPTS) return null
  const next = state(previous.attempt + 1, token, 'claimed')
  const claimed = await writeRun((signal) => db.from(TABLE).update({
    status: 'started', response: next, error: null, completed_at: null,
    started_at: now.toISOString(), total: 0, sent: 0, failed: 0,
  }).eq('id', old.id).eq('status', 'failed').eq('sent', 0).eq('response->>protocol', '1')
    .eq('response->>token', previous.token).eq('response->>phase', 'preflight_failed')
    .eq('response->>attempt', String(previous.attempt)).eq('response->>retryable', 'true')
    .select('id').abortSignal(signal).maybeSingle())
  if (claimed.error) throw new NotificationRunError('RUN_WRITE_UNCERTAIN', 503, claimed.error, claimed.diagnostics)
  return claimed.data?.id ? { id: old.id, automationId, ...next } : null
}

async function transition(db, run, nextPhase, {
  status = 'started', summary, error = null, extra = {}, afterDispatchTimeout = false,
} = {}) {
  const counts = summary ? notificationCounts(summary) : null
  const response = state(run.attempt, run.token, nextPhase, { ...counts, ...extra })
  const update = { status, response, error }
  if (counts) Object.assign(update, { total: counts.total, sent: counts.sent, failed: counts.failed })
  if (status !== 'started') update.completed_at = new Date().toISOString()
  const result = await writeRun((signal) => {
    let query = db.from(TABLE).update(update)
      .eq('id', run.id).eq('automation_id', run.automationId)
      .eq('status', afterDispatchTimeout ? 'failed' : 'started')
      .eq('response->>protocol', '1').eq('response->>attempt', String(run.attempt))
      .eq('response->>token', run.token)
      .eq('response->>phase', afterDispatchTimeout ? 'unknown' : run.phase)
    if (afterDispatchTimeout) query = query.eq('response->>sendingStarted', 'true')
    return query.select('id').abortSignal(signal).maybeSingle()
  })
  if (result.error) throw new NotificationRunError('RUN_WRITE_UNCERTAIN', 503, result.error, result.diagnostics)
  if (!result.data?.id) throw new NotificationRunError('RUN_CONFLICT', 409)
  Object.assign(run, response)
}

export async function beginNotificationRun(db, { automationId, automationRunId, automationAttemptToken }) {
  if (!automationId && !automationRunId) return null
  if (!TOKEN_PATTERN.test(automationAttemptToken || '')) throw new NotificationRunError('RUN_CONFLICT', 409)
  const row = await readNotificationRun(db, automationRunId)
  if (row?.automation_id !== automationId || row.status !== 'started' ||
      row.response?.protocol !== 1 || row.response.token !== automationAttemptToken ||
      row.response.phase !== 'claimed') throw new NotificationRunError('RUN_CONFLICT', 409)
  const run = context(row)
  await transition(db, run, 'preflight')
  return run
}

export async function markNotificationSending(db, run, total) {
  // The SQL counters describe resolved outcomes (sent + failed = total).
  // Pending targets must not enter those counters before any provider has run.
  if (run) await transition(db, run, 'sending', { extra: { sendingStarted: true, plannedTotal: total } })
}

export async function finishNotificationRun(db, run, summary, extra = {}) {
  if (!run) return
  const outcome = {
    status: summary.total > 0 && summary.sent === 0 ? 'failed' : 'completed', summary, extra,
  }
  try {
    await transition(db, run, 'finished', outcome)
  } catch (error) {
    if (error.code !== 'RUN_CONFLICT' || run.phase !== 'sending') throw error
    // The same gated sender may confirm its result after the HTTP caller timed out.
    // This never reopens sending or changes a newer attempt or terminal outcome.
    await transition(db, run, 'finished', { ...outcome, afterDispatchTimeout: true })
  }
}

export async function failNotificationRun(db, run, error) {
  if (!run) return
  // Only this sender, still before the durable sending gate, can certify zero sends.
  const preflightFailure = run.phase === 'preflight' && error?.retryable === true
  const safeRetry = preflightFailure && run.attempt < MAX_NOTIFICATION_RUN_ATTEMPTS
  await transition(db, run, preflightFailure ? 'preflight_failed' : 'unknown', {
    status: 'failed', error: preflightFailure
      ? safeRetry ? 'Gönderim başlamadan veri okuma hatası; güvenli tekrar denenecek.'
        : 'Gönderim başlamadan veri okuma hatası; üç deneme sınırına ulaşıldı.'
      : 'Gönderim sonucu kesinleştirilemedi; mükerrer gönderimi önlemek için tekrar kapalı.',
    extra: { retryable: safeRetry, errorCode: preflightFailure ? 'PREFLIGHT_UNAVAILABLE' : 'SEND_UNCONFIRMED' },
  })
}

export async function markNotificationDispatchUnknown(db, run) {
  // Fence unsent work first. Only an already gated sender retains permission to
  // write its eventual outcome; neither unknown state permits another send.
  for (const phases of [['claimed', 'preflight'], ['sending']]) {
    const result = await writeRun((signal) => db.from(TABLE).update({
      status: 'failed', completed_at: new Date().toISOString(),
      response: state(run.attempt, run.token, 'unknown', { sendingStarted: phases[0] === 'sending' }),
      error: 'Gönderim sonucu doğrulanamadı; otomatik tekrar kapalı.',
    }).eq('id', run.id).eq('automation_id', run.automationId).eq('status', 'started')
      .eq('response->>protocol', '1').eq('response->>attempt', String(run.attempt))
      .eq('response->>token', run.token).in('response->>phase', phases)
      .select('id').abortSignal(signal).maybeSingle())
    if (result.error) throw new NotificationRunError('RUN_WRITE_UNCERTAIN', 503, result.error, result.diagnostics)
    if (result.data?.id) return
  }
}
