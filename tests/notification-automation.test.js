import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationMemoryDb } from './helpers/notification-memory-db.js'
import { claimNotificationRun, beginNotificationRun, markNotificationSending, finishNotificationRun } from '../api/_notification-run.js'

import {
  findDueAutomationOccurrence,
  getAutomationNotificationPayload,
  MAX_AUTOMATION_TARGET_USERS,
  normalizeAutomationDays,
  normalizeAutomationInput,
  normalizeAutomationTargetUserIds,
  normalizeAutomationTime,
  serializeAutomation,
} from '../api/_notification-automation.js'
import {
  dispatchDueAutomations,
  getNotificationSendEndpoint,
  isAuthorizedAutomationCron,
} from '../api/notification-automations.js'

const AUTOMATION_ID = 'c02e2629-18e0-4e2f-b38b-cc4fa0044bb6'
const SECOND_USER_ID = '0c9c2753-7304-4d77-941d-2be58ccfb05a'

function makeCustomAutomation(overrides = {}) {
  return {
    id: AUTOMATION_ID,
    name: 'Mesai başlangıcı',
    content_type: 'custom',
    audience_type: 'all',
    target_user_id: null,
    target_user_ids: null,
    delivery_scope: 'all_devices',
    timezone: 'Africa/Cairo',
    send_time: '07:30:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    title_tr: 'Günaydın',
    body_tr: 'İyi çalışmalar.',
    title_en: 'Good morning',
    body_en: 'Have a productive day.',
    url: '/',
    is_active: true,
    ...overrides,
  }
}

test('automation input normalizes a bilingual Cairo schedule', () => {
  assert.deepEqual(
    normalizeAutomationInput({
      name: ' Mesai başlangıcı ',
      contentType: 'custom',
      audienceType: 'all',
      deliveryScope: 'all_devices',
      sendTime: '07:30',
      daysOfWeek: [6, 1, 1, 0],
      titleTr: ' Günaydın ',
      bodyTr: ' İyi çalışmalar. ',
      titleEn: ' Good morning ',
      bodyEn: ' Have a productive day. ',
    }),
    {
      name: 'Mesai başlangıcı',
      content_type: 'custom',
      audience_type: 'all',
      target_user_id: null,
      target_user_ids: null,
      delivery_scope: 'all_devices',
      timezone: 'Africa/Cairo',
      send_time: '07:30',
      days_of_week: [0, 1, 6],
      title_tr: 'Günaydın',
      body_tr: 'İyi çalışmalar.',
      title_en: 'Good morning',
      body_en: 'Have a productive day.',
      url: '/',
      is_active: true,
    },
  )

  assert.equal(normalizeAutomationTime('07:30:00'), '07:30')
  assert.deepEqual(normalizeAutomationDays([5, 0, 5]), [0, 5])
})

