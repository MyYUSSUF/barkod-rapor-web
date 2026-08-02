import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isMandatoryAppUpdate,
  normalizeAppUpdatePolicy,
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
