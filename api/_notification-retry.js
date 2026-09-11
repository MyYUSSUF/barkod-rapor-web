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
          reject(new NotificationReadError(code, code === 'READ_TIMEOUT'))
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
        // Retain the original only for internal legacy-column detection; never log/return it.
        safeError.cause = error
        throw safeError
      }
      await sleep(200 * attempt)
    }
  }
}
