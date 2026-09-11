export const ERP_TIMEOUT_MS = 35_000
export const ERP_XML_MAX_BYTES = 1024 * 1024

export class ErpRequestError extends Error {
  constructor(code, statusCode = 502) {
    super(code)
    this.code = code
    this.statusCode = statusCode
  }
}

// Süre bütçesi bağlantının yanında yanıt gövdesini ve WSDL + SOAP toplamını kapsar.
export async function withErpDeadline(operation, timeoutMs = ERP_TIMEOUT_MS) {
  const controller = new AbortController()
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new ErpRequestError('ERP_TIMEOUT', 504))
    }, timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
  } finally {
    clearTimeout(timeoutId)
    controller.abort()
  }
}

export async function fetchErpXml(url, options = {}, {
  fetchImpl = fetch,
  maxBytes = ERP_XML_MAX_BYTES,
} = {}) {
  let reader
  let response
  const cancelReader = () => { void reader?.cancel().catch(() => {}) }
  try {
    options.signal?.throwIfAborted()
    response = await fetchImpl(url, { ...options, redirect: 'error' })
    if (!response.ok) throw new ErpRequestError('ERP_HTTP_ERROR')
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null && Number(declaredLength) > maxBytes) {
      throw new ErpRequestError('ERP_RESPONSE_TOO_LARGE')
    }
    if (!response.body) throw new ErpRequestError('ERP_EMPTY_RESPONSE')
    reader = response.body.getReader()
    options.signal?.addEventListener('abort', cancelReader, { once: true })
    const chunks = []
    let total = 0
    while (true) {
      options.signal?.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new ErpRequestError('ERP_RESPONSE_TOO_LARGE')
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks).toString('utf8')
  } catch (error) {
    // ERP yanıtı, adresi ve teknik hata metni istemciye/loga taşınmaz.
    if (error instanceof ErpRequestError) throw error
    throw new ErpRequestError(options.signal?.aborted ? 'ERP_TIMEOUT' : 'ERP_CONNECTION_ERROR', options.signal?.aborted ? 504 : 502)
  } finally {
    options.signal?.removeEventListener('abort', cancelReader)
    if (reader) {
      void reader.cancel().catch(() => {})
    } else if (response?.body) {
      void response.body.cancel().catch(() => {})
    }
  }
}
