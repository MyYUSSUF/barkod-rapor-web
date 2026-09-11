import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createLocalServer } from '../server.js'

test('local routes use real API handlers and never fall through to HTML', async (t) => {
  const fakeEnv = { SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only' }
  for (const [key, value] of Object.entries(fakeEnv)) {
    const original = process.env[key]
    process.env[key] = value
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original })
  }
  const realFetch = globalThis.fetch.bind(globalThis)
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(new URL(url).hostname, '127.0.0.1', 'no external service may be contacted')
    return realFetch(url, options)
  })
  const server = createLocalServer().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  const origin = `http://127.0.0.1:${server.address().port}`
  for (const route of ['audit-log', 'notification-automations', 'report-url', 'admin-panel']) {
    const response = await fetch(`${origin}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(response.status, 401, route)
    assert.match(response.headers.get('content-type'), /application\/json/)
    assert.ok((await response.json()).error)
  }
  const unknown = await fetch(`${origin}/api/not-a-real-route`)
  assert.equal(unknown.status, 404)
  assert.match(unknown.headers.get('content-type'), /application\/json/)
  const invalid = await fetch(`${origin}/api/report-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })
  assert.equal(invalid.status, 400)
  assert.doesNotMatch(JSON.stringify(await invalid.json()), /SyntaxError|stack/)
  const oversized = await fetch(`${origin}/api/report-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(110_000) }) })
  assert.equal(oversized.status, 413)
  for (const [key, value] of Object.entries({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'no-referrer' })) {
    assert.equal(unknown.headers.get(key), value)
  }
  assert.equal(unknown.headers.get('x-powered-by'), null)
  const preflight = await fetch(`${origin}/api/report-url`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('production security headers preserve existing admin rewrite', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
  assert.ok(config.rewrites.some((rule) => rule.source === '/yonetim' && rule.destination === '/index.html'))
  assert.deepEqual(config.headers[0].headers.map((header) => header.key).sort(), ['Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options'])
})
