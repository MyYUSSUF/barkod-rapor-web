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

  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.status(200).json({
    forceUpdate: readBoolean(process.env.ANDROID_FORCE_UPDATE),
    minimumVersionCode: readVersionCode(process.env.ANDROID_MIN_VERSION_CODE),
  })
}
