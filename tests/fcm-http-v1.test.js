import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFcmMessage,
  isUnregisteredFcmResponse,
  mapWithConcurrency,
  parseFirebaseServiceAccount,
  sendFcmHttpRequest,
} from '../api/_fcm-http-v1.js'

const fcmErrorPayload = (errorCode) => ({
  error: {
    code: 404,
    status: 'NOT_FOUND',
    message: 'FCM error',
    details: [
      {
        '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
        errorCode,
      },
    ],
  },
})

test('only an explicit 404 FCM UNREGISTERED response removes a token', () => {
  assert.equal(
    isUnregisteredFcmResponse(404, fcmErrorPayload('UNREGISTERED')),
    true,
  )
  assert.equal(
    isUnregisteredFcmResponse(400, fcmErrorPayload('INVALID_ARGUMENT')),
    false,
  )
  assert.equal(
    isUnregisteredFcmResponse(404, fcmErrorPayload('INVALID_ARGUMENT')),
    false,
  )
  assert.equal(
    isUnregisteredFcmResponse(404, {
      error: { status: 'NOT_FOUND', details: [] },
    }),
    false,
  )
  assert.equal(
    isUnregisteredFcmResponse(503, fcmErrorPayload('UNAVAILABLE')),
    false,
  )
})

test('FCM HTTP v1 message uses Android REST field names and string data', () => {
  const result = createFcmMessage({
    token: ' token-1 ',
    title: 'Title',
    body: 'Body',
    url: 42,
  })

  assert.equal(result.message.token, 'token-1')
  assert.equal(result.message.data.url, '42')
  assert.equal(result.message.android.priority, 'HIGH')
  assert.equal(
    result.message.android.restricted_package_name,
    'com.elvandying.barkodrapor',
  )
  assert.equal(
    result.message.android.notification.channel_id,
    'elvan_notifications',
  )
  assert.equal('channelId' in result.message.android.notification, false)
})

test('service account parser validates fields and restores escaped newlines', () => {
  const parsed = parseFirebaseServiceAccount(
    JSON.stringify({
      project_id: 'project-1',
      client_email: 'sender@example.test',
      private_key: 'line-1\\nline-2',
    }),
  )

  assert.deepEqual(parsed, {
    projectId: 'project-1',
    clientEmail: 'sender@example.test',
    privateKey: 'line-1\nline-2',
  })
  assert.throws(
    () => parseFirebaseServiceAccount('{broken'),
    /geçerli JSON değil/,
  )
  assert.throws(
    () => parseFirebaseServiceAccount(JSON.stringify({ project_id: 'x' })),
    /alanları eksik/,
  )
})

test('HTTP sender keeps malformed error responses as non-permanent failures', async () => {
  const result = await sendFcmHttpRequest({
    accessToken: 'access-token',
    projectId: 'project-1',
    message: createFcmMessage({
      token: 'token-1',
      title: 'Title',
      body: 'Body',
      url: '/',
    }),
    fetchImpl: async () =>
      new Response('<html>temporary failure</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.statusCode, 503)
  assert.equal(result.payload, null)
  assert.match(result.message, /temporary failure/)
  assert.equal(isUnregisteredFcmResponse(result.statusCode, result.payload), false)
})

test('bounded mapper never exceeds the configured concurrency', async () => {
  let active = 0
  let maximumActive = 0
  const source = Array.from({ length: 35 }, (_, index) => index)

  const results = await mapWithConcurrency(source, 10, async (value) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return value * 2
  })

  assert.equal(maximumActive <= 10, true)
  assert.deepEqual(results, source.map((value) => value * 2))
})
