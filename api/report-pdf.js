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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).send('Sadece GET isteği desteklenir.')
    }

    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url

    if (!rawUrl) {
      return res.status(400).send('PDF URL eksik.')
    }

    let pdfUrl = String(rawUrl).trim()

    try {
      pdfUrl = decodeURIComponent(pdfUrl)
    } catch (err) {
      // Zaten decode edilmiş olabilir.
    }

    if (!isAllowedReportUrl(pdfUrl)) {
      return res.status(403).send('Bu PDF adresine izin verilmiyor.')
    }

    pdfUrl = convertInternalUrlToPublicIfNeeded(pdfUrl)

    const response = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf,*/*',
      },
    })

    if (!response.ok) {
      return res.status(response.status).send(`PDF alınamadı. HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || 'application/pdf'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline; filename="report.pdf"')
    res.setHeader('Cache-Control', 'no-store')

    return res.status(200).send(buffer)
  } catch (error) {
    return res.status(500).send(error.message || 'PDF proxy hatası.')
  }
}