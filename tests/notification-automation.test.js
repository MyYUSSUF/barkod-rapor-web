import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findDueAutomationOccurrence,
  getAutomationNotificationPayload,
  normalizeAutomationDays,
  normalizeAutomationInput,
  normalizeAutomationTime,
} from '../api/_notification-automation.js'
import {
  dispatchDueAutomations,
  getNotificationSendEndpoint,
  isAuthorizedAutomationCron,
} from '../api/notification-automations.js'

const AUTOMATION_ID = 'c02e2629-18e0-4e2f-b38b-cc4fa0044bb6'
const RUN_ID = '01d6c5c5-cbfd-4eb5-a10d-df3bedbdb2a7'

function makeCustomAutomation(overrides = {}) {
  return {
    id: AUTOMATION_ID,
    name: 'Mesai başlangıcı',
    content_type: 'custom',
    audience_type: 'all',
    target_user_id: null,
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
})

test('due dispatcher claims one run and sends localized content without putting its secret in the body', async () => {
  const databaseCalls = []
  const fetchCalls = []
  const automation = makeCustomAutomation({ days_of_week: [4] })
  const supabaseAdmin = {
    from(table) {
      if (table === 'notification_automations') {
        return {
          select() {
            return {
              eq(column, value) {
                databaseCalls.push({ table, operation: 'select', column, value })
                return Promise.resolve({ data: [automation], error: null })
              },
            }
          },
        }
      }

      if (table === 'notification_automation_runs') {
        return {
          insert(record) {
            databaseCalls.push({ table, operation: 'insert', record })
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: RUN_ID }, error: null })
                  },
                }
              },
            }
          },
          update(record) {
            databaseCalls.push({ table, operation: 'update', record })
            return {
              eq(column, value) {
                databaseCalls.push({ table, operation: 'eq', column, value })
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options, body: JSON.parse(options.body) })
    return {
      ok: true,
      status: 200,
      async json() {
        return { total: 3, sent: 3, failed: 0, nativeSent: 3 }
      },
    }
  }
  const result = await dispatchDueAutomations(supabaseAdmin, {
    now: new Date('2026-09-03T04:30:15.000Z'),
    env: {
      NOTIFICATION_ADMIN_SECRET: 'notification-secret-value',
      PUBLIC_APP_URL: 'https://example.test',
    },
    fetchImpl,
  })

  assert.equal(result.due, 1)
  assert.equal(result.completed, 1)
  assert.equal(result.failed, 0)
  assert.equal(fetchCalls.length, 1)
  assert.equal(
    fetchCalls[0].options.headers.Authorization,
    'Bearer notification-secret-value',
  )
  assert.equal('secret' in fetchCalls[0].body, false)
  assert.equal(fetchCalls[0].body.automationId, AUTOMATION_ID)
  assert.equal(fetchCalls[0].body.automationRunId, RUN_ID)
  assert.equal(fetchCalls[0].body.localizedMessages.tr.title, 'Günaydın')
  assert.equal(
    databaseCalls.filter((call) => call.operation === 'insert').length,
    1,
  )
  assert.equal(
    databaseCalls.find((call) => call.operation === 'update').record.status,
    'completed',
  )
})

test('duplicate scheduled occurrence is skipped before any notification is sent', async () => {
  let fetchCount = 0
  const automation = makeCustomAutomation({ days_of_week: [4] })
  const supabaseAdmin = {
    from(table) {
      if (table === 'notification_automations') {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: [automation], error: null })
              },
            }
          },
        }
      }

      if (table === 'notification_automation_runs') {
        return {
          insert() {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({
                      data: null,
                      error: { code: '23505' },
                    })
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
  const result = await dispatchDueAutomations(supabaseAdmin, {
    now: new Date('2026-09-03T04:30:15.000Z'),
    env: { NOTIFICATION_ADMIN_SECRET: 'notification-secret-value' },
    fetchImpl: async () => {
      fetchCount += 1
      throw new Error('should not run')
    },
  })

  assert.equal(result.due, 1)
  assert.equal(result.skipped, 1)
  assert.equal(fetchCount, 0)
})
