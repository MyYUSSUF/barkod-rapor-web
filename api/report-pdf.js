import { verifyApprovedDeviceRequest } from './_device-auth.js'
import {
  canProfileViewReport,
  verifyReportAccessToken,
} from './_report-access.js'
import { handleCors } from './_cors.js'
import { enforceRequestLimit } from './_rate-limit.js'

const BASE_URL = 'http://repx.elvandyeing.com'
export const REPORT_PDF_TIMEOUT_MS = 30_000
// Vercel'in 4,5 MB buffered yanıt sınırının güvenli biçimde altında kalır.
export const REPORT_PDF_MAX_BYTES = 4 * 1024 * 1024
export const REPORT_PDF_MAX_REDIRECTS = 3
const PDF_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const ALLOWED_PDF_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/octet-stream',
  'application/download',
  'application/x-download',
  'binary/octet-stream',
])

export class ReportPdfProxyError extends Error {
  constructor(message, statusCode, code) {
    super(message)
    this.name = 'ReportPdfProxyError'
    this.statusCode = statusCode
    this.code = code
  }
}

export function parsePdfContentLength(value) {
  const cleanValue = String(value ?? '').trim()

  if (!/^\d+$/.test(cleanValue)) {
    return null
  }

  const parsedValue = Number(cleanValue)

  return Number.isSafeInteger(parsedValue) ? parsedValue : null
}

export function isAllowedPdfContentType(value) {
  const contentType = String(value || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()

  return !contentType || ALLOWED_PDF_CONTENT_TYPES.has(contentType)
}

export function hasPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 5) {
    return false
  }

  return buffer
    .subarray(0, Math.min(buffer.byteLength, 1024))
    .includes(Buffer.from('%PDF-', 'ascii'))
}

async function cancelResponseBody(response) {
  if (typeof response?.body?.cancel !== 'function') {
    return
  }

  try {
    await response.body.cancel()
  } catch {
    // Gövde zaten kapanmış veya fetch sinyaliyle iptal edilmiş olabilir.
  }
}

export async function readPdfBodyWithLimit(
  response,
  maxBytes = REPORT_PDF_MAX_BYTES,
) {
  if (!response.body) {
    return Buffer.alloc(0)
  }

  if (typeof response.body.getReader !== 'function') {
    throw new ReportPdfProxyError(
      'PDF aktarım akışı kullanılamıyor.',
      502,
      'PDF_STREAM_UNAVAILABLE',
    )
  }

  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      const chunk = Buffer.from(value)
      totalBytes += chunk.byteLength

      if (totalBytes > maxBytes) {
        await reader.cancel('PDF boyut sınırı aşıldı.').catch(() => {})
        throw new ReportPdfProxyError(
          'PDF dosyası izin verilen boyut sınırını aşıyor.',
          413,
          'PDF_TOO_LARGE',
        )
      }

      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock?.()
  }

  return Buffer.concat(chunks, totalBytes)
}

