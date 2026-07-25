import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCameraTorch,
  supportsCameraTorch,
} from './cameraTorch.js'

test('supportsCameraTorch accepts a controllable torch capability', () => {
  const track = {
    getCapabilities: () => ({ torch: true }),
    applyConstraints: async () => {},
  }

  assert.equal(supportsCameraTorch(track), true)
})

test('supportsCameraTorch rejects missing, false, or unreadable capabilities', () => {
  assert.equal(supportsCameraTorch(null), false)
  assert.equal(
    supportsCameraTorch({
      getCapabilities: () => ({ torch: false }),
      applyConstraints: async () => {},
    }),
    false
  )
  assert.equal(
    supportsCameraTorch({
      getCapabilities: () => {
        throw new Error('track ended')
      },
      applyConstraints: async () => {},
    }),
    false
  )
})

test('applyCameraTorch sends the expected advanced constraint', async () => {
  const receivedConstraints = []
  const track = {
    getCapabilities: () => ({ torch: true }),
    applyConstraints: async (constraints) => {
      receivedConstraints.push(constraints)
    },
  }

  assert.equal(await applyCameraTorch(track, true), true)
  assert.equal(await applyCameraTorch(track, false), true)
  assert.deepEqual(receivedConstraints, [
    { advanced: [{ torch: true }] },
    { advanced: [{ torch: false }] },
  ])
})

test('applyCameraTorch leaves unsupported tracks unchanged', async () => {
  let applyCount = 0
  const track = {
    getCapabilities: () => ({}),
    applyConstraints: async () => {
      applyCount += 1
    },
  }

  assert.equal(await applyCameraTorch(track, true), false)
  assert.equal(applyCount, 0)
})
