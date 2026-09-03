import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLEANUP_BATCH_SIZE,
  cleanupInvalidSubscriptionIds,
  fetchAllPages,
  filterEligibleNotificationTargets,
  getDeliveryResponseStatus,
  getScheduledNotificationPayload,
  limitNotificationTargetsToLatest,
  MAX_NOTIFICATION_BODY_LENGTH,
  MAX_NOTIFICATION_TITLE_LENGTH,
  normalizeNotificationTargetUserId,
  validateNotificationPayload,
} from '../api/send-notification.js'
import {
  createNativeSubscriptionRecord,
  hashDeviceToken,
  normalizePushRegistrationRequest,
  replaceNativePushSubscription,
  unregisterNativePushSubscription,
} from '../api/push-registration.js'
import { rememberNativeNotificationLanguage } from '../api/report-url.js'

function createFakeSupabase({
  deleteResults = [],
  selectResults = [],
  upsertResults = [],
} = {}) {
  const calls = []

  const createFilterBuilder = ({ operation, table, options, result }) => {
    const filters = []
    const builder = {
      eq(column, value) {
        filters.push(['eq', column, value])
        return builder
      },
      neq(column, value) {
        filters.push(['neq', column, value])
        return builder
      },
      is(column, value) {
        filters.push(['is', column, value])
        return builder
      },
      in(column, value) {
        filters.push(['in', column, value])
        return builder
      },
      then(resolve, reject) {
        calls.push({ operation, table, options, filters })
        return Promise.resolve(result).then(resolve, reject)
      },
    }

    return builder
  }

  return {
    calls,
    from(table) {
      return {
        delete(options) {
          const result = deleteResults.shift() || { count: 0, error: null }
          return createFilterBuilder({
            operation: 'delete',
            table,
            options,
            result,
          })
        },
        select(columns, options) {
          const result = selectResults.shift() || { count: 0, error: null }
          return createFilterBuilder({
            operation: 'select',
            table,
            options: { columns, ...options },
            result,
          })
        },
        upsert(record, options) {
          calls.push({ operation: 'upsert', table, record, options })
          return Promise.resolve(upsertResults.shift() || { error: null })
        },
      }
    },
  }
}

test('notification payload applies defaults and rejects unsafe title/body sizes', () => {
  assert.deepEqual(validateNotificationPayload({}), {
    title: 'Elvan Barkod Rapor',
    body: 'Yeni bildiriminiz var.',
    url: '/',
  })

  assert.throws(
    () => validateNotificationPayload({
      title: 'x'.repeat(MAX_NOTIFICATION_TITLE_LENGTH + 1),
    }),
    /başlığı en fazla/,
  )
  assert.throws(
    () => validateNotificationPayload({
      body: 'x'.repeat(MAX_NOTIFICATION_BODY_LENGTH + 1),
    }),
    /mesajı en fazla/,
  )
  assert.throws(
    () => validateNotificationPayload({ body: '😀'.repeat(701) }),
    /bayt/,
  )
})

test('manual notification target accepts only a valid user UUID', () => {
  const userId = 'c02e2629-18e0-4e2f-b38b-cc4fa0044bb6'

  assert.equal(normalizeNotificationTargetUserId(` ${userId.toUpperCase()} `), userId)
  assert.equal(normalizeNotificationTargetUserId(''), null)
  assert.throws(
    () => normalizeNotificationTargetUserId('yusuf'),
    /Geçersiz bildirim hedefi/,
  )
})

test('single-device delivery keeps only the most recently updated eligible target', () => {
  const targets = {
    webSubscriptions: [
      { id: 'web-1', updated_at: '2026-09-01T08:00:00.000Z' },
    ],
    nativeSubscriptions: [
      { id: 'ios-old', updated_at: '2026-08-16T10:00:00.000Z' },
      { id: 'ios-current', updated_at: '2026-09-03T11:00:00.000Z' },
    ],
    skipped: { inactiveProfile: 0 },
    storedTotal: 3,
  }

  assert.deepEqual(limitNotificationTargetsToLatest(targets), {
    webSubscriptions: [],
    nativeSubscriptions: [
      { id: 'ios-current', updated_at: '2026-09-03T11:00:00.000Z' },
    ],
    skipped: { inactiveProfile: 0, otherDevices: 2 },
    storedTotal: 3,
  })
})

