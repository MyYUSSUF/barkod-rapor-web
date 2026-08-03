import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decideAndroidUpdateState,
  isMandatoryAppUpdate,
  normalizeAppUpdatePolicy,
  shouldRequireAppUpdate,
} from '../src/lib/appUpdatePolicy.js'

test('forced update stays disabled when server configuration is absent', () => {
  assert.deepEqual(normalizeAppUpdatePolicy(), {
    forceUpdate: false,
    minimumVersionCode: 0,
  })
  assert.equal(isMandatoryAppUpdate({}, 14), false)
})

test('installed versions below the configured minimum are blocked', () => {
  assert.equal(
    isMandatoryAppUpdate(
      { forceUpdate: true, minimumVersionCode: 16 },
      15
    ),
    true
  )
})

test('minimum and newer installed versions remain usable', () => {
  const policy = { forceUpdate: true, minimumVersionCode: 16 }

  assert.equal(isMandatoryAppUpdate(policy, 16), false)
  assert.equal(isMandatoryAppUpdate(policy, 17), false)
})

test('invalid version values fail open', () => {
  assert.equal(
    isMandatoryAppUpdate(
      { forceUpdate: true, minimumVersionCode: 'invalid' },
      14
    ),
    false
  )
  assert.equal(
    isMandatoryAppUpdate(
      { forceUpdate: true, minimumVersionCode: 16 },
      'invalid'
    ),
    false
  )
})

test('Play tarafında sunulan bütün yeni Android sürümleri zorunlu olur', () => {
  assert.equal(
    shouldRequireAppUpdate({
      policy: { forceUpdate: false, minimumVersionCode: 0 },
      currentVersionCode: 16,
      playUpdateAvailable: true,
    }),
    true,
  )
})

test('Play güncellemesi yoksa uzaktaki minimum sürüm politikası uygulanır', () => {
  assert.equal(
    shouldRequireAppUpdate({
      policy: { forceUpdate: true, minimumVersionCode: 17 },
      currentVersionCode: 16,
      playUpdateAvailable: false,
    }),
    true,
  )
  assert.equal(
    shouldRequireAppUpdate({
      policy: { forceUpdate: true, minimumVersionCode: 17 },
      currentVersionCode: 17,
      playUpdateAvailable: false,
    }),
    false,
  )
})

test('initial Play check failure requires an explicit retry', () => {
  assert.deepEqual(
    decideAndroidUpdateState({
      policy: { forceUpdate: false, minimumVersionCode: 0 },
      currentVersionCode: 16,
      playCheckSucceeded: false,
      previousCheckSucceeded: false,
    }),
    { action: 'retry', reason: 'play-check-failed' },
  )
})

test('a temporary Play failure preserves a previously verified state', () => {
  assert.deepEqual(
    decideAndroidUpdateState({
      policy: { forceUpdate: false, minimumVersionCode: 0 },
      currentVersionCode: 16,
      playCheckSucceeded: false,
      previousCheckSucceeded: true,
    }),
    { action: 'preserve', reason: 'play-check-failed' },
  )
})

test('remote minimum policy still blocks when Play is temporarily unavailable', () => {
  assert.deepEqual(
    decideAndroidUpdateState({
      policy: { forceUpdate: true, minimumVersionCode: 17 },
      currentVersionCode: 16,
      playCheckSucceeded: false,
    }),
    { action: 'require', reason: 'policy' },
  )
})

test('every Play update is mandatory when the Android policy is enabled', () => {
  assert.deepEqual(
    decideAndroidUpdateState({
      policy: { forceUpdate: false, minimumVersionCode: 0 },
      currentVersionCode: 16,
      playCheckSucceeded: true,
      playUpdateAvailable: true,
    }),
    { action: 'require', reason: 'play' },
  )
})

test('an unreadable local version keeps the initial verification gate closed', () => {
  assert.deepEqual(
    decideAndroidUpdateState({
      policy: { forceUpdate: false, minimumVersionCode: 0 },
      currentVersionCode: Number.NaN,
      playCheckSucceeded: true,
      playUpdateAvailable: false,
      previousCheckSucceeded: false,
    }),
    { action: 'retry', reason: 'version-unavailable' },
  )
})
