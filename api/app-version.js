import { handleCors } from './_cors.js'

function readBoolean(value) {
  return String(value || '').trim().toLowerCase() === 'true'
}

function readVersionCode(value) {
  const cleanValue = String(value || '').trim()

  if (!/^\d+$/.test(cleanValue)) {
    return 0
  }

  const versionCode = Number(cleanValue)
  return Number.isSafeInteger(versionCode) && versionCode > 0 ? versionCode : 0
}

export default function handler(req, res) {
  if (handleCors(req, res)) {
    return
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const platform = String(req.query?.platform || 'android')
    .trim()
    .toLowerCase()

  if (!['android', 'ios'].includes(platform)) {
    return res.status(400).json({ error: 'Unsupported app platform' })
  }

  const forceUpdateVariable =
    platform === 'ios' ? 'IOS_FORCE_UPDATE' : 'ANDROID_FORCE_UPDATE'
  const minimumVersionVariable =
    platform === 'ios' ? 'IOS_MIN_BUILD_NUMBER' : 'ANDROID_MIN_VERSION_CODE'

  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.status(200).json({
    forceUpdate: readBoolean(process.env[forceUpdateVariable]),
    minimumVersionCode: readVersionCode(process.env[minimumVersionVariable]),
  })
}
