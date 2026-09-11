import assert from 'node:assert/strict'
import test from 'node:test'
import { createReportUrlHandler, getReportPdfUrl, rememberNativeNotificationLanguage } from '../api/report-url.js'
import { getReportDefinition, canProfileViewReport, createReportAccessToken, verifyReportAccessToken } from '../api/_report-access.js'
import { parseReportDate, REPORT_MAX_RANGE_DAYS } from '../api/_report-input.js'
import { fetchErpXml, withErpDeadline, ErpRequestError } from '../api/_erp-request.js'

const pdfUrl = 'https://repx.elvandyeing.com/synthetic.pdf'
const shipment = { reportCode: 'RAR00036', startDate: '2026-09-01', endDate: '2026-09-10', customerCode: '61001' }
function responseRecorder() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this }, end() {} }
}
function setup(overrides = {}) {
  const calls = []
  const handler = createReportUrlHandler({
    verifyRequest: async () => ({ ok: true, userId: 'synthetic-user', profile: { role: 'admin' } }),
    requestLimit: () => true,
    rememberLanguage: async () => true,
    reportUrl: async (...args) => { calls.push(args); return pdfUrl },
    signToken: () => 'synthetic-token',
    ...overrides,
  })
  return { calls, async run(body, method = 'POST') {
    const res = responseRecorder()
    await handler({ method, headers: {}, body }, res)
    return res
  } }
}

test('report catalog rejects inherited Object property names', () => {
  for (const code of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.equal(getReportDefinition(code), null)
    assert.equal(canProfileViewReport({ role: 'admin' }, code), false)
  }
})

test('real signatures remain scoped to the user, report, URL and expiry', (t) => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-secret-not-an-actual-service-key'
  t.after(() => { if (original === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = original })
  const context = { userId: 'synthetic-user', reportCode: 'RAR00032', pdfUrl }
  const token = createReportAccessToken(context)
  assert.equal(verifyReportAccessToken(token, context), true)
  for (const changed of [{ userId: 'different-user' }, { reportCode: 'RAR00033' }, { pdfUrl: `${pdfUrl}?different` }, { token: `${token}tampered` }]) {
    assert.equal(verifyReportAccessToken(changed.token || token, { ...context, ...changed }), false)
  }
  assert.equal(verifyReportAccessToken(createReportAccessToken({ ...context, expiresInSeconds: -1 }), context), false)
  assert.throws(() => createReportAccessToken({ ...context, reportCode: 'constructor' }))
})

for (const [name, body] of [
  ['object barcode', { reportCode: 'RAR00032', barcode: { value: 'secret' } }],
  ['numeric barcode', { reportCode: 'RAR00032', barcode: 12345 }],
  ['oversized barcode', { reportCode: 'RAR00032', barcode: 'X'.repeat(20_000) }],
  ['XML control character', { reportCode: 'RAR00032', barcode: 'ABC\u0000DEF' }],
  ['reversed dates', { ...shipment, endDate: '2026-08-31' }],
  ['impossible date', { ...shipment, startDate: '2026-02-30' }],
  ['non-leap date', { ...shipment, startDate: '2025-02-29' }],
  ['arbitrary date', { ...shipment, startDate: 'not-a-date' }],
  ['100-year range', { ...shipment, startDate: '1900-01-01' }],
  ['unknown customer', { ...shipment, customerCode: 'Admin' }],
  ['object customer', { ...shipment, customerCode: { code: '61001' } }],
  ['invalid language', { ...shipment, reportLanguage: ['tr'] }],
  ['invalid body', []],
  ['null body', null],
  ['prototype report', { reportCode: 'constructor' }],
]) {
  test(`invalid input is rejected before ERP: ${name}`, async () => {
    const { run, calls } = setup()
    const res = await run(body)
    assert.equal(res.statusCode, 400)
    assert.equal(calls.length, 0)
  })
}

test('calendar parsing is exact and date span includes both endpoints', async () => {
  assert.ok(parseReportDate('2024-02-29'))
  assert.equal(parseReportDate('0000-01-01'), null)
  assert.equal(parseReportDate('2026-13-01'), null)
  assert.equal(REPORT_MAX_RANGE_DAYS, 366)
  const { run } = setup()
  assert.equal((await run({ ...shipment, startDate: '2024-01-01', endDate: '2024-12-31' })).statusCode, 200)
  assert.equal((await run({ ...shipment, startDate: '2024-01-01', endDate: '2025-01-01' })).statusCode, 400)
})

