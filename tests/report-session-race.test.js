import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { advanceSessionLifecycle, isAuthSessionUser, isSessionLifecycleCurrent } from '../src/lib/sessionLifecycle.js'

// App.jsx içindeki gerçek fonksiyonu çalıştırır; eski kodun kopyası/test taklidi değildir.
// Ağ, auth ve React setter sınırları yalnız sentetik nesnelerle değiştirilir.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, 'App function markers must exist')
  return source.slice(start, end)
}
const openSource = section('  const openReport = async (report) => {', '  const handleReportClick =')
const lifecycleSource = section('  const cancelReportRequest = () => {', '  const getNotificationSession =')
const compile = new Function('env', `with (env) { ${lifecycleSource}\n${openSource}\nreturn { openReport, invalidateNotificationSession, beginNotificationSession }; }`)
const report = { code: 'RAR00032', key: 'inspection', requiresBarcode: true }
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }

function harness() {
  const responses = []
  const viewers = []
  const audits = []
  const effects = []
  const auth = (userId) => userId ? { user: { id: userId }, access_token: `synthetic-token-${userId}` } : null
  const env = {
    notificationSessionRef: { current: advanceSessionLifecycle({}, 'user-a') },
    reportRequestRef: { current: null }, logoutInProgressRef: { current: false },
    userProfile: { id: 'user-a', role: 'user' }, activeSession: auth('user-a'),
    barcode: 'TEST-BARCODE', startDate: '', endDate: '', shipmentCustomerCode: '',
    dateRangeReportCode: '', SHIPMENT_CUSTOMERS: [], API_BASE_URL: 'https://synthetic.invalid',
    APP_LOG_VERSION: 'synthetic', REPORT_TIMEOUT_MS: 45000,
    t: new Proxy({}, { get: (_, name) => String(name) }),
    advanceSessionLifecycle, isAuthSessionUser, isSessionLifecycleCurrent,
    getReportName: () => 'Test report', isNativeAndroidApp: () => false,
    saveBarcodeToHistory() {}, stopScanner() {},
    setDateRangeReportCode() {}, getReportLanguageForAppLanguage: () => 'tr',
    makeAuthorizedHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
    fetchJsonWithTimeout: async (_url, options) => {
      const pending = deferred()
      responses.push({ ...pending, options })
      return pending.promise // Ignore abort on purpose: even a late result must be discarded.
    },
    writeAuditLog: async (_payload, token) => { audits.push(token) },
    getDeviceName: () => 'Synthetic browser', getDeviceToken: () => 'synthetic-device',
    sanitizePdfFileName: (value) => value, makePdfProxyUrl: (url) => url, buildPdfMeta: () => ({}),
    setPdfViewerData: (value) => { if (value) viewers.push(value); effects.push(['viewer', value]) },
    setLoading: (value) => effects.push(['loading', value]),
    setSelectedReportCode: (value) => effects.push(['selected', value]),
    setUserProfile: (value) => { env.userProfile = value },
    clearUserMessage: () => effects.push(['clear']),
    showUserMessage: (...args) => effects.push(['message', ...args]),
  }
  env.supabase = { auth: { getSession: async () => ({ data: { session: env.activeSession } }) } }
  const methods = compile(env)
  const resolve = (index) => responses[index].resolve({ response: { ok: true }, result: { pdfUrl: `https://synthetic.invalid/${index}.pdf`, reportToken: 'synthetic-report-token' } })
  const changeUser = (userId) => {
    methods.invalidateNotificationSession()
    env.activeSession = auth(userId)
    env.userProfile = userId ? { id: userId, role: 'user' } : null
    if (userId) methods.beginNotificationSession(userId)
  }
  return { env, responses, viewers, audits, effects, resolve, changeUser, ...methods }
}

async function flushUntil(predicate) {
  for (let index = 0; index < 30 && !predicate(); index++) await Promise.resolve()
  assert.ok(predicate(), 'expected async checkpoint was reached')
}

test('same-session report opens with captured user/token and logs to that user', async () => {
  const h = harness()
  const pending = h.openReport(report)
  await flushUntil(() => h.responses.length === 1)
  h.resolve(0)
  await pending
  assert.equal(h.viewers.length, 1)
  assert.equal(h.viewers[0].userId, 'user-a')
  assert.equal(h.viewers[0].accessToken, 'synthetic-token-user-a')
  assert.deepEqual(h.audits, ['synthetic-token-user-a'])
  assert.equal(h.env.reportRequestRef.current, null)
})

for (const nextUser of ['user-b', null, 'user-a']) {
  test(`late report cannot survive logout/account lifecycle change: ${nextUser}`, async () => {
    const h = harness()
    const pending = h.openReport(report)
    await flushUntil(() => h.responses.length === 1)
    h.changeUser(nextUser)
    const baseline = h.effects.length
    h.resolve(0)
    await pending
    assert.equal(h.responses[0].options.signal.aborted, true)
    assert.equal(h.viewers.length, 0)
    assert.deepEqual(h.audits, [])
    assert.equal(h.effects.length, baseline, 'stale completion must not alter new UI state')
  })
}

test('fresh auth check also rejects a switch before auth callback is delivered', async () => {
  const h = harness()
  const pending = h.openReport(report)
  await flushUntil(() => h.responses.length === 1)
  h.env.activeSession = { user: { id: 'user-b' }, access_token: 'synthetic-token-user-b' }
  h.resolve(0)
  await pending
  assert.equal(h.viewers.length, 0)
  assert.deepEqual(h.audits, [])
})

test('account change during audit never opens the previous report or attributes it to the new account', async () => {
  const h = harness()
  const audit = deferred()
  h.env.writeAuditLog = async (_payload, token) => { h.audits.push(token); await audit.promise }
  const pending = h.openReport(report)
  await flushUntil(() => h.responses.length === 1)
  h.resolve(0)
  await flushUntil(() => h.audits.length === 1)
  h.changeUser('user-b')
  audit.resolve()
  await pending
  assert.equal(h.viewers.length, 0)
  assert.deepEqual(h.audits, ['synthetic-token-user-a'])
})

test('out-of-order responses cannot overwrite the newest report', async () => {
  const h = harness()
  const first = h.openReport(report)
  await flushUntil(() => h.responses.length === 1)
  const second = h.openReport(report)
  await flushUntil(() => h.responses.length === 2)
  h.resolve(1)
  await second
  h.resolve(0)
  await first
  assert.equal(h.viewers.length, 1)
  assert.match(h.viewers[0].pdfUrl, /\/1\.pdf/)
  assert.equal(h.responses[0].options.signal.aborted, true)
  assert.equal(h.audits.length, 1)
})

test('late failures after switching user do not display errors in the new session', async () => {
  const h = harness()
  const rejected = deferred()
  h.env.fetchJsonWithTimeout = async () => { await rejected.promise; throw new Error('old-session-error') }
  const pending = h.openReport(report)
  await flushUntil(() => Boolean(h.env.reportRequestRef.current))
  h.changeUser('user-b')
  const baseline = h.effects.length
  rejected.resolve()
  await pending
  assert.equal(h.effects.length, baseline)
})