test('scheduled payload follows each subscription language and defaults unknown registrations to Turkish', () => {
  const motivation = {
    title: 'Good Morning',
    body: 'Keep going.',
    url: '/',
    messages: {
      en: { title: 'Good Morning', body: 'Keep going.' },
      tr: { title: 'Günaydın', body: 'Devam et.' },
    },
  }

  assert.deepEqual(getScheduledNotificationPayload(motivation, 'en'), {
    title: 'Good Morning',
    body: 'Keep going.',
    url: '/',
  })
  assert.deepEqual(getScheduledNotificationPayload(motivation, 'tr'), {
    title: 'Günaydın',
    body: 'Devam et.',
    url: '/',
  })
  assert.deepEqual(getScheduledNotificationPayload(motivation, null), {
    title: 'Günaydın',
    body: 'Devam et.',
    url: '/',
  })
})

test('scheduled payload also supports the localized compatibility key', () => {
  const motivation = {
    title: 'Good Morning',
    body: 'Keep going.',
    localized: {
      en: { title: 'Good Morning', body: 'Keep going.' },
      tr: { title: 'Günaydın', body: 'Devam et.' },
    },
  }

  assert.equal(
    getScheduledNotificationPayload(motivation, 'tr').body,
    'Devam et.',
  )
})

test('paginated reads consume every counted row and fail explicitly above the bound', async () => {
  const source = Array.from({ length: 1201 }, (_, index) => ({ id: index }))
  const ranges = []
  const rows = await fetchAllPages(
    async (from, to) => {
      ranges.push([from, to])
      return {
        data: source.slice(from, to + 1),
        count: source.length,
        error: null,
      }
    },
    { pageSize: 500, maxRows: 2000, label: 'Test kayıtları' },
  )

  assert.equal(rows.length, source.length)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1200]])

  await assert.rejects(
    fetchAllPages(
      async () => ({ data: [], count: 2001, error: null }),
      { maxRows: 2000, label: 'Test kayıtları' },
    ),
    /2001\/2000/,
  )
})

test('broadcast targets require an active profile and a non-revoked native device', () => {
  const result = filterEligibleNotificationTargets({
    profiles: [
      { id: 'active', is_active: true },
      { id: 'inactive', is_active: false },
      { id: 'legacy-safe', is_active: true },
      { id: 'legacy-revoked', is_active: true },
    ],
    userDevices: [
      { user_id: 'active', device_hash: 'approved-hash', status: 'approved' },
      { user_id: 'active', device_hash: 'revoked-hash', status: 'revoked' },
      { user_id: 'inactive', device_hash: 'inactive-hash', status: 'approved' },
      { user_id: 'legacy-revoked', device_hash: 'old-hash', status: 'revoked' },
    ],
    webSubscriptions: [
      { id: 'web-active', user_id: 'active' },
      { id: 'web-inactive', user_id: 'inactive' },
      { id: 'web-missing-profile', user_id: 'missing' },
    ],
    nativeSubscriptions: [
      { id: 'native-active', user_id: 'active', device_hash: 'approved-hash' },
      { id: 'native-revoked', user_id: 'active', device_hash: 'revoked-hash' },
      { id: 'native-missing-device', user_id: 'active', device_hash: 'missing-hash' },
      { id: 'native-inactive', user_id: 'inactive', device_hash: 'inactive-hash' },
      { id: 'native-legacy-safe', user_id: 'legacy-safe', device_hash: null },
      { id: 'native-legacy-revoked', user_id: 'legacy-revoked', device_hash: null },
    ],
  })

  assert.deepEqual(
    result.webSubscriptions.map((item) => item.id),
    ['web-active'],
  )
  assert.deepEqual(
    result.nativeSubscriptions.map((item) => item.id),
    ['native-active', 'native-legacy-safe'],
  )
  assert.deepEqual(result.skipped, {
    inactiveProfile: 3,
    revokedDevice: 1,
    missingDevice: 1,
    legacyUnmappedDevice: 1,
  })
})

test('complete delivery failure is non-2xx while partial delivery stays compatible', () => {
  assert.equal(getDeliveryResponseStatus({ total: 3, sent: 0, failed: 3 }), 502)
  assert.equal(getDeliveryResponseStatus({ total: 3, sent: 1, failed: 2 }), 200)
  assert.equal(getDeliveryResponseStatus({ total: 0, sent: 0, failed: 0 }), 200)
})

