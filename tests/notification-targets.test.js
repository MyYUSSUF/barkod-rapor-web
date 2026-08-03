import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getFcmToken,
  isPermanentFcmFailure,
  partitionNotificationSubscriptions,
} from '../api/_notification-targets.js'

test('FCM tokenini JSON kaydından veya endpoint değerinden okur', () => {
  assert.equal(
    getFcmToken({ subscription: { type: 'fcm', token: ' token-1 ' } }),
    'token-1',
  )
  assert.equal(getFcmToken({ endpoint: 'fcm:token-2' }), 'token-2')
  assert.equal(getFcmToken({ endpoint: 'https://push.example.test/id' }), '')
})

test('Web Push ve Android FCM aboneliklerini birbirinden ayırır', () => {
  const web = { id: 'web', endpoint: 'https://push.example.test/id' }
  const native = {
    id: 'native',
    endpoint: 'fcm:token',
    subscription: { type: 'fcm', token: 'token' },
  }

  assert.deepEqual(partitionNotificationSubscriptions([web, native]), {
    webSubscriptions: [web],
    nativeSubscriptions: [native],
  })
})

test('Yalnızca kalıcı FCM hedef hataları kaydı siler', () => {
  assert.equal(
    isPermanentFcmFailure('messaging/registration-token-not-registered'),
    true,
  )
  assert.equal(isPermanentFcmFailure('messaging/invalid-argument'), false)
  assert.equal(isPermanentFcmFailure('messaging/invalid-registration-token'), false)
  assert.equal(isPermanentFcmFailure('messaging/unavailable'), false)
})
