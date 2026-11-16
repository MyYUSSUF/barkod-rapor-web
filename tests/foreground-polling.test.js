import assert from 'node:assert/strict'
import test from 'node:test'
import { startForegroundPolling } from '../src/lib/foregroundPolling.js'

const flush = async () => { await new Promise((resolve) => setImmediate(resolve)) }
function fixture({ visibility = 'visible', check = async () => {}, initiallyActive = true } = {}) {
  const listeners = new Set()
  const intervals = new Map()
  let nextId = 0
  const documentObject = {
    visibilityState: visibility,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  }
  const polling = startForegroundPolling({
    check, initiallyActive, intervalMs: 10_000, documentObject,
    timers: {
      setInterval: (callback, ms) => {
        assert.equal(ms, 10_000)
        intervals.set(++nextId, callback)
        return nextId
      },
      clearInterval: (id) => intervals.delete(id),
    },
  })
  return {
    polling, intervals, listeners,
    tick: () => { for (const callback of [...intervals.values()]) void callback() },
    visibility(value) {
      documentObject.visibilityState = value
      for (const listener of listeners) listener()
    },
  }
}

test('hidden tabs do not poll; becoming visible checks once and retains 10-second polling', async () => {
  let calls = 0
  const f = fixture({ visibility: 'hidden', check: async () => { calls++ } })
  f.tick()
  assert.equal(calls, 0)
  assert.equal(f.intervals.size, 0)
  f.visibility('visible')
  f.visibility('visible')
  assert.equal(calls, 1)
  await flush()
  f.tick()
  assert.equal(calls, 2)
  f.visibility('hidden')
  await flush()
  f.tick()
  assert.equal(calls, 2)
  f.polling.stop()
})

test('native app activity and page visibility must both permit polling', async () => {
  let calls = 0
  const f = fixture({ initiallyActive: false, check: async () => { calls++ } })
  assert.equal(calls, 0)
  f.polling.setAppActive(true)
  await flush()
  f.polling.setAppActive(false)
  f.tick()
  f.visibility('hidden')
  f.polling.setAppActive(true)
  assert.equal(calls, 1)
  f.visibility('visible')
  f.polling.setAppActive(true)
  assert.equal(calls, 2)
  f.polling.stop()
})

test('in-flight work never overlaps and resume requests exactly one fresh check', async () => {
  const releases = []
  let calls = 0
  let currentForeground
  const f = fixture({ check: ({ isForeground }) => {
    calls++
    currentForeground = isForeground
    return new Promise((resolve) => releases.push(resolve))
  } })
  f.tick()
  f.tick()
  assert.equal(calls, 1)
  f.visibility('hidden')
  assert.equal(currentForeground(), false)
  f.visibility('visible')
  f.visibility('visible')
  f.tick()
  assert.equal(calls, 1)
  releases.shift()()
  await flush()
  assert.equal(calls, 2)
  f.polling.stop()
  assert.equal(currentForeground(), false)
  releases.shift()()
  await flush()
  f.visibility('visible')
  f.polling.setAppActive(true)
  f.tick()
  assert.equal(calls, 2)
  assert.equal(f.intervals.size, 0)
  assert.equal(f.listeners.size, 0)
})

test('hiding or stopping discards a queued resume check', async () => {
  for (const stop of [false, true]) {
    let release
    let calls = 0
    const f = fixture({ check: () => {
      calls++
      return new Promise((resolve) => { release = resolve })
    } })
    f.visibility('hidden')
    f.visibility('visible')
    if (stop) f.polling.stop()
    else f.visibility('hidden')
    release()
    await flush()
    assert.equal(calls, 1)
    assert.equal(f.intervals.size, 0)
    f.polling.stop()
  }
})
