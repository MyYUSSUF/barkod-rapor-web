import assert from 'node:assert/strict'
import test from 'node:test'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { EventEmitter } from 'node:events'
import { createECDH, randomBytes } from 'node:crypto'
import webPush from 'web-push'
import { createWebPushAgent, isPublicPushAddress, safeWebPushSubscription, webPushAgent } from '../api/_web-push-security.js'
import { createNotificationHandler } from '../api/send-notification.js'

const goodEndpoints = [
  'https://fcm.googleapis.com/fcm/send/synthetic',
  'https://web.push.apple.com/synthetic',
  'https://updates.push.services.mozilla.com/wpush/v2/synthetic',
  'https://wns2-bl2p.notify.windows.com/w/?token=synthetic',
]
const badEndpoints = [
  'http://fcm.googleapis.com/fcm/send/test', 'https://127.0.0.1/push',
  'https://169.254.169.254/latest', 'https://2130706433/push', 'https://0x7f000001/push',
  'https://[::1]/push', 'https://[::ffff:127.0.0.1]/push', 'https://localhost/push',
  'https://fcm.googleapis.com.evil.test/push', 'https://evilfcm.googleapis.com/push',
  'https://evilpush.services.mozilla.com/push', 'https://notify.windows.com.evil.test/push',
  'https://fcm.googleapis.com@127.0.0.1/push', 'https://user:secret@fcm.googleapis.com/push',
  'https://fcm.googleapis.com:8443/push', 'https://fcm.googleapis.com./push',
  'https://fcm.googleapis.com/push#fragment', 'https://fcm.googleapis.com/push#',
  'https://fcm.googleapis.com\\@127.0.0.1/push', 'https://fcm.googleapis.com\n/push',
  ' https://fcm.googleapis.com/push', 'https://fcm.googleapis.com/\u0000push',
  '//fcm.googleapis.com/push', 'file:///etc/passwd', 'https://customer.example/push',
  `https://fcm.googleapis.com/${'x'.repeat(4096)}`, '', null, {},
]

test.beforeEach((t) => {
  const forbidden = () => { throw Error('Real network is forbidden in this test') }
  t.mock.method(globalThis, 'fetch', forbidden)
  t.mock.method(http, 'request', forbidden)
  t.mock.method(https, 'request', forbidden)
  t.mock.method(net, 'connect', forbidden)
  t.mock.method(tls, 'connect', forbidden)
  t.mock.method(dns, 'lookup', forbidden)
})

test('known browser providers are accepted; ambiguous, private and arbitrary URLs are rejected', () => {
  for (const endpoint of goodEndpoints) {
    assert.equal(safeWebPushSubscription({ endpoint }).endpoint, endpoint)
  }
  assert.equal(safeWebPushSubscription({ endpoint: 'https://FCM.GOOGLEAPIS.COM:443/fcm/send/test' }).endpoint,
    'https://fcm.googleapis.com/fcm/send/test')
  for (const endpoint of badEndpoints) {
    assert.throws(() => safeWebPushSubscription({ endpoint }), { code: 'WEB_PUSH_ENDPOINT_BLOCKED' })
  }
})

test('IP policy excludes local, metadata, reserved, mapped and translation ranges', () => {
  for (const address of [
    '0.0.0.0', '10.1.2.3', '100.100.100.200', '127.0.0.2', '169.254.169.254',
    '172.16.1.2', '192.168.1.2', '192.0.0.8', '192.0.2.1', '192.88.99.1',
    '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::7f00:1',
    '100::1', '2001::1', '2001:db8::1', '2002:7f00:1::', '3fff::1',
    'fc00::1', 'fe80::1', 'ff02::1', 'not-an-address',
  ]) assert.equal(isPublicPushAddress(address), false, address)
  for (const address of ['142.250.184.202', '17.57.145.12', '2607:f8b0:4005:80a::200a']) {
    assert.equal(isPublicPushAddress(address), true, address)
  }
})

const lookupThrough = (agent, host = 'fcm.googleapis.com', options = { all: true }) =>
  new Promise((resolve, reject) => agent.options.lookup(host, options, (error, result, family) =>
    error ? reject(error) : resolve({ result, family })))

test('socket lookup pins validated A/AAAA records; mixed private answers and DNS rebinding fail closed', async (t) => {
  let calls = 0
  const publicRecords = [{ address: '142.250.184.202', family: 4 }, { address: '2607:f8b0:4005:80a::200a', family: 6 }]
  const agent = createWebPushAgent({ lookup: (host, options, callback) => {
    calls += 1
    assert.equal(host, 'fcm.googleapis.com')
    assert.deepEqual(options, { all: true, family: 0 })
    callback(null, calls < 3 ? publicRecords : [...publicRecords, { address: '127.0.0.1', family: 4 }])
  } })
  t.after(() => agent.destroy())
  assert.deepEqual((await lookupThrough(agent)).result, publicRecords)
  assert.deepEqual(await lookupThrough(agent, undefined, { family: 6 }), { result: publicRecords[1].address, family: 6 })
  await assert.rejects(lookupThrough(agent), { code: 'WEB_PUSH_ADDRESS_BLOCKED' })
  await assert.rejects(lookupThrough(agent, 'localhost'), { code: 'WEB_PUSH_ENDPOINT_BLOCKED' })
  assert.equal(calls, 3, 'unapproved hosts do not even reach DNS')
  assert.equal(agent.options.rejectUnauthorized, true)
  assert.deepEqual(agent.options.proxyEnv, {})
})

