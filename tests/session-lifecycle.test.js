import assert from 'node:assert/strict'
import test from 'node:test'

import {
  advanceSessionLifecycle,
  isAuthSessionUser,
  isSessionLifecycleCurrent,
} from '../src/lib/sessionLifecycle.js'

test('a previous user task becomes stale when a new session starts', () => {
  const userA = advanceSessionLifecycle({}, 'user-a')
  const userB = advanceSessionLifecycle(userA, 'user-b')

  assert.equal(isSessionLifecycleCurrent(userB, userA), false)
  assert.equal(isSessionLifecycleCurrent(userB, userB), true)
})

test('invalidating a session also invalidates its pending work', () => {
  const signedIn = advanceSessionLifecycle({}, 'user-a')
  const signedOut = advanceSessionLifecycle(signedIn, '')

  assert.equal(isSessionLifecycleCurrent(signedOut, signedIn), false)
  assert.equal(signedOut.userId, '')
})

test('auth side effects require the captured user to remain current', () => {
  assert.equal(
    isAuthSessionUser({ user: { id: 'user-a' } }, 'user-a'),
    true,
  )
  assert.equal(
    isAuthSessionUser({ user: { id: 'user-b' } }, 'user-a'),
    false,
  )
  assert.equal(isAuthSessionUser(null, 'user-a'), false)
})
