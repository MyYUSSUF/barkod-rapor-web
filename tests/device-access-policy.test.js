import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveDeviceAccessStatus } from '../api/_device-auth.js'

test('new and pending devices do not require administrator approval', () => {
  assert.equal(resolveDeviceAccessStatus('missing'), 'approved')
  assert.equal(resolveDeviceAccessStatus('pending'), 'approved')
  assert.equal(resolveDeviceAccessStatus('approved'), 'approved')
  assert.equal(resolveDeviceAccessStatus(''), 'approved')
})

test('an explicitly revoked device remains blocked', () => {
  assert.equal(resolveDeviceAccessStatus('revoked'), 'revoked')
})