test('native registration hashes the server device token and replaces a mapped installation token', async () => {
  const deviceHash = hashDeviceToken('a'.repeat(32))
  assert.match(deviceHash, /^[a-f0-9]{64}$/)
  assert.notEqual(deviceHash, hashDeviceToken('b'.repeat(32)))

  const request = normalizePushRegistrationRequest({
    platform: 'android',
    token: 'fcm-token-value-that-is-long-enough',
    notificationLanguage: 'EN',
  })
  assert.deepEqual(request, {
    action: 'register',
    platform: 'android',
    token: 'fcm-token-value-that-is-long-enough',
    notificationLanguage: 'en',
  })

  const record = createNativeSubscriptionRecord({
    userId: 'user-1',
    deviceHash,
    platform: request.platform,
    token: request.token,
    deviceName: 'Android',
    appVersion: '16',
    notificationLanguage: request.notificationLanguage,
    now: new Date('2026-08-03T12:00:00.000Z'),
  })
  const fake = createFakeSupabase()
  await replaceNativePushSubscription(fake, record)

  assert.deepEqual(fake.calls[0].filters, [
    ['eq', 'device_hash', deviceHash],
    ['neq', 'token', request.token],
  ])
  assert.equal(fake.calls[1].operation, 'upsert')
  assert.equal(fake.calls[1].record.device_hash, deviceHash)
  assert.equal(fake.calls[1].record.notification_language, 'en')
  assert.deepEqual(fake.calls[1].options, { onConflict: 'token' })
  assert.equal(
    fake.calls.some((call) =>
      call.filters?.some(
        (filter) => filter[0] === 'is' && filter[1] === 'device_hash',
      ),
    ),
    false,
  )
})

test('authenticated unregister deletes only the current user installation', async () => {
  assert.deepEqual(normalizePushRegistrationRequest({ action: 'unregister' }), {
    action: 'unregister',
    platform: 'android',
    token: '',
    notificationLanguage: null,
  })

  const fake = createFakeSupabase({
    deleteResults: [{ count: 1, error: null }],
  })
  const result = await unregisterNativePushSubscription(fake, {
    userId: 'user-1',
    deviceHash: 'hash-1',
    token: '',
  })

  assert.deepEqual(result, { deleted: 1, legacyTokenRequired: false })
  assert.deepEqual(fake.calls[0].filters, [
    ['eq', 'user_id', 'user-1'],
    ['eq', 'device_hash', 'hash-1'],
  ])
})

test('iOS APNs kayitlarini yerel bildirim tablosuna kabul eder', () => {
  const token = 'a'.repeat(64)
  assert.deepEqual(
    normalizePushRegistrationRequest({ platform: 'ios', token }),
    { action: 'register', platform: 'ios', token, notificationLanguage: null },
  )
  assert.deepEqual(
    normalizePushRegistrationRequest({ platform: 'ios-sandbox', token }),
    {
      action: 'register',
      platform: 'ios-sandbox',
      token,
      notificationLanguage: null,
    },
  )
})

test('native registration validates language and preserves it when an older build omits it', () => {
  assert.throws(
    () => normalizePushRegistrationRequest({
      platform: 'android',
      token: 'fcm-token-value-that-is-long-enough',
      notificationLanguage: 'de',
    }),
    /bildirim dili/,
  )

  const record = createNativeSubscriptionRecord({
    userId: 'user-1',
    deviceHash: 'hash-1',
    platform: 'android',
    token: 'fcm-token-value-that-is-long-enough',
  })

  assert.equal('notification_language' in record, false)
})

test('native registration remains compatible while the language migration is rolling out', async () => {
  const missingLanguageError = {
    message: "Could not find the 'notification_language' column",
  }
  const fake = createFakeSupabase({
    upsertResults: [
      { error: missingLanguageError },
      { error: null },
    ],
  })
  const record = createNativeSubscriptionRecord({
    userId: 'user-1',
    deviceHash: 'hash-1',
    platform: 'android',
    token: 'fcm-token-value-that-is-long-enough',
    notificationLanguage: 'tr',
  })

  assert.deepEqual(
    await replaceNativePushSubscription(fake, record),
    { legacySchema: false },
  )
  assert.equal(fake.calls[1].record.notification_language, 'tr')
  assert.equal('notification_language' in fake.calls[2].record, false)
})

test('authenticated report requests can teach an existing native registration its language', async () => {
  const calls = []
  const authResult = {
    deviceHash: 'a'.repeat(64),
    supabase: {
      async rpc(name, parameters) {
        calls.push({ name, parameters })
        return { data: true, error: null }
      },
    },
  }

  assert.equal(
    await rememberNativeNotificationLanguage(authResult, 'ar'),
    true,
  )
  assert.deepEqual(calls, [{
    name: 'set_native_notification_language',
    parameters: {
      p_device_hash: 'a'.repeat(64),
      p_notification_language: 'en',
    },
  }])
})

test('language discovery never blocks a report when the preference cannot be saved', async () => {
  const authResult = {
    deviceHash: 'a'.repeat(64),
    supabase: {
      async rpc() {
        return { data: null, error: { message: 'migration pending' } }
      },
    },
  }

  assert.equal(
    await rememberNativeNotificationLanguage(authResult, 'tr'),
    false,
  )
})

