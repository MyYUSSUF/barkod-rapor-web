function readBoolean(value) {
  return String(value || '').trim().toLowerCase() === 'true'
}

function readVersionCode(value) {
  const versionCode = Number.parseInt(value, 10)
  return Number.isSafeInteger(versionCode) && versionCode > 0 ? versionCode : 0
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.status(200).json({
    forceUpdate: readBoolean(process.env.ANDROID_FORCE_UPDATE),
    minimumVersionCode: readVersionCode(process.env.ANDROID_MIN_VERSION_CODE),
  })
}
