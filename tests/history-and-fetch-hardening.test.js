import assert from 'node:assert/strict'
import test from 'node:test'
import { barcodeHistoryKey, readBarcodeHistory, storeBarcodeHistory, removeBarcodeHistory } from '../src/lib/barcodeHistory.js'
import { fetchJsonWithTimeout } from '../src/lib/fetchJsonWithTimeout.js'

function storage() {
  const values = new Map()
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}

test('history is scoped per user; anonymous sessions cannot load it', () => {
  const store = storage()
  storeBarcodeHistory(store, 'user-a', [{ value: 'BARCODE-A' }])
  storeBarcodeHistory(store, 'user-b', [{ value: 'BARCODE-B' }])
  assert.equal(readBarcodeHistory(store, 'user-a')[0].value, 'BARCODE-A')
  assert.equal(readBarcodeHistory(store, 'user-b')[0].value, 'BARCODE-B')
  assert.deepEqual(readBarcodeHistory(store, ''), [])
  assert.equal(barcodeHistoryKey(null), null)
  removeBarcodeHistory(store, 'user-b')
  assert.deepEqual(readBarcodeHistory(store, 'user-b'), [])
  assert.equal(readBarcodeHistory(store, 'user-a').length, 1)
})

test('legacy shared history is neither exposed nor assigned to an arbitrary user', () => {
  const store = storage()
  store.setItem('barkod_rapor_history', '[{"value":"UNKNOWN_OWNER"}]')
  assert.deepEqual(readBarcodeHistory(store, 'user-a'), [])
  assert.deepEqual(readBarcodeHistory(store, 'user-b'), [])
  assert.ok(store.getItem('barkod_rapor_history')) // No unapproved deletion/migration.
})

test('malformed or unavailable browser storage cannot break report usage', () => {
  const store = storage()
  store.setItem(barcodeHistoryKey('user-a'), 'not-json')
  assert.deepEqual(readBarcodeHistory(store, 'user-a'), [])
  store.setItem(barcodeHistoryKey('user-a'), '[null, 4, {"value":5}]')
  assert.deepEqual(readBarcodeHistory(store, 'user-a'), [])
  const unavailable = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('denied') } }
  assert.deepEqual(readBarcodeHistory(unavailable, 'user-a'), [])
  assert.equal(storeBarcodeHistory(unavailable, 'user-a', []), false)
  assert.doesNotThrow(() => removeBarcodeHistory(unavailable, 'user-a'))
})

test('JSON timeout remains active while response body stalls', async () => {
  let signal
  await assert.rejects(fetchJsonWithTimeout('https://synthetic.invalid', {}, 10, async (_url, options) => {
    signal = options.signal
    return { json: () => new Promise(() => {}) }
  }), { name: 'AbortError' })
  assert.equal(signal.aborted, true)
})

test('external cancellation aborts an in-flight JSON request', async () => {
  const controller = new AbortController()
  const promise = fetchJsonWithTimeout('https://synthetic.invalid', { signal: controller.signal }, 1000, async () => {
    controller.abort()
    return { json: () => new Promise(() => {}) }
  })
  await assert.rejects(promise, { name: 'AbortError' })
})

test('successful JSON is parsed and invalid HTML is never treated as success', async () => {
  const result = await fetchJsonWithTimeout('https://synthetic.invalid', {}, 1000, async () => new Response('{"success":true}'))
  assert.equal(result.result.success, true)
  await assert.rejects(fetchJsonWithTimeout('https://synthetic.invalid', {}, 1000, async () => new Response('<html>not API</html>')), SyntaxError)
})
