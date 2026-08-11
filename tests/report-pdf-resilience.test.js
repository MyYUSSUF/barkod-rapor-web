import assert from 'node:assert/strict'
import test from 'node:test'

import {
  REPORT_PDF_MAX_BYTES,
  ReportPdfProxyError,
  fetchPdfWithLimits,
  hasPdfSignature,
  isAllowedPdfContentType,
  isAllowedReportUrl,
  parsePdfContentLength,
  readPdfBodyWithLimit,
} from '../api/report-pdf.js'

const allowedUrl = 'https://repx.elvandyeing.com/report.pdf'

test('PDF content-length only accepts non-negative safe integers', () => {
  assert.equal(REPORT_PDF_MAX_BYTES, 4 * 1024 * 1024)
  assert.equal(parsePdfContentLength('2048'), 2048)
  assert.equal(parsePdfContentLength(' 0 '), 0)
  assert.equal(parsePdfContentLength('2 MB'), null)
  assert.equal(parsePdfContentLength('-1'), null)
  assert.equal(parsePdfContentLength(''), null)
  assert.equal(parsePdfContentLength(Number.MAX_SAFE_INTEGER + 1), null)
})

test('PDF MIME and signature checks accept only expected binary data', () => {
  assert.equal(isAllowedPdfContentType('application/pdf; charset=binary'), true)
  assert.equal(isAllowedPdfContentType('application/octet-stream'), true)
  assert.equal(isAllowedPdfContentType('text/html'), false)
  assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\n')), true)
  assert.equal(
    hasPdfSignature(Buffer.from(`prefix\n%PDF-1.7\n${'x'.repeat(20)}`)),
    true,
  )
  assert.equal(hasPdfSignature(Buffer.from('<html></html>')), false)
})

test('PDF allowlist rejects credentials, custom ports and foreign hosts', () => {
  assert.equal(isAllowedReportUrl(allowedUrl), true)
  assert.equal(isAllowedReportUrl('http://repx.elvandyeing.com/report.pdf'), false)
  assert.equal(isAllowedReportUrl('http://10.64.46.5/report.pdf'), true)
  assert.equal(
    isAllowedReportUrl('http://user@repx.elvandyeing.com/report.pdf'),
    false,
  )
  assert.equal(
    isAllowedReportUrl('http://10.64.46.5:8080/report.pdf'),
    false,
  )
  assert.equal(isAllowedReportUrl('https://example.test/report.pdf'), false)
})

test('PDF body reader accepts a response within the byte limit', async () => {
  const response = new Response(
    new Blob([Buffer.from('pdf-data')]).stream(),
    { status: 200 },
  )

  const buffer = await readPdfBodyWithLimit(response, 8)

  assert.equal(buffer.toString(), 'pdf-data')
})

test('PDF body reader rejects actual bytes beyond the limit', async () => {
  const response = new Response(
    new Blob([Buffer.from('too-large')]).stream(),
    { status: 200 },
  )

  await assert.rejects(
    () => readPdfBodyWithLimit(response, 4),
    (error) =>
      error instanceof ReportPdfProxyError &&
      error.statusCode === 413 &&
      error.code === 'PDF_TOO_LARGE',
  )
})

test('PDF fetch rejects an oversized declared content-length before buffering', async () => {
  await assert.rejects(
    () =>
      fetchPdfWithLimits(allowedUrl, {
        maxBytes: 4,
        fetchImpl: async () =>
          new Response('x', {
            status: 200,
            headers: {
              'Content-Length': '5',
              'Content-Type': 'application/pdf',
            },
          }),
      }),
    (error) =>
      error instanceof ReportPdfProxyError &&
      error.statusCode === 413 &&
      error.code === 'PDF_TOO_LARGE',
  )
})

test('PDF fetch maps an upstream timeout to a clear 504 error', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  await assert.rejects(
    () =>
      fetchPdfWithLimits(allowedUrl, {
        fetchImpl,
        timeoutMs: 5,
      }),
    (error) =>
      error instanceof ReportPdfProxyError &&
      error.statusCode === 504 &&
      error.code === 'PDF_UPSTREAM_TIMEOUT',
  )
})

test('PDF fetch follows a bounded same-origin redirect manually', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })

    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/final.pdf' },
      })
    }

    return new Response('%PDF-1.7\nvalid', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  }

  const { buffer } = await fetchPdfWithLimits(allowedUrl, { fetchImpl })

  assert.equal(buffer.toString(), '%PDF-1.7\nvalid')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.redirect, 'manual')
  assert.equal(
    calls[1].url,
    'https://repx.elvandyeing.com/final.pdf',
  )
})

test('PDF fetch upgrades legacy public HTTP URLs before requesting them', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return new Response('%PDF-1.7\nvalid', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  }

  await fetchPdfWithLimits('http://repx.elvandyeing.com/report.pdf', {
    fetchImpl,
  })

  assert.deepEqual(calls, ['https://repx.elvandyeing.com/report.pdf'])
})

test('PDF fetch rejects redirects outside the report allowlist', async () => {
  await assert.rejects(
    () =>
      fetchPdfWithLimits(allowedUrl, {
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { Location: 'https://example.test/report.pdf' },
          }),
      }),
    (error) =>
      error instanceof ReportPdfProxyError &&
      error.statusCode === 502 &&
      error.code === 'PDF_REDIRECT_NOT_ALLOWED',
  )
})

test('PDF fetch rejects redirect loops at the configured hop limit', async () => {
  let requestCount = 0

  await assert.rejects(
    () =>
      fetchPdfWithLimits(allowedUrl, {
        maxRedirects: 1,
        fetchImpl: async () => {
          requestCount += 1
          return new Response(null, {
            status: 302,
            headers: { Location: `/loop-${requestCount}.pdf` },
          })
        },
      }),
    (error) =>
      error instanceof ReportPdfProxyError &&
      error.statusCode === 502 &&
      error.code === 'PDF_TOO_MANY_REDIRECTS',
  )
  assert.equal(requestCount, 2)
})

test('PDF fetch rejects invalid MIME and invalid PDF signatures', async () => {
  await assert.rejects(
    () =>
      fetchPdfWithLimits(allowedUrl, {
        fetchImpl: async () =>
          new Response('%PDF-1.7', {
            headers: { 'Content-Type': 'text/html' },
          }),
      }),
    (error) => error?.code === 'PDF_INVALID_CONTENT_TYPE',
  )

  await assert.rejects(
    () =>
      fetchPdfWithLimits(allowedUrl, {
        fetchImpl: async () =>
          new Response('<html></html>', {
            headers: { 'Content-Type': 'application/pdf' },
          }),
      }),
    (error) => error?.code === 'PDF_INVALID_SIGNATURE',
  )
})
