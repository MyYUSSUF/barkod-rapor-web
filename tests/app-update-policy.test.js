import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decideAndroidUpdateState,
  isMandatoryAppUpdate,
  isValidAppUpdatePolicy,
  normalizeAppUpdatePolicy,
  PLAY_UPDATE_STATUS,
  REMOTE_POLICY_STATUS,
  shouldRequireAppUpdate,
} from '../src/lib/appUpdatePolicy.js'

const disabledPolicy = {
  forceUpdate: false,
  minimumVersionCode: 0,
}

const decide = (overrides = {}) =>
  decideAndroidUpdateState({
    policy: disabledPolicy,
    currentVersionCode: 16,
    playStatus: PLAY_UPDATE_STATUS.UNAVAILABLE,
    remotePolicyStatus: REMOTE_POLICY_STATUS.VERIFIED,
    ...overrides,
  })

test('normalizes an absent policy to a disabled policy', () => {
  assert.deepEqual(normalizeAppUpdatePolicy(), disabledPolicy)
  assert.equal(isMandatoryAppUpdate({}, 14), false)
})

test('accepts only complete and internally consistent remote policies', () => {
  assert.equal(isValidAppUpdatePolicy(disabledPolicy), true)
  assert.equal(
    isValidAppUpdatePolicy({ forceUpdate: true, minimumVersionCode: 16 }),
    true,
  )
  assert.equal(
    isValidAppUpdatePolicy({ forceUpdate: true, minimumVersionCode: 0 }),
    false,
  )
  assert.equal(isValidAppUpdatePolicy({ minimumVersionCode: 16 }), false)
  assert.equal(isValidAppUpdatePolicy({ forceUpdate: false }), false)
  assert.equal(isValidAppUpdatePolicy(null), false)
})

test('rejects partial, fractional and unsafe version values', () => {
  assert.deepEqual(
    normalizeAppUpdatePolicy({
      forceUpdate: true,
      minimumVersionCode: '16beta',
    }),
    { forceUpdate: true, minimumVersionCode: 0 },
  )
  assert.equal(
    isValidAppUpdatePolicy({
      forceUpdate: false,
      minimumVersionCode: 1.5,
    }),
    false,
  )
  assert.equal(
    isValidAppUpdatePolicy({
      forceUpdate: false,
      minimumVersionCode: Number.MAX_SAFE_INTEGER + 1,
    }),
    false,
  )
})

test('blocks installed versions below a configured minimum', () => {
  assert.equal(
    isMandatoryAppUpdate(
      { forceUpdate: true, minimumVersionCode: 16 },
      15,
    ),
    true,
  )
})

test('allows minimum and newer installed versions at the policy predicate level', () => {
  const policy = { forceUpdate: true, minimumVersionCode: 16 }

  assert.equal(isMandatoryAppUpdate(policy, 16), false)
  assert.equal(isMandatoryAppUpdate(policy, 17), false)
})

test('does not turn unreadable values into a mandatory predicate match', () => {
  assert.equal(
    isMandatoryAppUpdate(
      { forceUpdate: true, minimumVersionCode: 'invalid' },
      14,
    ),
    false,
  )
  assert.equal(
    isMandatoryAppUpdate(
      { forceUpdate: true, minimumVersionCode: 16 },
      'invalid',
    ),
    false,
  )
})

test('requires every Play update when the Android policy is enabled', () => {
  assert.equal(
    shouldRequireAppUpdate({
      policy: disabledPolicy,
      currentVersionCode: 16,
      playUpdateAvailable: true,
    }),
    true,
  )
})

test('requires a verified remote minimum when Play reports no update', () => {
  assert.deepEqual(
    decide({
      policy: { forceUpdate: true, minimumVersionCode: 17 },
    }),
    { action: 'require', reason: 'policy' },
  )
})

test('a cached remote minimum can block an outdated installation safely', () => {
  assert.deepEqual(
    decide({
      policy: { forceUpdate: true, minimumVersionCode: 17 },
      remotePolicyStatus: REMOTE_POLICY_STATUS.CACHE,
    }),
    { action: 'require', reason: 'policy' },
  )
})