test('automation targets accept multiple users, deduplicate IDs and keep legacy output', () => {
  const normalized = normalizeAutomationInput({
    ...makeCustomAutomation(),
    audienceType: 'user',
    targetUserIds: [
      AUTOMATION_ID.toUpperCase(),
      SECOND_USER_ID,
      AUTOMATION_ID,
    ],
    deliveryScope: 'latest_device',
  })

  assert.deepEqual(normalized.target_user_ids, [AUTOMATION_ID, SECOND_USER_ID])
  assert.equal(normalized.target_user_id, AUTOMATION_ID)
  assert.deepEqual(
    normalizeAutomationTargetUserIds({ targetUserId: SECOND_USER_ID }),
    [SECOND_USER_ID],
  )

  const serialized = serializeAutomation({
    ...makeCustomAutomation(),
    audience_type: 'user',
    target_user_id: AUTOMATION_ID,
    target_user_ids: [AUTOMATION_ID, SECOND_USER_ID],
  })
  assert.deepEqual(serialized.targetUserIds, [AUTOMATION_ID, SECOND_USER_ID])
  assert.equal(serialized.targetUserId, AUTOMATION_ID)

  assert.throws(
    () => normalizeAutomationInput({
      ...makeCustomAutomation(),
      audienceType: 'user',
      targetUserIds: [],
    }),
    /en az bir kullanıcı/,
  )
  assert.throws(
    () => normalizeAutomationInput({
      ...makeCustomAutomation(),
      targetUserIds: [AUTOMATION_ID],
    }),
    /kullanıcı hedeflenemez/,
  )
  assert.throws(
    () => normalizeAutomationTargetUserIds({
      targetUserIds: Array.from(
        { length: MAX_AUTOMATION_TARGET_USERS + 1 },
        (_, index) =>
          `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      ),
    }),
    /En fazla 100 kullanıcı/,
  )
})

test('automation input rejects invalid days, times and broadcast device scope', () => {
  assert.throws(() => normalizeAutomationDays([1, 7]), /Geçersiz gönderim günü/)
  assert.throws(() => normalizeAutomationTime('24:00'), /HH:MM/)
  assert.throws(
    () => normalizeAutomationInput({
      ...makeCustomAutomation(),
      delivery_scope: 'latest_device',
    }),
    /tüm aktif cihazlara/,
  )
  assert.throws(
    () => normalizeAutomationInput({
      ...makeCustomAutomation(),
      body_tr: '😀'.repeat(701),
    }),
    /bayt/,
  )
})

test('Cairo schedule finds the intended minute and respects selected weekdays', () => {
  const thursdayMorning = new Date('2026-09-03T04:31:30.000Z')

  assert.equal(
    findDueAutomationOccurrence(
      makeCustomAutomation({ days_of_week: [4] }),
      thursdayMorning,
      2,
    ),
    '2026-09-03T04:30:00.000Z',
  )
  assert.equal(
    findDueAutomationOccurrence(
      makeCustomAutomation({ days_of_week: [5] }),
      thursdayMorning,
      2,
    ),
    null,
  )
})

test('daily motivation automation creates matching Turkish and English payloads', () => {
  const payload = getAutomationNotificationPayload(
    makeCustomAutomation({ content_type: 'daily_motivation' }),
    new Date('2026-09-03T04:30:00.000Z'),
  )

  assert.equal(payload.title, payload.localizedMessages.en.title)
  assert.ok(payload.localizedMessages.en.body)
  assert.ok(payload.localizedMessages.tr.body)
  assert.notEqual(
    payload.localizedMessages.en.body,
    payload.localizedMessages.tr.body,
  )
})

test('cron authorization compares the bearer secret and send URL stays on the configured origin', () => {
  const env = {
    CRON_SECRET: 'cron-secret-value',
    PUBLIC_APP_URL: 'https://example.test/some/path',
  }

  assert.equal(
    isAuthorizedAutomationCron({
      headers: { authorization: 'Bearer cron-secret-value' },
    }, env),
    true,
  )
  assert.equal(
    isAuthorizedAutomationCron({
      headers: { authorization: 'Bearer wrong' },
    }, env),
    false,
  )
  assert.equal(
    isAuthorizedAutomationCron({
      headers: { authorization: 'Bearer undefined' },
    }, {}),
    false,
  )
  assert.equal(
    getNotificationSendEndpoint(env),
    'https://example.test/api/send-notification',
  )
  assert.equal(
    getNotificationSendEndpoint({
      VERCEL_URL: 'protected-deployment.example.test',
      VERCEL_PROJECT_PRODUCTION_URL: 'public-production.example.test',
    }),
    'https://public-production.example.test/api/send-notification',
  )
  assert.equal(
    getNotificationSendEndpoint({
      VERCEL_URL: 'protected-deployment.example.test',
    }),
    'https://barkod-rapor-web.vercel.app/api/send-notification',
  )
})

test('dispatcher rejects a protected deployment login page instead of reporting success', async () => {
  const db = notificationMemoryDb([makeCustomAutomation({ days_of_week: [4] })])
  const result = await dispatchDueAutomations(db, {
    now: new Date('2026-09-03T04:30:15.000Z'),
    env: { NOTIFICATION_ADMIN_SECRET: 'synthetic-test-secret' },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML is not JSON') } }),
  })
  assert.equal(result.completed, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.results[0].outcome, 'unknown')
  assert.equal([...db.rows.values()][0].status, 'failed')
})

test('due dispatcher sends all selected user IDs without putting its secret in the body', async () => {
  const db = notificationMemoryDb([makeCustomAutomation({
    days_of_week: [4], audience_type: 'user', target_user_id: AUTOMATION_ID,
    target_user_ids: [AUTOMATION_ID, SECOND_USER_ID], delivery_scope: 'latest_device',
  })])
  const fetchCalls = []
  const result = await dispatchDueAutomations(db, {
    now: new Date('2026-09-03T04:30:15.000Z'),
    env: { NOTIFICATION_ADMIN_SECRET: 'synthetic-test-secret', PUBLIC_APP_URL: 'https://example.test' },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body)
      fetchCalls.push({ url, options, body })
      const run = await beginNotificationRun(db, body)
      await markNotificationSending(db, run, 3)
      await finishNotificationRun(db, run, { total: 3, sent: 3, failed: 0, nativeSent: 3 })
      return { ok: true, status: 200, json: async () => ({ total: 3, sent: 3, failed: 0 }) }
    },
  })
  assert.equal(result.due, 1)
  assert.equal(result.completed, 1)
  assert.equal(result.failed, 0)
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer synthetic-test-secret')
  assert.equal('secret' in fetchCalls[0].body, false)
  assert.equal(fetchCalls[0].body.automationId, AUTOMATION_ID)
  assert.equal(fetchCalls[0].body.automationRunId, [...db.rows.keys()][0])
  assert.equal(fetchCalls[0].body.audienceType, 'user')
  assert.deepEqual(fetchCalls[0].body.targetUserIds, [AUTOMATION_ID, SECOND_USER_ID])
  assert.equal(fetchCalls[0].body.targetUserId, AUTOMATION_ID)
  assert.equal(fetchCalls[0].body.singleDevice, true)
  assert.equal(fetchCalls[0].body.localizedMessages.tr.title, 'Günaydın')
  assert.equal([...db.rows.values()][0].status, 'completed')
})

test('duplicate scheduled occurrence is skipped before any notification is sent', async () => {
  const db = notificationMemoryDb([makeCustomAutomation({ days_of_week: [4] })])
  await claimNotificationRun(db, AUTOMATION_ID, '2026-09-03T04:30:00.000Z')
  let fetchCount = 0
  const result = await dispatchDueAutomations(db, {
    now: new Date('2026-09-03T04:30:15.000Z'),
    env: { NOTIFICATION_ADMIN_SECRET: 'synthetic-test-secret' },
    fetchImpl: async () => { fetchCount += 1; throw Error('must not send') },
  })
  assert.equal(result.due, 1)
  assert.equal(result.skipped, 1)
  assert.equal(fetchCount, 0)
})
