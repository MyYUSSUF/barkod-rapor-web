import { verifyApprovedDeviceRequest } from './_device-auth.js'
import {
  canProfileViewReport,
  verifyReportAccessToken,
} from './_report-access.js'
import { handleCors } from './_cors.js'

const BASE_URL = 'http://repx.elvandyeing.com'

function isAllowedReportUrl(url) {
  if (!url) return false

  return (
    url.startsWith(`${BASE_URL}/`) ||
    url.startsWith('http://10.64.46.5/') ||
    url.startsWith('https://10.64.46.5/')
  )
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

    let fileName = sanitizeFileName(rawFileName || 'report.pdf')

    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName += '.pdf'
    }

    let asciiHeaderFileName = makeAsciiHeaderFileName(fileName)

    if (!asciiHeaderFileName.toLowerCase().endsWith('.pdf')) {
      asciiHeaderFileName += '.pdf'
    }

    const response = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf,*/*',
      },
    })

    if (!response.ok) {
      return res.status(response.status).send(`PDF alınamadı. HTTP ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiHeaderFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    )
    res.setHeader('Cache-Control', 'no-store')

    return res.status(200).send(buffer)
  } catch (error) {
    return res.status(500).send(error.message || 'PDF proxy hatası.')
  }
}
