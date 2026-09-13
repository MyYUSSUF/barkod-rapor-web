// Allowlisted diagnostic fields only: never log DB messages, response bodies or causes.
const SAFE_CODES = new Set([
  'READ_TIMEOUT', 'READ_UNAVAILABLE', 'READ_REJECTED', 'RUN_WRITE_UNCERTAIN', 'RUN_CONFLICT',
  'DISPATCH_UNCONFIRMED', 'PROVIDER_TIMEOUT', 'PROVIDER_AUTH_TIMEOUT',
  'DELIVERY_RECORD_UNCERTAIN', 'COUNT_UNAVAILABLE',
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
  'WEB_PUSH_ENDPOINT_BLOCKED', 'WEB_PUSH_ADDRESS_BLOCKED', 'WEB_PUSH_DNS_UNAVAILABLE', 'WEB_PUSH_DNS_TIMEOUT',
])
export function safeNotificationDatabaseCode(value) {
  return typeof value === 'string' && /^(?:(?:[0-9][0-9A-Z]|F0|HV|P0|XX)[0-9A-Z]{3}|PGRST\d{3})$/.test(value) ? value : null
}
function safeHttpStatus(value) {
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : null
}
function safeDuration(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 3_600_000 ? value : null
}
export function notificationErrorDiagnostics(error = {}) {
  const databaseCode = safeNotificationDatabaseCode(error?.databaseCode) || safeNotificationDatabaseCode(error?.code)
  const networkCode = [error?.networkCode, error?.code, error?.cause?.code, error?.cause?.cause?.code]
    .find((code) => SAFE_CODES.has(code) && /^(?:E|UND_ERR_)/.test(code)) || null
  const httpStatus = safeHttpStatus(error?.httpStatus) || safeHttpStatus(error?.status)
  return {
    code: SAFE_CODES.has(error?.code) ? error.code : databaseCode || 'NOTIFICATION_ERROR',
    databaseCode,
    httpStatus,
    failureKind: ['deadline', 'database', 'http', 'network', 'unknown'].includes(error?.failureKind)
      ? error.failureKind : databaseCode ? 'database' : httpStatus ? 'http' : networkCode ? 'network' : 'unknown',
    networkCode,
    attempts: Number.isInteger(error?.attempts) && error.attempts >= 1 && error.attempts <= 3 ? error.attempts : null,
    elapsedMs: safeDuration(error?.elapsedMs),
    timeoutMs: safeDuration(error?.timeoutMs),
  }
}

// Only side-effect-free reads may use this retry helper. Never wrap a push send.
export class NotificationReadError extends Error {
  constructor(code, retryable = false) {
    super(retryable ? 'Bildirim verileri geçici olarak okunamadı.' : 'Bildirim verileri okunamadı.')
    this.name = 'NotificationReadError'
    this.code = code
    this.retryable = retryable
    this.statusCode = 503
  }
}

export function isTransientNotificationReadError(error, responseStatus) {
  const code = String(error?.code || error?.cause?.code || '')
  if (['42501', '42P01', '42703', 'PGRST116', 'PGRST204', 'PGRST205', '28000', '28P01'].includes(code)) return false
  return error?.retryable === true ||
    ['READ_TIMEOUT', '57014', '53300', '57P01', '08000', '08006', 'PGRST000', 'PGRST001', 'PGRST002', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code) ||
    [429, 502, 503, 504].includes(Number(responseStatus || error?.status || error?.statusCode)) ||
    /gateway\s*timeout|statement timeout|fetch failed|connection (?:reset|terminated)|service unavailable/i.test(String(error?.message || ''))
}

export async function withNotificationTimeout(operation, timeoutMs, code = 'READ_TIMEOUT') {
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          const error = new NotificationReadError(code, code === 'READ_TIMEOUT')
          Object.assign(error, { failureKind: 'deadline', timeoutMs })
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function readNotificationData(operation, {
  maxAttempts = 3,
  timeoutMs = 4000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const startedAt = Date.now()
  const attempts = Math.min(3, Math.max(1, Math.trunc(maxAttempts) || 1))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let responseStatus
    try {
      const result = await withNotificationTimeout((signal) => {
        const query = operation(signal)
        // One retry budget: SDK retries otherwise multiply attempts and hide DB errors.
        return typeof query?.retry === 'function' ? query.retry(false) : query
      }, timeoutMs)
      // PostgREST returns the HTTP status beside error, including non-JSON gateway failures.
      responseStatus = result?.status
      if (result?.error) throw result.error
      return result
    } catch (error) {
      const retryable = isTransientNotificationReadError(error, responseStatus)
      if (!retryable || attempt === attempts) {
        const safeError = new NotificationReadError(retryable ? 'READ_UNAVAILABLE' : 'READ_REJECTED', retryable)
        const diagnostic = notificationErrorDiagnostics({
          code: error?.code, databaseCode: error?.databaseCode,
          httpStatus: safeHttpStatus(responseStatus) || safeHttpStatus(error?.httpStatus) || safeHttpStatus(error?.status),
          failureKind: error?.failureKind, networkCode: error?.networkCode, cause: error?.cause,
        })
        Object.assign(safeError, {
          databaseCode: diagnostic.databaseCode, httpStatus: diagnostic.httpStatus,
          failureKind: diagnostic.failureKind, networkCode: diagnostic.networkCode,
          attempts: attempt, elapsedMs: Date.now() - startedAt, timeoutMs,
        })
        // Retain the original only for internal legacy-column detection; never log/return it.
        Object.defineProperty(safeError, 'cause', { value: error })
        throw safeError
      }
      await sleep(200 * attempt)
    }
  }
}
