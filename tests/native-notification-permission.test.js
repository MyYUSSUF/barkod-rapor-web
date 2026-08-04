import test from 'node:test'
import assert from 'node:assert/strict'

import {
  shouldRequestNativeNotificationPermission,
  shouldShowNativeNotificationRecovery,
} from '../src/lib/nativeNotificationPermission.js'

test('Android bildirim izni yalnız ilk prompt durumunda istenir', () => {
  assert.equal(
    shouldRequestNativeNotificationPermission({
      permission: 'prompt',
      alreadyAsked: false,
    }),
    true,
  )
  assert.equal(
    shouldRequestNativeNotificationPermission({
      permission: 'prompt',
      alreadyAsked: true,
    }),
    false,
  )
  assert.equal(
    shouldRequestNativeNotificationPermission({
      permission: 'denied',
      alreadyAsked: false,
    }),
    false,
  )
})

test('Zorunlu güncelleme engeli varken bildirim izni istenmez', () => {
  assert.equal(
    shouldRequestNativeNotificationPermission({
      permission: 'prompt-with-rationale',
      alreadyAsked: false,
      updateBlocked: true,
    }),
    false,
  )
})

test('izin ayarları bağlantısı yalnız ilk istekten sonra ve izin yokken gösterilir', () => {
  assert.equal(
    shouldShowNativeNotificationRecovery({
      permission: 'denied',
      alreadyAsked: true,
    }),
    true,
  )
  assert.equal(
    shouldShowNativeNotificationRecovery({
      permission: 'prompt-with-rationale',
      alreadyAsked: true,
    }),
    true,
  )
  assert.equal(
    shouldShowNativeNotificationRecovery({
      permission: 'granted',
      alreadyAsked: true,
    }),
    false,
  )
  assert.equal(
    shouldShowNativeNotificationRecovery({
      permission: 'denied',
      alreadyAsked: false,
    }),
    false,
  )
})