test('valid legacy response fields remain and irrelevant parameters never reach ERP', async () => {
  const { run, calls } = setup()
  const res = await run({ reportCode: 'RAR00032', barcode: '  X<&123  ', customerCode: 'Admin', startDate: 'junk' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.pdfUrl, pdfUrl)
  assert.equal(res.body.reportToken, 'synthetic-token')
  assert.ok(res.body.requestId)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.deepEqual(calls[0][1], { barcode: 'X<&123', startDate: '', endDate: '', customerCode: '', reportLanguage: 'tr' })
  assert.ok(calls[0][2].signal instanceof AbortSignal)
})

test('authentication, report permission and rate rejection prevent ERP calls', async () => {
  for (const [overrides, expected] of [
    [{ verifyRequest: async () => ({ ok: false, statusCode: 401 }) }, 401],
    [{ verifyRequest: async () => ({ ok: true, userId: 'test', profile: { role: 'user' } }) }, 403],
    [{ requestLimit: (res) => { res.status(429).json({ error: 'Rate limited' }); return false } }, 429],
  ]) {
    const { run, calls } = setup(overrides)
    assert.equal((await run(shipment)).statusCode, expected)
    assert.equal(calls.length, 0)
  }
})

test('HTTP, ERP and internal diagnostic details are never returned', async () => {
  for (const [error, expected] of [[new Error('SQL password=FAKE_SECRET'), 500], [new ErpRequestError('ERP_HTTP_ERROR'), 502], [new ErpRequestError('ERP_TIMEOUT', 504), 504]]) {
    const { run } = setup({ reportUrl: async () => { throw error } })
    const res = await run(shipment)
    assert.equal(res.statusCode, expected)
    assert.doesNotMatch(JSON.stringify(res.body), /FAKE_SECRET|password=/)
    assert.ok(res.body.requestId)
  }
  const { run } = setup({ reportUrl: async () => 'https://attacker.invalid/fake.pdf' })
  assert.equal((await run(shipment)).statusCode, 502)
})

test('SOAP preserves report/customer/date contract and TR vs EN/AR mapping', async () => {
  for (const language of ['tr', 'en', 'ar']) {
    const requests = []
    const fetchImpl = async (url, options) => {
      requests.push({ url, options })
      return new Response(url.endsWith('?WSDL')
        ? '<definitions targetNamespace="http://synthetic.test/RepxService/"></definitions>'
        : `<GetReportResult>${pdfUrl}</GetReportResult><errorMessage></errorMessage>`)
    }
    const result = await withErpDeadline((signal) => getReportPdfUrl('RAR00036', { ...shipment, reportLanguage: language }, { signal, fetchImpl }))
    assert.equal(result, pdfUrl)
    const soap = requests.find((r) => r.options.method === 'POST')
    assert.match(soap.options.body, /<userCode>61001<\/userCode>/)
    assert.match(soap.options.body, /01\.09\.2026/)
    assert.match(soap.options.body, new RegExp(`<languageCode>${language === 'tr' ? 'TUR' : 'ENG'}</languageCode>`))
    assert.equal(soap.options.redirect, 'error')
    assert.ok(requests.every((r) => r.options.signal instanceof AbortSignal))
  }
})

test('upstream XML byte limits apply with and without content-length', async () => {
  for (const headers of [{}, { 'content-length': '100' }]) {
    await assert.rejects(fetchErpXml('https://synthetic.invalid', {}, {
      maxBytes: 4, fetchImpl: async () => new Response('too long', { headers }),
    }), { code: 'ERP_RESPONSE_TOO_LARGE' })
  }
})

test('real ERP parser redacts HTTP and SOAP business-error text', async () => {
  for (const [status, body, expected] of [[500, 'PRIVATE_ERP_DIAGNOSTIC', 'ERP_HTTP_ERROR'], [200, '<errorMessage>PRIVATE_ERP_DIAGNOSTIC</errorMessage>', 'ERP_REPORT_ERROR']]) {
    await assert.rejects(withErpDeadline((signal) => getReportPdfUrl('RAR00032', { barcode: 'TEST' }, {
      signal,
      fetchImpl: async (url) => url.endsWith('?WSDL')
        ? new Response('<definitions targetNamespace="http://synthetic.test/"></definitions>')
        : new Response(body, { status }),
    })), (error) => error.code === expected && !error.message.includes('PRIVATE_ERP_DIAGNOSTIC'))
  }
})

test('deadline stops stalled response bodies, not only stalled headers', async () => {
  let cancelled = false
  await assert.rejects(withErpDeadline((signal) => fetchErpXml('https://synthetic.invalid', { signal }, {
    fetchImpl: async () => new Response(new ReadableStream({
      start() {}, cancel() { cancelled = true },
    })),
  }), 10), { code: 'ERP_TIMEOUT', statusCode: 504 })
  assert.equal(cancelled, true)
})

test('native language write failure is non-blocking and bounded', async () => {
  assert.equal(await rememberNativeNotificationLanguage({ deviceHash: 'synthetic', supabase: { rpc: () => Promise.reject(new Error('synthetic')) } }, 'ar'), false)
  assert.equal(await rememberNativeNotificationLanguage({ deviceHash: 'synthetic', supabase: { rpc: () => new Promise(() => {}) } }, 'ar'), false)
})
