import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  createApnsPayload,
  createApnsProviderToken,
  getApnsOrigin,
  isPermanentApnsTokenFailure,
  readApnsConfiguration,
} from '../api/_apns-http2.js'

const { privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
})
const privateKeyPem = privateKey.export({
  type: 'pkcs8',
  format: 'pem',
})

test('APNs ES256 saglayici anahtari olusturur', () => {
  const token = createApnsProviderToken({
    teamId: 'TEAMID1234',
    keyId: 'KEYID12345',
    privateKey: privateKeyPem,
    now: 1_700_000_000_000,
  })
  const [header, payload, signature] = token.split('.')

  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {
    alg: 'ES256',
    kid: 'KEYID12345',
  })
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    iss: 'TEAMID1234',
    iat: 1_700_000_000,
  })
  assert.equal(Buffer.from(signature, 'base64url').length, 64)
})

test('APNs ayarlari ortama ozel gizli degerlerden okunur', () => {
  assert.deepEqual(
    readApnsConfiguration({
      APPLE_DEVELOPER_TEAM_ID: 'TEAMID1234',
      APPLE_APNS_PRODUCTION_KEY_ID: 'PRODKEY123',
      APPLE_APNS_PRODUCTION_PRIVATE_KEY: privateKeyPem.replaceAll('\n', '\\n'),
      APPLE_APNS_SANDBOX_KEY_ID: 'SANDKEY123',
      APPLE_APNS_SANDBOX_PRIVATE_KEY: privateKeyPem.replaceAll('\n', '\\n'),
      IOS_BUNDLE_ID: 'com.elvandying.barkodrapor',
    }),
    {
      teamId: 'TEAMID1234',
      keyId: 'PRODKEY123',
      privateKey: privateKeyPem.trim(),
      bundleId: 'com.elvandying.barkodrapor',
    },
  )

  assert.equal(
    readApnsConfiguration(
      {
        APPLE_DEVELOPER_TEAM_ID: 'TEAMID1234',
        APPLE_APNS_PRODUCTION_KEY_ID: 'PRODKEY123',
        APPLE_APNS_PRODUCTION_PRIVATE_KEY: privateKeyPem,
        APPLE_APNS_SANDBOX_KEY_ID: 'SANDKEY123',
        APPLE_APNS_SANDBOX_PRIVATE_KEY: privateKeyPem,
      },
      'sandbox',
    ).keyId,
    'SANDKEY123',
  )
})

test('eski iki ortamli APNs anahtari geriye donuk desteklenir', () => {
  const env = {
    APPLE_DEVELOPER_TEAM_ID: 'TEAMID1234',
    APPLE_APNS_KEY_ID: 'KEYID12345',
    APPLE_APNS_PRIVATE_KEY: privateKeyPem,
  }

  assert.equal(readApnsConfiguration(env, 'production').keyId, 'KEYID12345')
  assert.equal(readApnsConfiguration(env, 'sandbox').keyId, 'KEYID12345')
})

test('eksik ortama ozel APNs anahtari eski anahtarla karistirilmaz', () => {
  assert.throws(
    () =>
      readApnsConfiguration({
        APPLE_DEVELOPER_TEAM_ID: 'TEAMID1234',
        APPLE_APNS_PRODUCTION_KEY_ID: 'PRODKEY123',
        APPLE_APNS_KEY_ID: 'KEYID12345',
        APPLE_APNS_PRIVATE_KEY: privateKeyPem,
      }),
    /APPLE_APNS_PRODUCTION_PRIVATE_KEY/,
  )
})

test('APNs bildirimi uyarı, ses ve uygulama yolunu tasir', () => {
  assert.deepEqual(
    createApnsPayload({ title: 'ELVAN', body: 'Yeni rapor', url: '/reports' }),
    {
      aps: {
        alert: { title: 'ELVAN', body: 'Yeni rapor' },
        sound: 'default',
      },
      url: '/reports',
    },
  )
})

test('yalniz kalici APNs cihaz anahtari hatalari kaydi siler', () => {
  assert.equal(isPermanentApnsTokenFailure(410, 'Unregistered'), true)
  assert.equal(isPermanentApnsTokenFailure(400, 'BadDeviceToken'), true)
  assert.equal(isPermanentApnsTokenFailure(403, 'ExpiredProviderToken'), false)
  assert.equal(isPermanentApnsTokenFailure(503, 'ServiceUnavailable'), false)
  assert.equal(getApnsOrigin('sandbox').includes('sandbox'), true)
  assert.equal(getApnsOrigin('production').includes('sandbox'), false)
})
