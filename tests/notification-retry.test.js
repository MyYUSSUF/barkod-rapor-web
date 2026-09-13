import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { notificationMemoryDb } from './helpers/notification-memory-db.js'
import { readNotificationData, NotificationReadError } from '../api/_notification-retry.js'
import {
  claimNotificationRun, beginNotificationRun, markNotificationSending,
  finishNotificationRun, failNotificationRun, markNotificationDispatchUnknown,
} from '../api/_notification-run.js'
import { createNotificationHandler, fetchAllPages, recordNotificationDelivery, loadNotificationTargets } from '../api/send-notification.js'
import { dispatchDueAutomations } from '../api/notification-automations.js'
import { sendFcmHttpRequest } from '../api/_fcm-http-v1.js'

const AUTO = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const WHEN = '2026-09-11T04:30:00.000Z'
const automation = {
  id: AUTO, name: 'Test', content_type: 'custom', audience_type: 'all',
  target_user_id: null, target_user_ids: null, delivery_scope: 'all_devices',
  timezone: 'Africa/Cairo', send_time: '07:30', days_of_week: [0, 1, 2, 3, 4, 5, 6],
  title_tr: 'Günaydın', body_tr: 'İyi çalışmalar', title_en: 'Good morning', body_en: 'Have a good day',
  url: '/', is_active: true,
}
const env = { NOTIFICATION_ADMIN_SECRET: 'synthetic-test-secret', PUBLIC_APP_URL: 'https://example.test' }
const begin = (db, run) => beginNotificationRun(db, {
  automationId: AUTO, automationRunId: run.id, automationAttemptToken: run.token,
})
const row = (db) => [...db.rows.values()][0]
const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
const webTarget = (language = 'tr', index = 1) => ({
  id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
  user_id: USER, notification_language: language, subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${index}` },
})

function sender(db, overrides = {}) {
  return createNotificationHandler({
    createAdminClient: () => db,
    verifyRequest: async () => ({ ok: true, method: 'secret', userId: null }),
    loadTargets: async () => ({ webSubscriptions: [], nativeSubscriptions: [], storedTotal: 0, skipped: 0 }),
    recordDelivery: async () => ({ deliveryLogId: 'test-log', recipientRecordsComplete: true }),
    webPushClient: { setVapidDetails() {}, async sendNotification() {} },
    ...overrides,
  })
}
async function callSender(handler, body) {
  const res = { statusCode: 200, body: null, setHeader() {},
    status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
  await handler({ method: 'POST', headers: {}, body }, res)
  return { ok: res.statusCode < 400, status: res.statusCode, json: async () => res.body }
}
const dispatch = (db, fetchImpl, minute = 0, extra = {}) => dispatchDueAutomations(db, {
  env, fetchImpl, now: new Date(Date.parse(WHEN) + minute * 60_000), ...extra,
})

test('sending gate keeps pending targets separate from production result counters', async () => {
  const db = notificationMemoryDb()
  const run = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
  await markNotificationSending(db, run, 3)
  assert.equal(row(db).response.plannedTotal, 3)
  assert.equal(row(db).response.sendingStarted, true)
  assert.deepEqual([row(db).total, row(db).sent, row(db).failed], [0, 0, 0])
  await finishNotificationRun(db, run, { total: 3, sent: 2, failed: 1 })
  assert.deepEqual([row(db).total, row(db).sent, row(db).failed], [3, 2, 1])
  for (const write of db.writes) assert.equal(write.sent + write.failed, write.total)
})

test('production counter CHECK rejects invalid writes atomically in the test database', async () => {
  const db = notificationMemoryDb()
  const run = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
  const before = structuredClone(row(db))
  for (const values of [{ total: 1, sent: 0, failed: 0 }, { total: -1, sent: -1, failed: 0 }]) {
    const result = await db.from('notification_automation_runs').update(values).eq('id', run.id).select('id').maybeSingle()
    assert.equal(result.error.code, '23514')
    assert.deepEqual(row(db), before)
  }
})

test('run errors preserve safe database codes without retaining private error details', async () => {
  for (const code of ['23514', '42501', 'PGRST204', 'private-error-value']) {
    const db = notificationMemoryDb()
    const run = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
    db.failure = () => ({ error: { code, message: 'private message', details: 'private row', hint: 'private hint' } })
    await assert.rejects(markNotificationSending(db, run, 1), (error) => {
      assert.equal(error.code, 'RUN_WRITE_UNCERTAIN')
      assert.equal(error.databaseCode, code === 'private-error-value' ? undefined : code)
      assert.doesNotMatch(JSON.stringify(error), /private/)
      assert.equal(error.cause, undefined)
      return true
    })
  }
})

test('transient read retries only the failed page, without duplicating rows', async () => {
  let calls = 0
  const result = await fetchAllPages(async (from) => {
    calls += 1
    if (calls === 2) return { error: { message: 'Gateway Timeout' } }
    return { data: [from + 1], count: 2 }
  }, { pageSize: 1, readOptions: { sleep: async () => {} } })
  assert.deepEqual(result, [1, 2])
  assert.equal(calls, 3)
})

test('permission/schema failures do not retry; transient reads stop after three attempts', async () => {
  for (const [error, expected] of [[{ code: '42501' }, 1], [{ code: '42P01' }, 1], [{ message: 'Gateway Timeout' }, 3]]) {
    let calls = 0
    await assert.rejects(readNotificationData(async () => { calls += 1; return { error } }, { sleep: async () => {} }))
    assert.equal(calls, expected)
  }
})

test('real PostgREST gateway status survives non-JSON errors and enables bounded retry', async () => {
  for (const status of [429, 502, 503, 504]) {
    let calls = 0
    const db = createClient('https://example.test', 'synthetic-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => {
        calls += 1
        return new Response(status === 504
          ? '<html><h1>504 Gateway Time-out</h1></html>'
          : '<html><h1>Temporary gateway failure</h1></html>', {
          status, headers: { 'Content-Type': 'text/html' },
        })
      } },
    })
    await assert.rejects(readNotificationData((signal) => db.from('push_subscriptions')
      .select('id').abortSignal(signal), { sleep: async () => {} }), {
      code: 'READ_UNAVAILABLE', retryable: true,
    })
    assert.equal(calls, 3, `read helper retries HTTP ${status} at most three times`)
  }
})

test('real PostgREST permanent DB errors take precedence over transient HTTP status', async () => {
  for (const code of ['42501', '42P01', '42703', 'PGRST204']) {
    let calls = 0
    const db = createClient('https://example.test', 'synthetic-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => {
        calls += 1
        return new Response(JSON.stringify({ code, message: 'column notification_language unavailable' }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        })
      } },
    })
    await assert.rejects(readNotificationData((signal) => db.from('push_subscriptions')
      .select('id').abortSignal(signal), { sleep: async () => {} }), (error) => {
      assert.equal(error.code, 'READ_REJECTED')
      assert.equal(error.retryable, false)
      assert.equal(error.cause.code, code, 'original DB code remains available for optional-column fallback')
      return true
    })
    assert.equal(calls, 1)
  }
})

test('read deadline aborts its request and never waits indefinitely', async () => {
  let signal
  await assert.rejects(readNotificationData((value) => { signal = value; return new Promise(() => {}) }, {
    timeoutMs: 5, maxAttempts: 1,
  }), { code: 'READ_UNAVAILABLE', retryable: true })
  assert.equal(signal.aborted, true)
})

test('simultaneous occurrence claims and sender claims each have exactly one winner', async () => {
  const db = notificationMemoryDb()
  const claims = await Promise.all(Array.from({ length: 12 }, () => claimNotificationRun(db, AUTO, WHEN)))
  assert.equal(claims.filter(Boolean).length, 1)
  const run = claims.find(Boolean)
  const starts = await Promise.allSettled(Array.from({ length: 12 }, () => begin(db, run)))
  assert.equal(starts.filter((v) => v.status === 'fulfilled').length, 1)
})

test('safe preflight failure is reclaimed atomically and the old attempt cannot write or send', async () => {
  const db = notificationMemoryDb()
  const first = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
  await failNotificationRun(db, first, new NotificationReadError('READ_UNAVAILABLE', true))
  const results = await Promise.all(Array.from({ length: 10 }, () => claimNotificationRun(db, AUTO, WHEN)))
  assert.equal(results.filter(Boolean).length, 1)
  const next = results.find(Boolean)
  assert.equal(next.attempt, 2)
  assert.notEqual(next.token, first.token)
  await assert.rejects(markNotificationSending(db, first, 1))
  await markNotificationDispatchUnknown(db, first)
  assert.equal(row(db).response.token, next.token)
  await assert.rejects(begin(db, first))
})

test('three-attempt limit is durable and old unmarked failures are never replayed', async () => {
  const db = notificationMemoryDb()
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const run = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
    assert.equal(run.attempt, attempt)
    await failNotificationRun(db, run, new NotificationReadError('READ_UNAVAILABLE', true))
  }
  assert.equal(await claimNotificationRun(db, AUTO, WHEN), null)
  row(db).response = { total: 0, sent: 0, failed: 0 }
  assert.equal(await claimNotificationRun(db, AUTO, WHEN), null)
})

test('unknown, partial, completed and permanent-error outcomes never qualify for retry', async () => {
  for (const kind of ['unknown', 'partial', 'completed', 'permanent']) {
    const db = notificationMemoryDb()
    const run = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
    if (kind === 'permanent') await failNotificationRun(db, run, new NotificationReadError('READ_REJECTED'))
    else {
      await markNotificationSending(db, run, 2)
      if (kind === 'unknown') await failNotificationRun(db, run, new NotificationReadError('READ_UNAVAILABLE', true))
      else await finishNotificationRun(db, run, { total: 2, sent: kind === 'partial' ? 1 : 2, failed: kind === 'partial' ? 1 : 0 })
    }
    assert.equal(await claimNotificationRun(db, AUTO, WHEN), null)
  }
})

test('real dispatcher and sender recover from a preflight outage on the next scheduled tick', async () => {
  const db = notificationMemoryDb([automation])
  let loads = 0, sends = 0
  const handler = sender(db, {
    loadTargets: async () => {
      loads += 1
      if (loads === 1) throw new NotificationReadError('READ_UNAVAILABLE', true)
      return { webSubscriptions: [], nativeSubscriptions: [], storedTotal: 0, skipped: 0 }
    },
  })
  const fetchImpl = async (_, options) => { sends += 1; return callSender(handler, JSON.parse(options.body)) }
  assert.equal((await dispatch(db, fetchImpl)).failed, 1)
  assert.equal(row(db).response.retryable, true)
  assert.equal((await dispatch(db, fetchImpl, 1)).completed, 1)
  assert.equal(row(db).response.attempt, 2)
  assert.equal((await dispatch(db, fetchImpl, 2)).skipped, 1)
  assert.equal(sends, 2)
  assert.equal((await dispatch(db, fetchImpl, 15)).due, 0)
})

test('a late preflight result cannot begin sending after the sender timeout', async () => {
  const db = notificationMemoryDb([automation]), gate = deferred()
  const handler = sender(db, { loadTargets: () => gate.promise, preflightTimeoutMs: 5 })
  const result = await dispatch(db, (_, options) => callSender(handler, JSON.parse(options.body)))
  assert.equal(result.failed, 1)
  assert.equal(row(db).response.phase, 'preflight_failed')
  gate.resolve({ webSubscriptions: [webTarget()], nativeSubscriptions: [] })
  await Promise.resolve()
  assert.equal(db.writes.some((v) => v.response?.phase === 'sending'), false)
})

test('lost HTTP response after durable success remains successful and does not resend', async () => {
  const db = notificationMemoryDb([automation]), handler = sender(db)
  const result = await dispatch(db, async (_, options) => {
    await callSender(handler, JSON.parse(options.body))
    throw new Error('connection reset after response')
  })
  assert.equal(result.completed, 1)
  assert.equal((await dispatch(db, () => { throw Error('must not send') }, 1)).skipped, 1)
})

test('dispatcher timeout fences a late queued request; no retry or provider call follows', async () => {
  const db = notificationMemoryDb([automation])
  let lateBody
  const result = await dispatch(db, (_, options) => { lateBody = JSON.parse(options.body); return new Promise(() => {}) }, 0, { dispatchTimeoutMs: 5 })
  assert.equal(result.results[0].outcome, 'unknown')
  const late = await callSender(sender(db), lateBody)
  assert.equal(late.status, 409)
  assert.equal((await dispatch(db, () => { throw Error('must not send') }, 1)).skipped, 1)
})

test('HTTP 200 without a durable sender outcome is never labelled completed', async () => {
  const db = notificationMemoryDb([automation])
  const result = await dispatch(db, async () => ({ ok: true, json: async () => ({ total: 1, sent: 1, failed: 0 }) }))
  assert.equal(result.completed, 0)
  assert.equal(row(db).response.phase, 'unknown')
})

test('PostgREST serializes the real atomic JSON predicates and prefers returned rows', async () => {
  const requests = []
  const db = createClient('https://example.test', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: new URL(url), options })
      return new Response(JSON.stringify([{ id: AUTO }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } },
  })
  await markNotificationSending(db, { id: AUTO, automationId: AUTO, token: USER, attempt: 1, phase: 'preflight' }, 1)
  assert.equal(requests[0].url.searchParams.get('response->>token'), `eq.${USER}`)
  assert.equal(requests[0].url.searchParams.get('response->>phase'), 'eq.preflight')
  assert.equal(requests[0].url.searchParams.get('status'), 'eq.started')
  assert.match(new Headers(requests[0].options.headers).get('prefer'), /return=representation/)
  const update = JSON.parse(requests[0].options.body)
  assert.equal(update.response.plannedTotal, 1)
  assert.equal(update.response.sendingStarted, true)
  for (const counter of ['total', 'sent', 'failed']) assert.equal(Object.hasOwn(update, counter), false)
})

test('FCM send timeout includes body reading, aborts, and never retries a provider POST', async () => {
  let calls = 0, signal
  await assert.rejects(sendFcmHttpRequest({ accessToken: 'synthetic', projectId: 'test', message: {}, timeoutMs: 5,
    fetchImpl: async (_, options) => { calls += 1; signal = options.signal; return { text: () => new Promise(() => {}) } },
  }), { code: 'PROVIDER_TIMEOUT', retryable: false })
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
})

test('delivery log write failure is surfaced instead of masquerading as a saved recipient audit', async () => {
  let writes = 0
  const query = { insert() { writes += 1; return query }, select() { return query }, abortSignal() { return query },
    single: async () => ({ error: { code: '42501' } }) }
  const result = await recordNotificationDelivery({ from: () => query }, { payload: { title: 'test', body: 'test' } })
  assert.equal(result.recipientRecordsComplete, false)
  assert.equal(writes, 1)
})

test('provider outcomes and TR/EN/AR messages survive a recipient-audit outage without resending', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Real network is forbidden') })
  const oldPublic = process.env.VAPID_PUBLIC_KEY, oldPrivate = process.env.VAPID_PRIVATE_KEY
  // Client is fully replaced; these values are not cryptographic keys.
  process.env.VAPID_PUBLIC_KEY = 'synthetic-public'
  process.env.VAPID_PRIVATE_KEY = 'synthetic-private'
  t.after(() => {
    if (oldPublic === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = oldPublic
    if (oldPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = oldPrivate
  })
  const db = notificationMemoryDb([automation]), messages = []
  const handler = sender(db, {
    loadTargets: async () => ({ webSubscriptions: ['tr', 'en', 'ar'].map((language, i) => webTarget(language, i + 1)), nativeSubscriptions: [], storedTotal: 3, skipped: 0 }),
    webPushClient: { setVapidDetails() {}, sendNotification: async (_, payload) => messages.push(JSON.parse(payload)) },
    recordDelivery: async () => ({ deliveryLogId: null, recipientRecordsComplete: false }),
  })
  const result = await dispatch(db, (_, options) => callSender(handler, JSON.parse(options.body)))
  assert.equal(result.completed, 1)
  assert.equal(row(db).sent, 3)
  assert.deepEqual(messages.map((v) => v.title), ['Günaydın', 'Good morning', 'Good morning'])
  assert.deepEqual(messages.map((v) => v.body), ['İyi çalışmalar', 'Have a good day', 'Have a good day'])
  assert.deepEqual(row(db).response.recipientResults.map((v) => v.language), ['tr', 'en', 'en'])
  assert.equal(row(db).response.recipientRecordsComplete, false)
  assert.equal((await dispatch(db, () => { throw Error('must not send') }, 1)).skipped, 1)
})

test('optional legacy columns still fall back; permission errors never trigger schema fallback', async () => {
  const calls = []
  let deny = false
  const db = createClient('https://example.test', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url) => {
      const select = new URL(url).searchParams.get('select')
      calls.push(select)
      const missing = ['notification_language', 'device_hash'].find((column) => select.includes(column))
      if (deny || missing) return new Response(JSON.stringify({ code: deny ? '42501' : '42703', message: `column ${missing} is unavailable` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } })
    } },
  })
  assert.equal((await loadNotificationTargets(db)).storedTotal, 0)
  assert.equal(calls.length, 5)
  deny = true
  calls.length = 0
  await assert.rejects(loadNotificationTargets(db), { code: 'READ_REJECTED' })
  assert.equal(calls.length, 1)
})

test('a failed durable sending gate prevents every provider call', async () => {
  const db = notificationMemoryDb([automation])
  db.failure = ({ operation, values }) => operation === 'update' && values.response?.phase === 'sending'
    ? { error: { code: 'XX000' } } : null
  let records = 0
  const handler = sender(db, {
    loadTargets: async () => ({ webSubscriptions: [webTarget()], nativeSubscriptions: [], storedTotal: 1 }),
    recordDelivery: async () => { records += 1; throw Error('must not reach delivery stage') },
    webPushClient: { setVapidDetails() { throw Error('must not configure provider') }, sendNotification() { throw Error('must not send') } },
  })
  const result = await dispatch(db, (_, options) => callSender(handler, JSON.parse(options.body)))
  assert.equal(result.completed, 0)
  assert.equal(records, 0)
  assert.equal(row(db).response.retryable, false)
  assert.equal((await dispatch(db, () => { throw Error('must not retry') }, 1)).skipped, 1)
})

test('failure saving the final outcome after provider stage never permits a retry', async () => {
  const db = notificationMemoryDb()
  const run = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
  await markNotificationSending(db, run, 1)
  db.failure = ({ operation, values }) => operation === 'update' && values.response?.phase === 'finished'
    ? { error: { code: 'XX000' } } : null
  await assert.rejects(finishNotificationRun(db, run, { total: 1, sent: 1, failed: 0 }))
  await failNotificationRun(db, run, new NotificationReadError('READ_UNAVAILABLE', true))
  assert.equal(row(db).response.phase, 'unknown')
  assert.equal(await claimNotificationRun(db, AUTO, WHEN), null)
})

test('timeout during provider work accepts the same sender outcome without starting a second sender', async () => {
  const db = notificationMemoryDb([automation]), gate = deferred(), started = deferred()
  let pending
  const fetchImpl = async (_, options) => {
    pending = (async () => {
      const run = await beginNotificationRun(db, JSON.parse(options.body))
      await markNotificationSending(db, run, 1)
      started.resolve()
      await gate.promise
      await finishNotificationRun(db, run, { total: 1, sent: 1, failed: 0 })
    })()
    await pending
    return { json: async () => ({ total: 1, sent: 1, failed: 0 }) }
  }
  const dispatching = dispatch(db, fetchImpl, 0, { dispatchTimeoutMs: 40 })
  await started.promise
  const result = await dispatching
  assert.equal(result.results[0].outcome, 'unknown')
  gate.resolve()
  await pending
  assert.equal(row(db).status, 'completed')
  assert.equal(row(db).sent, 1)
  assert.equal((await dispatch(db, () => { throw Error('must not resend') }, 1)).skipped, 1)
})

for (const partial of [false, true]) {
  test(`late ${partial ? 'partial' : 'successful'} provider outcome retains recipient fallback after dispatcher timeout`, async (t) => {
    const oldPublic = process.env.VAPID_PUBLIC_KEY, oldPrivate = process.env.VAPID_PRIVATE_KEY
    process.env.VAPID_PUBLIC_KEY = 'synthetic-public'
    process.env.VAPID_PRIVATE_KEY = 'synthetic-private'
    t.after(() => {
      if (oldPublic === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = oldPublic
      if (oldPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = oldPrivate
    })
    t.mock.method(globalThis, 'fetch', async () => { throw Error('Real network is forbidden') })
    const db = notificationMemoryDb([automation]), gate = deferred()
    let pending, providerCalls = 0
    const handler = sender(db, {
      loadTargets: async () => ({ webSubscriptions: [webTarget('tr', 1), webTarget('en', 2)], nativeSubscriptions: [], storedTotal: 2, skipped: 0 }),
      webPushClient: {
        setVapidDetails() {},
        async sendNotification(subscription) {
          providerCalls += 1
          await gate.promise
          if (partial && subscription.endpoint.endsWith('/2')) throw Error('Synthetic provider failure')
        },
      },
      recordDelivery: async () => ({ deliveryLogId: null, recipientRecordsComplete: false }),
    })
    const result = await dispatch(db, (_, options) => {
      pending = callSender(handler, JSON.parse(options.body))
      return pending
    }, 0, { dispatchTimeoutMs: 40 })
    assert.equal(result.results[0].outcome, 'unknown')
    assert.equal(row(db).response.sendingStarted, true)
    gate.resolve()
    const late = await pending
    assert.equal(late.status, 200)
    assert.equal(providerCalls, 2)
    assert.equal(row(db).status, 'completed')
    assert.equal(row(db).sent, partial ? 1 : 2)
    assert.equal(row(db).failed, partial ? 1 : 0)
    assert.equal(row(db).response.recipientResults.length, 2)
    assert.equal(row(db).response.recipientRecordsComplete, false)
    assert.equal(row(db).response.recipientResults.filter((entry) => entry.status === 'sent').length, partial ? 1 : 2)
    assert.equal((await dispatch(db, () => { throw Error('must not resend') }, 1)).skipped, 1)
  })
}

test('dispatcher timeout during preflight prevents a late sending gate and provider work', async () => {
  const db = notificationMemoryDb([automation]), gate = deferred()
  let pending, providerCalls = 0
  const handler = sender(db, {
    loadTargets: () => gate.promise,
    webPushClient: { setVapidDetails() { providerCalls += 1 }, sendNotification() { providerCalls += 1 } },
  })
  const result = await dispatch(db, (_, options) => {
    pending = callSender(handler, JSON.parse(options.body))
    return pending
  }, 0, { dispatchTimeoutMs: 40 })
  assert.equal(result.results[0].outcome, 'unknown')
  assert.equal(row(db).response.sendingStarted, false)
  gate.resolve({ webSubscriptions: [webTarget()], nativeSubscriptions: [], storedTotal: 1, skipped: 0 })
  assert.equal((await pending).status, 409)
  assert.equal(providerCalls, 0)
  assert.equal(row(db).response.phase, 'unknown')
  assert.equal((await dispatch(db, () => { throw Error('must not resend') }, 1)).skipped, 1)
})

test('late outcomes cannot bypass an unsent fence or overwrite a newer token or terminal result', async () => {
  const db = notificationMemoryDb()
  const first = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
  await failNotificationRun(db, first, new NotificationReadError('READ_UNAVAILABLE', true))
  const next = await begin(db, await claimNotificationRun(db, AUTO, WHEN))
  await markNotificationSending(db, next, 2)
  await markNotificationDispatchUnknown(db, next)
  await assert.rejects(finishNotificationRun(db, { ...first, phase: 'sending' }, { total: 2, sent: 2, failed: 0 }), { code: 'RUN_CONFLICT' })
  assert.equal(row(db).response.token, next.token)
  const duplicate = { ...next }
  await finishNotificationRun(db, next, { total: 2, sent: 1, failed: 1 })
  await assert.rejects(finishNotificationRun(db, duplicate, { total: 2, sent: 2, failed: 0 }), { code: 'RUN_CONFLICT' })
  assert.equal(row(db).sent, 1)
  assert.equal(row(db).failed, 1)

  const unsentDb = notificationMemoryDb()
  const unsent = await begin(unsentDb, await claimNotificationRun(unsentDb, AUTO, WHEN))
  await markNotificationDispatchUnknown(unsentDb, unsent)
  await assert.rejects(finishNotificationRun(unsentDb, { ...unsent, phase: 'sending' }, { total: 1, sent: 1, failed: 0 }), { code: 'RUN_CONFLICT' })
  assert.equal(row(unsentDb).sent, 0)
})

for (const order of ['finish-first', 'timeout-first', 'simultaneous']) {
  test(`authoritative final counts survive the timeout/finish race: ${order}`, async () => {
    const db = notificationMemoryDb()
    const claimed = await claimNotificationRun(db, AUTO, WHEN)
    const run = await begin(db, claimed)
    await markNotificationSending(db, run, 3)
    const finish = () => finishNotificationRun(db, run, { total: 3, sent: 2, failed: 1 })
    const timeout = () => markNotificationDispatchUnknown(db, claimed)
    if (order === 'finish-first') { await finish(); await timeout() }
    else if (order === 'timeout-first') { await timeout(); await finish() }
    else await Promise.all([finish(), timeout()])
    assert.equal(row(db).status, 'completed')
    assert.equal(row(db).response.phase, 'finished')
    assert.equal(row(db).sent, 2)
    assert.equal(row(db).failed, 1)
    assert.equal(await claimNotificationRun(db, AUTO, WHEN), null)
  })
}

test('an unconfirmed claim INSERT is not retried or sent even if the database committed it', async () => {
  const memory = notificationMemoryDb([automation])
  let first = true, calls = 0
  const db = {
    from(table) {
      const query = memory.from(table)
      if (table === 'notification_automation_runs' && first) {
        const insert = query.insert
        query.insert = (record) => {
          insert(record)
          const then = query.then
          query.then = (resolve, reject) => then(() => { first = false; return { data: null, error: { code: 'ETIMEDOUT' } } }, reject).then(resolve, reject)
          return query
        }
      }
      return query
    },
  }
  const result = await dispatch(db, () => { calls += 1; throw Error('must not send') })
  assert.equal(result.failed, 1)
  assert.equal(calls, 0)
  assert.equal(memory.rows.size, 1)
  assert.equal((await dispatch(db, () => { calls += 1 }, 1)).skipped, 1)
  assert.equal(calls, 0)
})