test('legacy schema fallback keeps registration compatible until migration runs', async () => {
  const missingColumnError = { message: "Could not find the 'device_hash' column" }
  const fake = createFakeSupabase({
    deleteResults: [{ error: missingColumnError }],
  })
  const record = createNativeSubscriptionRecord({
    userId: 'user-1',
    deviceHash: 'hash-1',
    platform: 'android',
    token: 'fcm-token-value-that-is-long-enough',
    now: new Date('2026-08-03T12:00:00.000Z'),
  })
  const result = await replaceNativePushSubscription(fake, record)

  assert.deepEqual(result, { legacySchema: true })
  assert.equal('device_hash' in fake.calls[1].record, false)
})

test('legacy unregister can fall back to the authenticated user token', async () => {
  const missingColumnError = { message: "Could not find the 'device_hash' column" }
  const fake = createFakeSupabase({
    deleteResults: [
      { count: null, error: missingColumnError },
      { count: 1, error: null },
    ],
  })
  const result = await unregisterNativePushSubscription(fake, {
    userId: 'user-1',
    deviceHash: 'hash-1',
    token: 'fcm-token-value-that-is-long-enough',
  })

  assert.deepEqual(result, { deleted: 1, legacyTokenRequired: false })
  assert.deepEqual(fake.calls[1].filters, [
    ['eq', 'user_id', 'user-1'],
    ['eq', 'token', 'fcm-token-value-that-is-long-enough'],
  ])
})

test('migrated legacy unregister falls back to the user token after a hash miss', async () => {
  const fake = createFakeSupabase({
    deleteResults: [
      { count: 0, error: null },
      { count: 1, error: null },
    ],
  })
  const result = await unregisterNativePushSubscription(fake, {
    userId: 'user-1',
    deviceHash: 'hash-1',
    token: 'fcm-token-value-that-is-long-enough',
  })

  assert.deepEqual(result, { deleted: 1, legacyTokenRequired: false })
  assert.deepEqual(fake.calls[1].filters, [
    ['eq', 'user_id', 'user-1'],
    ['eq', 'token', 'fcm-token-value-that-is-long-enough'],
    ['is', 'device_hash', null],
  ])
})

test('migrated unregister reports when a legacy token is actually required', async () => {
  const fake = createFakeSupabase({
    deleteResults: [{ count: 0, error: null }],
    selectResults: [{ count: 1, error: null }],
  })
  const result = await unregisterNativePushSubscription(fake, {
    userId: 'user-1',
    deviceHash: 'hash-1',
    token: '',
  })

  assert.deepEqual(result, { deleted: 0, legacyTokenRequired: true })
  assert.deepEqual(fake.calls[1].filters, [
    ['eq', 'user_id', 'user-1'],
    ['is', 'device_hash', null],
  ])
})

test('migrated unregister stays idempotent when no legacy row remains', async () => {
  const fake = createFakeSupabase({
    deleteResults: [{ count: 0, error: null }],
    selectResults: [{ count: 0, error: null }],
  })
  const result = await unregisterNativePushSubscription(fake, {
    userId: 'user-1',
    deviceHash: 'hash-1',
    token: '',
  })

  assert.deepEqual(result, { deleted: 0, legacyTokenRequired: false })
})

test('invalid subscription cleanup is batched and reports only confirmed deletes', async () => {
  const ids = Array.from({ length: CLEANUP_BATCH_SIZE * 2 + 5 }, (_, index) =>
    `subscription-${index}`,
  )
  const fake = createFakeSupabase({
    deleteResults: [
      { count: CLEANUP_BATCH_SIZE, error: null },
      {
        count: null,
        error: { code: '42501', message: 'sensitive database detail' },
      },
      { count: 4, error: null },
    ],
  })
  const originalConsoleError = console.error
  console.error = () => {}

  try {
    const result = await cleanupInvalidSubscriptionIds(fake, {
      table: 'push_subscriptions',
      ids,
      provider: 'web-push',
    })

    assert.equal(result.requested, ids.length)
    assert.equal(result.deleted, CLEANUP_BATCH_SIZE + 4)
    assert.equal(result.failed, CLEANUP_BATCH_SIZE)
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].operation, 'cleanup')
    assert.equal(result.errors[0].error.code, '42501')
    assert.doesNotMatch(
      result.errors[0].error.message,
      /sensitive database detail/,
    )
    assert.deepEqual(
      fake.calls.map((call) => call.filters[0][2].length),
      [CLEANUP_BATCH_SIZE, CLEANUP_BATCH_SIZE, 5],
    )
  } finally {
    console.error = originalConsoleError
  }
})
