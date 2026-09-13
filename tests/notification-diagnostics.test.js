import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { notificationErrorDiagnostics, readNotificationData, withNotificationTimeout } from '../api/_notification-retry.js'
import { claimNotificationRun, NotificationRunError } from '../api/_notification-run.js'
import { dispatchDueAutomations } from '../api/notification-automations.js'
import { notificationMemoryDb } from './helpers/notification-memory-db.js'

const AUTO = '11111111-1111-4111-8111-111111111111'
const WHEN = '2026-09-13T04:30:00.000Z'
const privateText = 'private-url/token/password/email/db-row'
test.beforeEach((t) => t.mock.method(globalThis, 'fetch', () => { throw Error('Real network forbidden') }))

test('read diagnostics distinguish HTTP, database, deadline and transport errors without private data', async () => {
  for (const [result, kind, dbCode, httpStatus] of [
    [{ status: 504, error: { message: privateText } }, 'http', null, 504],
    [{ status: 403, error: { code: '42501', message: privateText } }, 'database', '42501', 403],
  ]) {
    await assert.rejects(readNotificationData(async () => result, { sleep: async () => {} }), (error) => {
      const diagnostic = notificationErrorDiagnostics(error)
      assert.equal(diagnostic.failureKind, kind)
      assert.equal(diagnostic.databaseCode, dbCode)
      assert.equal(diagnostic.httpStatus, httpStatus)
      assert.equal(diagnostic.attempts, kind === 'database' ? 1 : 3)
      assert.ok(diagnostic.elapsedMs >= 0)
      assert.doesNotMatch(JSON.stringify(diagnostic), /private|password|email/)
      assert.doesNotMatch(JSON.stringify(error), /private|password|email/)
      assert.equal(error.cause.message, privateText, 'legacy fallback may inspect a non-enumerable cause')
      return true
    })
  }
  await assert.rejects(readNotificationData(() => new Promise(() => {}), { timeoutMs: 5, maxAttempts: 1 }), (error) => {
    const diagnostic = notificationErrorDiagnostics(error)
    assert.equal(diagnostic.failureKind, 'deadline')
    assert.equal(diagnostic.timeoutMs, 5)
    assert.equal(diagnostic.attempts, 1)
    return true
  })
  await assert.rejects(readNotificationData(async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET', message: privateText } })
  }, { maxAttempts: 1 }), (error) => {
    assert.equal(notificationErrorDiagnostics(error).networkCode, 'ECONNRESET')
    assert.equal(notificationErrorDiagnostics(error).failureKind, 'network')
    return true
  })
})

test('read diagnostics do not invent a network cause or mislabel a thrown HTTP failure', async () => {
  for (const [original, kind, status] of [
    [new SyntaxError(privateText), 'unknown', null],
    [Object.assign(new Error(privateText), { status: 504 }), 'http', 504],
  ]) {
    await assert.rejects(readNotificationData(() => { throw original }, { maxAttempts: 1 }), (error) => {
      const diagnostic = notificationErrorDiagnostics(error)
      assert.equal(diagnostic.failureKind, kind)
      assert.equal(diagnostic.httpStatus, status)
      assert.equal(diagnostic.networkCode, null)
      assert.doesNotMatch(JSON.stringify(diagnostic), /private|password|email/)
      return true
    })
  }
})

test('claim keeps real SDK HTTP errors and write attempts bounded; no provider and no write retry', async () => {
  let calls = 0
  const db = createClient('https://example.test', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => {
      calls += 1
      return new Response(`<html>${privateText}</html>`, { status: 504, headers: { 'Content-Type': 'text/html' } })
    } },
  })
  await assert.rejects(claimNotificationRun(db, AUTO, WHEN), (error) => {
    const diagnostic = notificationErrorDiagnostics(error)
    assert.equal(diagnostic.code, 'RUN_WRITE_UNCERTAIN')
    assert.equal(diagnostic.failureKind, 'http')
    assert.equal(diagnostic.httpStatus, 504)
    assert.equal(diagnostic.attempts, 1)
    assert.doesNotMatch(JSON.stringify(error), /private|password|email/)
    return true
  })
  assert.equal(calls, 1)
})

test('write deadline and low-level network codes survive wrapping without the original error', async () => {
  try { await withNotificationTimeout(() => new Promise(() => {}), 5, 'RUN_WRITE_UNCERTAIN') }
  catch (cause) {
    const error = new NotificationRunError('RUN_WRITE_UNCERTAIN', 503, cause, { attempts: 1, elapsedMs: 5 })
    assert.equal(notificationErrorDiagnostics(error).failureKind, 'deadline')
    assert.equal(notificationErrorDiagnostics(error).timeoutMs, 5)
    assert.equal(error.cause, undefined)
  }
  const error = new NotificationRunError('RUN_WRITE_UNCERTAIN', 503,
    new TypeError(privateText, { cause: { code: 'ECONNRESET', message: privateText } }))
  assert.equal(notificationErrorDiagnostics(error).networkCode, 'ECONNRESET')
  assert.equal(notificationErrorDiagnostics(error).failureKind, 'network')
  assert.doesNotMatch(JSON.stringify(error), /private|password|email/)
})

test('arbitrary errors cannot inject secret codes, messages, status or durations into diagnostics', () => {
  assert.equal(notificationErrorDiagnostics({ code: 'TOKEN' }).code, 'NOTIFICATION_ERROR')
  const diagnostic = notificationErrorDiagnostics({
    code: privateText, databaseCode: privateText, status: privateText, name: privateText,
    cause: { code: privateText, message: privateText }, failureKind: privateText,
    attempts: 9999, elapsedMs: Infinity, timeoutMs: -1,
  })
  assert.deepEqual(diagnostic, {
    code: 'NOTIFICATION_ERROR', databaseCode: null, httpStatus: null, failureKind: 'unknown',
    networkCode: null, attempts: null, elapsedMs: null, timeoutMs: null,
  })
})

test('dispatcher records the failing database stage and safe diagnostic details', async (t) => {
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  const db = notificationMemoryDb()
  db.failure = () => ({ status: 403, error: { code: '42501', message: privateText, details: privateText } })
  await assert.rejects(dispatchDueAutomations(db, { fetchImpl: () => { throw Error('must not send') } }))
  assert.equal(logs[0][1].stage, 'automation_read')
  assert.equal(logs[0][1].databaseCode, '42501')
  assert.equal(logs[0][1].httpStatus, 403)
  assert.equal(logs[0][1].attempts, 1)
  assert.doesNotMatch(JSON.stringify(logs), /private|password|email/)
})
