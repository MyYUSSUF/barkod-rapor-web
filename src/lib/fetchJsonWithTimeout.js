// Başlıklar geldikten sonra da süre/iptal koruması gövde okunana kadar sürer.
export async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10_000, fetchImpl = fetch) {
  const controller = new AbortController()
  const parentSignal = options.signal
  const abort = () => controller.abort()
  if (parentSignal?.aborted) abort()
  parentSignal?.addEventListener('abort', abort, { once: true })
  const timeoutId = setTimeout(abort, timeoutMs)
  let rejectAborted
  const aborted = new Promise((_, reject) => {
    rejectAborted = () => reject(new DOMException('İstek iptal edildi.', 'AbortError'))
    if (controller.signal.aborted) rejectAborted()
    else controller.signal.addEventListener('abort', rejectAborted, { once: true })
  })
  try {
    return await Promise.race([aborted, (async () => {
      controller.signal.throwIfAborted()
      const response = await fetchImpl(url, { ...options, signal: controller.signal })
      const result = await response.json()
      return { response, result }
    })()])
  } finally {
    clearTimeout(timeoutId)
    parentSignal?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectAborted)
    controller.abort()
  }
}
