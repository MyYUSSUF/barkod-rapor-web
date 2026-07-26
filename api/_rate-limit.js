const STORE_KEY = '__elvan_request_limits__'
const MAX_STORED_KEYS = 2000

function getStore() {
  // Sıcak kalan serverless örneğinde sayaçları istekler arasında korur.
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = new Map()
  }

  return globalThis[STORE_KEY]
}

function pruneStore(store, now) {
  if (store.size <= MAX_STORED_KEYS) {
    return
  }

  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key)
    }
  }

  if (store.size <= MAX_STORED_KEYS) {
    return
  }

  const oldestKeys = [...store.entries()]
    .sort((left, right) => left[1].lastRequestAt - right[1].lastRequestAt)
    .slice(0, store.size - MAX_STORED_KEYS)

  for (const [key] of oldestKeys) {
    store.delete(key)
  }
}

export function consumeRequestLimit({
  scope,
  key,
  maxRequests,
  windowMs,
  minIntervalMs = 0,
  now = Date.now(),
}) {
  const store = getStore()
  const storeKey = `${String(scope || 'request')}:${String(key || 'anonymous')}`
  const previous = store.get(storeKey)
  const hasActiveWindow = previous && previous.expiresAt > now
  const entry = hasActiveWindow
    ? previous
    : {
        count: 0,
        expiresAt: now + windowMs,
        lastRequestAt: null,
      }
  const intervalRemaining = Number.isFinite(entry.lastRequestAt)
    ? Math.max(0, minIntervalMs - (now - entry.lastRequestAt))
    : 0

  if (intervalRemaining > 0) {
    return {
      allowed: false,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      retryAfterMs: intervalRemaining,
    }
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      limit: maxRequests,
      remaining: 0,
      retryAfterMs: Math.max(1, entry.expiresAt - now),
    }
  }

  entry.count += 1
  entry.lastRequestAt = now
  store.set(storeKey, entry)
  pruneStore(store, now)

  return {
    allowed: true,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    retryAfterMs: 0,
  }
}

export function enforceRequestLimit(res, options) {
  const result = consumeRequestLimit(options)

  res.setHeader('X-RateLimit-Limit', String(result.limit))
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))

  if (result.allowed) {
    return true
  }

  res.setHeader(
    'Retry-After',
    String(Math.max(1, Math.ceil(result.retryAfterMs / 1000)))
  )
  res.status(429).json({
    error:
      options.errorMessage ||
      'Çok kısa sürede fazla istek gönderildi. Lütfen biraz bekleyin.',
  })

  return false
}
