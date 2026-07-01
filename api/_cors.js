const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/barkod-rapor-web\.vercel\.app$/,
  /^https:\/\/barkod-rapor-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/localhost$/,
  /^capacitor:\/\/localhost$/,
  /^ionic:\/\/localhost$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

function getHeader(req, name) {
  const headers = req?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || ''
}

function getAllowedOrigin(origin) {
  const cleanOrigin = String(origin || '').trim()

  if (!cleanOrigin) {
    return '*'
  }

  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(cleanOrigin))
    ? cleanOrigin
    : 'https://barkod-rapor-web.vercel.app'
}

export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(getHeader(req, 'origin')))
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Device-Token'
  )
  res.setHeader('Access-Control-Max-Age', '86400')
}

export function handleCors(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }

  return false
}
