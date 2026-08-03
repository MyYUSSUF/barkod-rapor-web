import { JWT } from 'google-auth-library'

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const FCM_ERROR_TYPE =
  'type.googleapis.com/google.firebase.fcm.v1.FcmError'
const ANDROID_PACKAGE_NAME = 'com.elvandying.barkodrapor'
const NATIVE_NOTIFICATION_CHANNEL_ID = 'elvan_notifications'

let cachedCredentialsJson = ''
let cachedAuthClient = null

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

export function parseFirebaseServiceAccount(rawServiceAccount) {
  const rawValue = String(rawServiceAccount || '').trim()

  if (!rawValue) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON eksik.')
  }

  let parsed

  try {
    parsed = JSON.parse(rawValue)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON geçerli JSON değil.')
  }

  const serviceAccount = {
    projectId: parsed.project_id || parsed.projectId,
    clientEmail: parsed.client_email || parsed.clientEmail,
    privateKey: String(parsed.private_key || parsed.privateKey || '').replaceAll(
      '\\n',
      '\n',
    ),
  }

  if (
    !isNotBlank(serviceAccount.projectId) ||
    !isNotBlank(serviceAccount.clientEmail) ||
    !isNotBlank(serviceAccount.privateKey)
  ) {
    throw new Error('Firebase servis hesabı alanları eksik.')
  }

  return serviceAccount
}

export async function getFirebaseAccessToken(rawServiceAccount) {
  const rawValue = String(rawServiceAccount || '').trim()
  const serviceAccount = parseFirebaseServiceAccount(rawValue)

  if (!cachedAuthClient || cachedCredentialsJson !== rawValue) {
    cachedCredentialsJson = rawValue
    cachedAuthClient = new JWT({
      email: serviceAccount.clientEmail,
      key: serviceAccount.privateKey,
      scopes: [FCM_SCOPE],
    })
  }

  const credentials = await cachedAuthClient.authorize()
  const accessToken = String(credentials?.access_token || '').trim()

  if (!accessToken) {
    throw new Error('Firebase erişim anahtarı alınamadı.')
  }

  return {
    accessToken,
    projectId: serviceAccount.projectId,
  }
}

export function createFcmMessage({ token, title, body, url }) {
  return {
    message: {
      token: String(token || '').trim(),
      notification: {
        title: String(title || ''),
        body: String(body || ''),
      },
      data: {
        url: String(url || '/'),
      },
      android: {
        priority: 'HIGH',
        restricted_package_name: ANDROID_PACKAGE_NAME,
        notification: {
          channel_id: NATIVE_NOTIFICATION_CHANNEL_ID,
        },
      },
    },
  }
}

export function isUnregisteredFcmResponse(statusCode, payload) {
  if (statusCode !== 404 || !Array.isArray(payload?.error?.details)) {
    return false
  }

  return payload.error.details.some(
    (detail) =>
      detail?.['@type'] === FCM_ERROR_TYPE &&
      detail?.errorCode === 'UNREGISTERED',
  )
}

export async function sendFcmHttpRequest({
  accessToken,
  projectId,
  message,
  fetchImpl = fetch,
}) {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/messages:send`
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })
  const responseText = await response.text()
  let payload = null

  if (responseText) {
    try {
      payload = JSON.parse(responseText)
    } catch {
      payload = null
    }
  }

  return {
    ok: response.ok,
    statusCode: response.status,
    payload,
    message:
      payload?.error?.message ||
      (response.ok ? '' : responseText.slice(0, 500) || 'FCM gönderim hatası'),
  }
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const source = Array.isArray(items) ? items : []
  const results = new Array(source.length)
  const workerCount = Math.max(
    1,
    Math.min(source.length || 1, Number.parseInt(concurrency, 10) || 1),
  )
  let nextIndex = 0

  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < source.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(source[currentIndex], currentIndex)
    }
  })

  await Promise.all(runners)
  return results
}