test('DNS errors, empty/malformed answers and family mismatches never fall back to another resolver', async (t) => {
  for (const records of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '142.250.184.202', family: 6 }]]) {
    const agent = createWebPushAgent({ lookup: (_, __, callback) => callback(null, records) })
    t.after(() => agent.destroy())
    await assert.rejects(lookupThrough(agent), /güvenli/)
  }
  const agent = createWebPushAgent({ lookup: (_, __, callback) => callback(Error('private endpoint/token')) })
  t.after(() => agent.destroy())
  await assert.rejects(lookupThrough(agent), (error) => {
    assert.equal(error.code, 'WEB_PUSH_DNS_UNAVAILABLE')
    assert.doesNotMatch(error.message, /private|token/)
    return true
  })
})

test('DNS deadline returns once and ignores a late result without opening a connection', async (t) => {
  let late, completions = 0
  const agent = createWebPushAgent({ lookupTimeoutMs: 5, lookup: (_, __, callback) => { late = callback } })
  t.after(() => agent.destroy())
  await new Promise((resolve) => agent.options.lookup('web.push.apple.com', { all: true }, (error) => {
    completions += 1
    assert.equal(error.code, 'WEB_PUSH_DNS_TIMEOUT')
    resolve()
  }))
  late(null, [{ address: '17.57.145.12', family: 4 }])
  assert.equal(completions, 1)
})

test('real web-push uses the guarded agent and does not follow provider redirects', async (t) => {
  let requests = 0
  t.mock.method(https, 'request', (options, onResponse) => {
    requests += 1
    assert.equal(options.hostname, 'fcm.googleapis.com')
    assert.equal(options.agent, webPushAgent)
    const request = new EventEmitter()
    request.write = () => {}
    request.end = () => queueMicrotask(() => {
      const response = new EventEmitter()
      response.statusCode = 302
      response.headers = { location: 'https://127.0.0.1/private' }
      onResponse(response)
      response.emit('end')
    })
    return request
  })
  const ecdh = createECDH('prime256v1')
  const subscription = safeWebPushSubscription({ endpoint: goodEndpoints[0], keys: {
    p256dh: ecdh.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url'),
  } })
  const keys = webPush.generateVAPIDKeys()
  await assert.rejects(webPush.sendNotification(subscription, 'synthetic', {
    agent: webPushAgent, vapidDetails: { subject: 'https://example.test', ...keys },
  }), { statusCode: 302 })
  assert.equal(requests, 1)
})

test('sender blocks bad stored endpoints without sending or deleting them; healthy subscriptions still send', async (t) => {
  const oldPublic = process.env.VAPID_PUBLIC_KEY, oldPrivate = process.env.VAPID_PRIVATE_KEY
  process.env.VAPID_PUBLIC_KEY = 'synthetic-public'
  process.env.VAPID_PRIVATE_KEY = 'synthetic-private'
  t.after(() => {
    if (oldPublic === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = oldPublic
    if (oldPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = oldPrivate
  })
  const targets = [...goodEndpoints, ...badEndpoints].map((endpoint, i) => ({
    id: `synthetic-subscription-${i}`, user_id: 'synthetic-user', subscription: { endpoint },
  }))
  const sent = []
  let delivery
  const handler = createNotificationHandler({
    createAdminClient: () => ({ from() { throw Error('No production DB or deletion allowed') } }),
    verifyRequest: async () => ({ ok: true, method: 'secret', userId: 'synthetic-security-test' }),
    loadTargets: async () => ({ webSubscriptions: targets, nativeSubscriptions: [], storedTotal: targets.length, skipped: 0 }),
    recordDelivery: async (_, value) => { delivery = value; return { recipientRecordsComplete: true } },
    webPushClient: { setVapidDetails() {}, async sendNotification(subscription, _, options) {
      assert.equal(options.agent, webPushAgent)
      sent.push(subscription.endpoint)
    } },
  })
  const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this }, json(v) { this.body = v; return this } }
  await handler({ method: 'POST', headers: {}, body: { title: 'Synthetic test', body: 'No real delivery', url: '/' } }, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(sent, goodEndpoints)
  assert.equal(res.body.deleted, 0)
  assert.equal(res.body.sent, goodEndpoints.length)
  assert.equal(res.body.failed, badEndpoints.length)
  assert.equal(res.body.total, res.body.sent + res.body.failed)
  assert.equal(delivery.recipientDeliveries.filter((d) => d.error_code === 'WEB_PUSH_ENDPOINT_BLOCKED').length, badEndpoints.length)
  assert.doesNotMatch(JSON.stringify(delivery.recipientDeliveries), /127\.0\.0\.1|fcm\.googleapis|secret@/)
})
