import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DAILY_MOTIVATION_MESSAGES,
  getDailyMotivation,
  getCairoCalendarDate,
} from '../api/_daily-motivation.js'
import {
  claimDailyMotivationRun,
  getAuthorizedCronMotivation,
  getDailyMotivationRunStatus,
} from '../api/send-notification.js'

test('90 unique and notification-safe motivational messages are configured', () => {
  assert.equal(DAILY_MOTIVATION_MESSAGES.length, 90)
  assert.equal(
    new Set(DAILY_MOTIVATION_MESSAGES.map((message) => message.en)).size,
    90,
  )
  assert.equal(
    new Set(DAILY_MOTIVATION_MESSAGES.map((message) => message.tr)).size,
    90,
  )

  for (const message of DAILY_MOTIVATION_MESSAGES) {
    assert.equal(typeof message.en, 'string')
    assert.equal(typeof message.tr, 'string')
    assert.ok(message.en.length > 0)
    assert.ok(message.tr.length > 0)
    assert.ok(message.en.length <= 120)
    assert.ok(message.tr.length <= 120)
  }
})

test('daily motivation contains matching English and Turkish payloads', () => {
  const motivation = getDailyMotivation(
    new Date('2026-09-04T04:30:00.000Z'),
  )
  const message = DAILY_MOTIVATION_MESSAGES[motivation.messageId - 1]

  assert.equal(motivation.body, message.en)
  assert.equal(motivation.messages.en.body, message.en)
  assert.equal(motivation.messages.tr.body, message.tr)
  assert.equal(motivation.messages.en.title, 'Good Morning ☀️')
  assert.equal(motivation.messages.tr.title, 'Günaydın ☀️')
})

test('each message is used once before the 90-day cycle repeats', () => {
  const start = Date.UTC(2026, 0, 1, 12)
  const firstCycle = Array.from({ length: 90 }, (_, offset) =>
    getDailyMotivation(new Date(start + offset * 86_400_000)).messageId,
  )
  const secondCycle = Array.from({ length: 90 }, (_, offset) =>
    getDailyMotivation(new Date(start + (offset + 90) * 86_400_000)).messageId,
  )

  assert.equal(new Set(firstCycle).size, 90)
  assert.deepEqual(secondCycle, firstCycle)
})

test('calendar date follows Africa/Cairo around the UTC day boundary', () => {
  assert.deepEqual(
    getCairoCalendarDate(new Date('2026-12-31T22:30:00.000Z')),
    { year: 2027, month: 1, day: 1 },
  )
  assert.deepEqual(
    getCairoCalendarDate(new Date('2026-09-03T21:30:00.000Z')),
    { year: 2026, month: 9, day: 4 },
  )
})

test('cron authentication requires an exact bearer secret', () => {
  const env = { CRON_SECRET: 'strong-test-secret' }
  const date = new Date('2026-09-04T04:30:00.000Z')

  const motivation = getAuthorizedCronMotivation({
      headers: { authorization: 'Bearer strong-test-secret' },
    }, { env, date })
  assert.equal(motivation.date, getDailyMotivation(date).date)
  assert.equal(motivation.messageId, getDailyMotivation(date).messageId)
  assert.equal(motivation.scheduleAttempt, 'primary')
  assert.throws(
    () => getAuthorizedCronMotivation({
      headers: { authorization: 'Bearer wrong-secret' },
    }, { env, date }),
    /Yetkisiz/,
  )
})

test('authenticated cron requests outside Cairo delivery windows are skipped', () => {
  const request = {
    headers: { authorization: 'Bearer strong-test-secret' },
  }
  const env = { CRON_SECRET: 'strong-test-secret' }

  assert.deepEqual(
    getAuthorizedCronMotivation(request, {
      env,
      date: new Date('2026-09-04T05:30:00.000Z'),
    }),
    { skipped: true, reason: 'outside_cairo_schedule' },
  )
  assert.deepEqual(
    getAuthorizedCronMotivation(request, {
      env,
      date: new Date('2026-12-01T04:30:00.000Z'),
    }),
    { skipped: true, reason: 'outside_cairo_schedule' },
  )
})

test('cron authentication fails closed when the secret is missing', () => {
  assert.throws(
    () => getAuthorizedCronMotivation({ headers: {} }, { env: {} }),
    /güvenlik ayarı eksik/,
  )
})

test('daily run claim treats the date primary key as an idempotency key', async () => {
  const rpcCalls = []
  const createClient = (data, error = null) => ({
    async rpc(name, parameters) {
      rpcCalls.push({ name, parameters })
      return { data, error }
    },
  })
  const motivation = getDailyMotivation(
    new Date('2026-09-03T04:30:00.000Z'),
  )

  assert.deepEqual(
    await claimDailyMotivationRun(createClient(true), motivation),
    { claimed: true },
  )
  assert.deepEqual(
    await claimDailyMotivationRun(
      createClient(false),
      motivation,
    ),
    { claimed: false, reason: 'already_completed_or_running' },
  )
  assert.deepEqual(rpcCalls[0], {
    name: 'claim_daily_motivation_run',
    parameters: {
      p_run_date: '2026-09-03',
      p_message_id: motivation.messageId,
      p_lease_minutes: 60,
    },
  })

  await assert.rejects(
    claimDailyMotivationRun(
      createClient(null, { message: 'database unavailable' }),
      motivation,
    ),
    /kaydı oluşturulamadı/,
  )
})

test('daily run status is terminal for partial delivery without hiding failures', () => {
  assert.equal(
    getDailyMotivationRunStatus({ sent: 5, failed: 0 }),
    'completed',
  )
  assert.equal(
    getDailyMotivationRunStatus({ sent: 0, failed: 5 }),
    'failed',
  )
  assert.equal(
    getDailyMotivationRunStatus({ sent: 3, failed: 2 }),
    'partial',
  )
  assert.equal(
    getDailyMotivationRunStatus({ sent: 0, failed: 0 }),
    'completed',
  )
})
