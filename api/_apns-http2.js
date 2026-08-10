import crypto from 'node:crypto'
import http2 from 'node:http2'

const APNS_PRODUCTION_ORIGIN = 'https://api.push.apple.com'
const APNS_SANDBOX_ORIGIN = 'https://api.sandbox.push.apple.com'
const PROVIDER_TOKEN_MAX_AGE_MS = 40 * 60 * 1000
const APNS_OPERATION_TIMEOUT_MS = 10_000

let cachedProviderCredentials = ''
let cachedProviderToken = ''
let cachedProviderTokenCreatedAt = 0

function normalizePrivateKey(value) {
  return String(value || '').replaceAll('\\n', '\n').trim()
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function validateIdentifier(value, label) {
  const normalized = String(value || '').trim()

  if (!/^[A-Z0-9]{10}$/i.test(normalized)) {
    throw new Error(`${label} geçersiz.`)
  }

  return normalized
}

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function readApnsCredentials(env, environment) {
  const scope = environment === 'sandbox' ? 'SANDBOX' : 'PRODUCTION'
  const scopedKeyIdName = `APPLE_APNS_${scope}_KEY_ID`
  const scopedPrivateKeyName = `APPLE_APNS_${scope}_PRIVATE_KEY`
  const hasScopedCredentials =
    isNotBlank(env[scopedKeyIdName]) || isNotBlank(env[scopedPrivateKeyName])
  const keyIdName = hasScopedCredentials
    ? scopedKeyIdName
    : 'APPLE_APNS_KEY_ID'
  const privateKeyName = hasScopedCredentials
    ? scopedPrivateKeyName
    : 'APPLE_APNS_PRIVATE_KEY'
  const keyId = validateIdentifier(env[keyIdName], keyIdName)
  const privateKey = normalizePrivateKey(env[privateKeyName])

  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(`${privateKeyName} geçerli bir .p8 anahtarı değil.`)
  }

  return { keyId, privateKey }
}

export function readApnsConfiguration(
  env = process.env,
  environment = 'production',
) {
  if (!['production', 'sandbox'].includes(environment)) {
    throw new Error('APNs ortamı geçersiz.')
  }

  const teamId = validateIdentifier(
    env.APPLE_DEVELOPER_TEAM_ID,
    'APPLE_DEVELOPER_TEAM_ID',
  )
  const { keyId, privateKey } = readApnsCredentials(env, environment)
  const bundleId = String(
    env.IOS_BUNDLE_ID || 'com.elvandying.barkodrapor',
  ).trim()

  if (!/^[A-Za-z0-9.-]+$/.test(bundleId)) {
    throw new Error('IOS_BUNDLE_ID geçersiz.')
  }

  return { teamId, keyId, privateKey, bundleId }
}

export function createApnsProviderToken({
  teamId,
  keyId,
  privateKey,
  now = Date.now(),
}) {
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const claims = base64Url(
    JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }),
  )
  const unsignedToken = `${header}.${claims}`
  const signature = crypto.sign('sha256', Buffer.from(unsignedToken), {
    key: normalizePrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363',
  })

  return `${unsignedToken}.${signature.toString('base64url')}`
}

export function getApnsProviderToken(configuration, now = Date.now()) {
  const credentialsKey = JSON.stringify({
    teamId: configuration.teamId,
    keyId: configuration.keyId,
    privateKey: configuration.privateKey,
  })

  if (
    cachedProviderToken &&
    cachedProviderCredentials === credentialsKey &&
    now - cachedProviderTokenCreatedAt < PROVIDER_TOKEN_MAX_AGE_MS
  ) {
    return cachedProviderToken
  }

  cachedProviderCredentials = credentialsKey
  cachedProviderTokenCreatedAt = now
  cachedProviderToken = createApnsProviderToken({
    ...configuration,
    now,
  })
  return cachedProviderToken
}

export function createApnsPayload({ title, body, url }) {
  return {
    aps: {
      alert: {
        title: String(title || ''),
        body: String(body || ''),
      },
      sound: 'default',
    },
    url: String(url || '/'),
  }
}

export function isPermanentApnsTokenFailure(statusCode, reason) {
  return (
    statusCode === 410 ||
    ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(
      String(reason || ''),
    )
  )
}

export function getApnsOrigin(environment) {
  return environment === 'sandbox'
    ? APNS_SANDBOX_ORIGIN
    : APNS_PRODUCTION_ORIGIN
}

export async function withApnsClient({
  environment = 'production',
  task,
  connectImpl = http2.connect,
}) {
  const client = connectImpl(getApnsOrigin(environment))
  client.on('error', () => {})

  try {
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('APNs bağlantısı zaman aşımına uğradı.'))
        client.destroy()
      }, APNS_OPERATION_TIMEOUT_MS)

      client.once('connect', () => {
        clearTimeout(timeoutId)
        resolve()
      })
      client.once('error', (error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
    })
    return await task(client)
  } finally {
    if (!client.destroyed) {
      client.close()
    }
  }
}

export async function sendApnsHttpRequest({
  client,
  token,
  providerToken,
  bundleId,
  payload,
}) {
  const cleanToken = String(token || '').trim()

  if (!/^[a-f0-9]{32,256}$/i.test(cleanToken)) {
    return {
      ok: false,
      statusCode: null,
      reason: 'BadDeviceToken',
      message: 'APNs cihaz anahtarı geçersiz.',
    }
  }

  return new Promise((resolve) => {
    let statusCode = null
    let responseBody = ''
    let settled = false
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${cleanToken}`,
      authorization: `bearer ${providerToken}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      resolve(result)
    }
    const timeoutId = setTimeout(() => {
      request.close(http2.constants.NGHTTP2_CANCEL)
      finish({
        ok: false,
        statusCode,
        reason: 'NETWORK_TIMEOUT',
        message: 'APNs gönderimi zaman aşımına uğradı.',
      })
    }, APNS_OPERATION_TIMEOUT_MS)

    request.setEncoding('utf8')
    request.on('response', (headers) => {
      statusCode = Number(headers[':status']) || null
    })
    request.on('data', (chunk) => {
      responseBody += chunk
    })
    request.on('error', (error) => {
      finish({
        ok: false,
        statusCode,
        reason: 'NETWORK_ERROR',
        message: error.message || 'APNs ağ hatası',
      })
    })
    request.on('end', () => {
      let responsePayload = null

      if (responseBody) {
        try {
          responsePayload = JSON.parse(responseBody)
        } catch {
          responsePayload = null
        }
      }

      const reason = responsePayload?.reason || null
      finish({
        ok: statusCode === 200,
        statusCode,
        reason,
        message:
          reason ||
          (statusCode === 200
            ? ''
            : responseBody.slice(0, 500) || 'APNs gönderim hatası'),
      })
    })

    request.end(JSON.stringify(payload))
  })
}
