import crypto from 'crypto'

const REPORT_PERMISSION_FIELDS = {
  RAR00035: 'can_view_fixing_report',
  RAR00036: 'can_view_shipment_report',
  RAR00037: 'can_view_yarn_stock_report',
}

function getSigningSecret() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
}

function makeSignature(value) {
  const secret = getSigningSecret()

  if (!secret) {
    throw new Error('Rapor erişim imza anahtarı eksik.')
  }

  return crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url')
}

export function canProfileViewReport(profile, reportCode) {
  const permissionField = REPORT_PERMISSION_FIELDS[reportCode]

  return (
    !permissionField ||
    profile?.role === 'admin' ||
    profile?.[permissionField] === true
  )
}

export function createReportAccessToken({
  userId,
  reportCode,
  pdfUrl,
  expiresInSeconds = 300,
}) {
  const payload = {
    userId,
    reportCode,
    pdfUrl,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${encodedPayload}.${makeSignature(encodedPayload)}`
}

export function verifyReportAccessToken(token, expected = {}) {
  const [encodedPayload, signature] = String(token || '').split('.')

  if (!encodedPayload || !signature) {
    return false
  }

  const expectedSignature = makeSignature(encodedPayload)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return false
  }

  let payload

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  return (
    Number(payload.expiresAt) > Date.now() &&
    payload.userId === expected.userId &&
    payload.reportCode === expected.reportCode &&
    payload.pdfUrl === expected.pdfUrl
  )
}