export async function fetchPdfWithLimits(
  pdfUrl,
  {
    fetchImpl = fetch,
    maxBytes = REPORT_PDF_MAX_BYTES,
    maxRedirects = REPORT_PDF_MAX_REDIRECTS,
    timeoutMs = REPORT_PDF_TIMEOUT_MS,
  } = {},
) {
  const abortController = new AbortController()
  let currentUrl = convertInternalUrlToPublicIfNeeded(String(pdfUrl || ''))
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    abortController.abort()
  }, timeoutMs)

  try {
    if (!isAllowedReportUrl(currentUrl)) {
      throw new ReportPdfProxyError(
        'Bu PDF adresine izin verilmiyor.',
        403,
        'PDF_URL_NOT_ALLOWED',
      )
    }

    let response
    let redirectCount = 0

    while (true) {
      response = await fetchImpl(currentUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/pdf,*/*',
        },
        redirect: 'manual',
        signal: abortController.signal,
      })

      if (!PDF_REDIRECT_STATUSES.has(response.status)) {
        break
      }

      if (redirectCount >= maxRedirects) {
        await cancelResponseBody(response)
        throw new ReportPdfProxyError(
          'PDF sunucusu çok fazla yönlendirme yaptı.',
          502,
          'PDF_TOO_MANY_REDIRECTS',
        )
      }

      const redirectLocation = response.headers.get('location')

      if (!redirectLocation) {
        await cancelResponseBody(response)
        throw new ReportPdfProxyError(
          'PDF sunucusunun yönlendirme adresi geçersiz.',
          502,
          'PDF_INVALID_REDIRECT',
        )
      }

      let nextUrl

      try {
        nextUrl = new URL(redirectLocation, currentUrl).toString()
      } catch {
        await cancelResponseBody(response)
        throw new ReportPdfProxyError(
          'PDF sunucusunun yönlendirme adresi geçersiz.',
          502,
          'PDF_INVALID_REDIRECT',
        )
      }

      if (!isAllowedReportUrl(nextUrl)) {
        await cancelResponseBody(response)
        throw new ReportPdfProxyError(
          'PDF sunucusu izin verilmeyen bir adrese yönlendirdi.',
          502,
          'PDF_REDIRECT_NOT_ALLOWED',
        )
      }

      await cancelResponseBody(response)
      currentUrl = convertInternalUrlToPublicIfNeeded(nextUrl)
      redirectCount += 1
    }

    if (!response.ok) {
      abortController.abort()
      return { response, buffer: null }
    }

    if (!isAllowedPdfContentType(response.headers.get('content-type'))) {
      await cancelResponseBody(response)
      throw new ReportPdfProxyError(
        'PDF sunucusu geçersiz bir dosya türü döndürdü.',
        502,
        'PDF_INVALID_CONTENT_TYPE',
      )
    }

    const declaredBytes = parsePdfContentLength(
      response.headers.get('content-length'),
    )

    if (declaredBytes !== null && declaredBytes > maxBytes) {
      abortController.abort()
      throw new ReportPdfProxyError(
        'PDF dosyası izin verilen boyut sınırını aşıyor.',
        413,
        'PDF_TOO_LARGE',
      )
    }

    const buffer = await readPdfBodyWithLimit(response, maxBytes)

    if (!hasPdfSignature(buffer)) {
      throw new ReportPdfProxyError(
        'PDF sunucusu geçerli bir PDF dosyası döndürmedi.',
        502,
        'PDF_INVALID_SIGNATURE',
      )
    }

    return { response, buffer }
  } catch (error) {
    if (error instanceof ReportPdfProxyError) {
      abortController.abort()
      throw error
    }

    if (timedOut || error?.name === 'AbortError') {
      throw new ReportPdfProxyError(
        'PDF sunucusu zaman aşımına uğradı.',
        504,
        'PDF_UPSTREAM_TIMEOUT',
      )
    }

    throw new ReportPdfProxyError(
      'PDF sunucusuna ulaşılamadı.',
      502,
      'PDF_UPSTREAM_ERROR',
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

export function isAllowedReportUrl(url) {
  try {
    const parsedUrl = new URL(String(url || ''))

    if (parsedUrl.username || parsedUrl.password) {
      return false
    }

    return (
      parsedUrl.origin === BASE_URL ||
      (parsedUrl.hostname === '10.64.46.5' &&
        parsedUrl.port === '' &&
        (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'))
    )
  } catch {
    return false
  }
}

function convertInternalUrlToPublicIfNeeded(url) {
  if (!url) return ''

  return url
    .replace('http://10.64.46.5', BASE_URL)
    .replace('https://10.64.46.5', BASE_URL)
}

function sanitizeFileName(value) {
  const clean = value ? String(value).trim() : 'report.pdf'

  return clean
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'report.pdf'
}

function makeAsciiHeaderFileName(value) {
  const clean = value ? String(value).trim() : 'report.pdf'

  const withoutTurkishChars = clean
    .replaceAll('İ', 'I')
    .replaceAll('İ', 'I')
    .replaceAll('ı', 'i')
    .replaceAll('Ş', 'S')
    .replaceAll('ş', 's')
    .replaceAll('Ğ', 'G')
    .replaceAll('ğ', 'g')
    .replaceAll('Ü', 'U')
    .replaceAll('ü', 'u')
    .replaceAll('Ö', 'O')
    .replaceAll('ö', 'o')
    .replaceAll('Ç', 'C')
    .replaceAll('ç', 'c')

  return withoutTurkishChars
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'report.pdf'
}

export default async function handler(req, res) {
  if (handleCors(req, res)) {
    return
  }

  try {
    if (req.method !== 'GET') {
      return res.status(405).send('Sadece GET isteği desteklenir.')
    }

    const authResult = await verifyApprovedDeviceRequest(req)

    if (!authResult.ok) {
      return res
        .status(authResult.statusCode || 403)
        .send(authResult.error || 'Yetkisiz istek.')
    }

    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url
    const rawFileName = Array.isArray(req.query.filename)
      ? req.query.filename[0]
      : req.query.filename
    const reportCode = Array.isArray(req.query.reportCode)
      ? req.query.reportCode[0]
      : req.query.reportCode
    const reportToken = Array.isArray(req.query.reportToken)
      ? req.query.reportToken[0]
      : req.query.reportToken

    if (!rawUrl || !reportCode || !reportToken) {
      return res.status(400).send('PDF erişim bilgileri eksik.')
    }

    let pdfUrl = String(rawUrl).trim()

    try {
      pdfUrl = decodeURIComponent(pdfUrl)
    } catch {
      // Zaten decode edilmiş olabilir.
    }

    if (!isAllowedReportUrl(pdfUrl)) {
      return res.status(403).send('Bu PDF adresine izin verilmiyor.')
    }

    pdfUrl = convertInternalUrlToPublicIfNeeded(pdfUrl)

    if (
      !canProfileViewReport(authResult.profile, reportCode) ||
      !verifyReportAccessToken(reportToken, {
        userId: authResult.userId,
        reportCode,
        pdfUrl,
      })
    ) {
      return res.status(403).send('Bu PDF için erişim yetkiniz bulunmuyor.')
    }

    if (
      !enforceRequestLimit(res, {
        scope: 'report-pdf',
        key: authResult.userId,
        maxRequests: 30,
        windowMs: 60_000,
        errorMessage:
          'PDF isteği sınırı aşıldı. Lütfen kısa bir süre bekleyin.',
      })
    ) {
      return
    }

    let fileName = sanitizeFileName(rawFileName || 'report.pdf')

    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName += '.pdf'
    }

    let asciiHeaderFileName = makeAsciiHeaderFileName(fileName)

    if (!asciiHeaderFileName.toLowerCase().endsWith('.pdf')) {
      asciiHeaderFileName += '.pdf'
    }

    const { response, buffer } = await fetchPdfWithLimits(pdfUrl)

    if (!response.ok) {
      return res.status(response.status).send(`PDF alınamadı. HTTP ${response.status}`)
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiHeaderFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    )
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Length', String(buffer.byteLength))

    return res.status(200).send(buffer)
  } catch (error) {
    if (error instanceof ReportPdfProxyError) {
      return res.status(error.statusCode).send(error.message)
    }

    return res.status(500).send('PDF proxy hatası.')
  }
}
