import crypto from 'crypto'

const REPORT_CATALOG = Object.freeze({
  RAR00032: Object.freeze({
    requiresBarcode: true,
    requiresDateRange: false,
    requiresCustomer: false,
    permissionField: null,
  }),
  RAR00033: Object.freeze({
    requiresBarcode: true,
    requiresDateRange: false,
    requiresCustomer: false,
    permissionField: null,
  }),
  RAR00034: Object.freeze({
    requiresBarcode: true,
    requiresDateRange: false,
    requiresCustomer: false,
    permissionField: null,
  }),
  RAR00035: Object.freeze({
    requiresBarcode: false,
    requiresDateRange: false,
    requiresCustomer: false,
    permissionField: 'can_view_fixing_report',
  }),
  RAR00036: Object.freeze({
    requiresBarcode: false,
    requiresDateRange: true,
    requiresCustomer: true,
    permissionField: 'can_view_shipment_report',
  }),
  RAR00037: Object.freeze({
    requiresBarcode: false,
    requiresDateRange: false,
    requiresCustomer: false,
    permissionField: 'can_view_yarn_stock_report',
  }),
})

export function getReportDefinition(reportCode) {
  const cleanReportCode = String(reportCode || '').trim()

  return REPORT_CATALOG[cleanReportCode] || null
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
  const reportDefinition = getReportDefinition(reportCode)

  if (!reportDefinition) {
    return false
  }

  return (
    !reportDefinition.permissionField ||
    profile?.role === 'admin' ||
    profile?.[reportDefinition.permissionField] === true
  )
}

export function createReportAccessToken({
  userId,
  reportCode,
  pdfUrl,
  expiresInSeconds = 300,
}) {
  const cleanReportCode = String(reportCode || '').trim()

  if (!getReportDefinition(cleanReportCode)) {
    throw new Error('Desteklenmeyen rapor kodu.')
  }

  const payload = {
    userId,
    reportCode: cleanReportCode,
    pdfUrl,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${encodedPayload}.${makeSignature(encodedPayload)}`
}

export function verifyReportAccessToken(token, expected = {}) {
  const expectedReportCode = String(expected.reportCode || '').trim()

  if (!getReportDefinition(expectedReportCode)) {
    return false
  }

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
    payload.reportCode === expectedReportCode &&
    payload.pdfUrl === expected.pdfUrl
  )
}
