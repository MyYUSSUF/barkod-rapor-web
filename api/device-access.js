import {
  requestDeviceAccess,
  verifyApprovedDeviceRequest,
} from './_device-auth.js'

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body !== 'string') return req.body

  try {
    return JSON.parse(req.body)
  } catch {
    return {}
  }
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return res.status(405).json({
        error: 'Sadece GET ve POST desteklenir.',
      })
    }

    const result =
      req.method === 'POST'
        ? await requestDeviceAccess(req, parseBody(req).deviceName)
        : await verifyApprovedDeviceRequest(req)

    if (!result.ok) {
      return res.status(result.statusCode || 403).json({
        error: result.error || 'Cihaz erişimi reddedildi.',
        status: result.deviceStatus || 'missing',
        approved: false,
      })
    }

    return res.status(200).json({
      success: true,
      status: result.deviceStatus,
      approved: result.deviceApproved === true,
    })
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Cihaz doğrulaması yapılamadı.',
    })
  }
}
