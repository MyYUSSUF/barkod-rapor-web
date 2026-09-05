import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSafeTestEnvironment } from '../scripts/check-test-environment.mjs'

const localEnvironment = {
  ELVAN_TEST_MODE: '1',
  SUPABASE_TEST_URL: 'http://127.0.0.1:54321',
  SUPABASE_TEST_ANON_KEY: 'local-test-key',
}

test('accepts a local explicit test environment', () => {
  assert.equal(assertSafeTestEnvironment(localEnvironment).url, 'http://127.0.0.1:54321/')
})

test('rejects a production Supabase variable', () => {
  assert.throws(
    () => assertSafeTestEnvironment({ ...localEnvironment, VITE_SUPABASE_URL: 'https://prod.example' }),
    /Üretim Supabase değişkenleri/,
  )
})

test('rejects a non-local test URL', () => {
  assert.throws(
    () => assertSafeTestEnvironment({ ...localEnvironment, SUPABASE_TEST_URL: 'https://project.supabase.co' }),
    /yalnız yerel HTTP/,
  )
})