test('a Play update requires installation even when remote policy is unknown', () => {
  assert.deepEqual(
    decide({
      playStatus: PLAY_UPDATE_STATUS.AVAILABLE,
      remotePolicyStatus: REMOTE_POLICY_STATUS.UNKNOWN,
    }),
    { action: 'require', reason: 'play' },
  )
})

test('fulfilled Play UNKNOWN is not treated as a successful no-update result', () => {
  assert.deepEqual(
    decide({
      playStatus: PLAY_UPDATE_STATUS.UNKNOWN,
    }),
    { action: 'retry', reason: 'play-status-unknown' },
  )
})

test('fulfilled Play UNKNOWN preserves a previously verified session', () => {
  assert.deepEqual(
    decide({
      playStatus: PLAY_UPDATE_STATUS.UNKNOWN,
      previousCheckSucceeded: true,
    }),
    { action: 'preserve', reason: 'play-status-unknown' },
  )
})

test('a stale disabled policy cache never opens an initial session', () => {
  assert.deepEqual(
    decide({
      remotePolicyStatus: REMOTE_POLICY_STATUS.CACHE,
    }),
    { action: 'retry', reason: 'policy-cache-unverified' },
  )
})

test('a stale disabled policy cache preserves a previously verified session', () => {
  assert.deepEqual(
    decide({
      remotePolicyStatus: REMOTE_POLICY_STATUS.CACHE,
      previousCheckSucceeded: true,
    }),
    { action: 'preserve', reason: 'policy-cache-unverified' },
  )
})

test('an unknown remote policy never opens an initial session', () => {
  assert.deepEqual(
    decide({
      remotePolicyStatus: REMOTE_POLICY_STATUS.UNKNOWN,
    }),
    { action: 'retry', reason: 'policy-status-unknown' },
  )
})

test('an invalid remote policy retries even when marked verified', () => {
  assert.deepEqual(
    decide({
      policy: { forceUpdate: true, minimumVersionCode: 0 },
    }),
    { action: 'retry', reason: 'policy-invalid' },
  )
})

test('a valid current version and two verified no-update results allow entry', () => {
  assert.deepEqual(decide(), { action: 'allow', reason: 'up-to-date' })
})

test('an unreadable local version keeps the initial gate closed', () => {
  assert.deepEqual(
    decide({ currentVersionCode: Number.NaN }),
    { action: 'retry', reason: 'version-unavailable' },
  )
})

test('an unreadable local version preserves a previously verified session', () => {
  assert.deepEqual(
    decide({
      currentVersionCode: '16beta',
      previousCheckSucceeded: true,
    }),
    { action: 'preserve', reason: 'version-unavailable' },
  )
})

test('a confirmed Play update still blocks when the local version is unreadable', () => {
  assert.deepEqual(
    decide({
      currentVersionCode: 'invalid',
      playStatus: PLAY_UPDATE_STATUS.AVAILABLE,
    }),
    { action: 'require', reason: 'play' },
  )
})

test('the explicit debug bypass covers only an unknown Play result', () => {
  assert.deepEqual(
    decide({
      playStatus: PLAY_UPDATE_STATUS.UNKNOWN,
      debugPlayCheckBypassed: true,
    }),
    { action: 'allow', reason: 'debug-play-bypass' },
  )

  assert.deepEqual(
    decide({
      policy: { forceUpdate: true, minimumVersionCode: 17 },
      playStatus: PLAY_UPDATE_STATUS.UNKNOWN,
      debugPlayCheckBypassed: true,
    }),
    { action: 'require', reason: 'policy' },
  )

  assert.deepEqual(
    decide({
      playStatus: PLAY_UPDATE_STATUS.AVAILABLE,
      debugPlayCheckBypassed: true,
    }),
    { action: 'require', reason: 'play' },
  )
})

test('unrecognized status values fail closed as unknown', () => {
  assert.deepEqual(
    decide({ playStatus: 'not-a-real-status' }),
    { action: 'retry', reason: 'play-status-unknown' },
  )
  assert.deepEqual(
    decide({ remotePolicyStatus: 'not-a-real-status' }),
    { action: 'retry', reason: 'policy-status-unknown' },
  )
})
