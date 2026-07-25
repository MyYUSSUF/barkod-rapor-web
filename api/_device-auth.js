import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { approvePendingDevice } from './_device-registry.js'

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function getHeader(req, name) {
  const headers = req?.headers || {}
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || ''
}

function getBearerToken(req) {
  const authHeader = getHeader(req, 'authorization')

  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return ''
  }

  return String(authHeader).slice('Bearer '.length).trim()
}

function getDeviceToken(req) {
  return String(getHeader(req, 'x-device-token') || '').trim()
}

function hashDeviceToken(deviceToken) {
  return crypto
    .createHash('sha256')
    .update(String(deviceToken))
    .digest('hex')
}

function createUserClient(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!isNotBlank(supabaseUrl) || !isNotBlank(supabaseAnonKey)) {
    throw new Error('Supabase URL veya anon key sunucu ayarlarında eksik.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const PROFILE_SELECT =
  'id, email, full_name, role, is_active, can_view_fixing_report, can_view_shipment_report, can_view_yarn_stock_report'
const PROFILE_SELECT_FALLBACK =
  'id, email, full_name, role, is_active, can_view_fixing_report, can_view_shipment_report'

function normalizeProfile(profile) {
  if (!profile) {
    return profile
  }

  return {
    ...profile,
    can_view_yarn_stock_report:
      profile.can_view_yarn_stock_report === true,
  }
}

function isMissingYarnStockPermissionColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`

  return message.includes('can_view_yarn_stock_report')
}

async function fetchProfileById(supabase, userId) {
  let { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .single()

  if (error && isMissingYarnStockPermissionColumn(error)) {
    const fallbackResult = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_FALLBACK)
      .eq('id', userId)
      .single()

    data = fallbackResult.data
    error = fallbackResult.error
  }

  return {
    data: normalizeProfile(data),
    error,
  }
}

function normalizeDeviceResult(data) {
  if (Array.isArray(data)) {
    return data[0] || {}
  }

  if (data && typeof data === 'object') {
    return data
  }

  return {
    status: typeof data === 'string' ? data : '',
  }
}

export function resolveDeviceAccessStatus(status) {
  return String(status || '').trim() === 'revoked' ? 'revoked' : 'approved'
}

async function allowDeviceWithoutApproval({
  userId,
  deviceHash,
  deviceName,
  status,
}) {
  const accessStatus = resolveDeviceAccessStatus(status)

  if (accessStatus === 'revoked') {
    return accessStatus
  }

  if (status !== 'approved') {
    try {
      await approvePendingDevice(userId, deviceHash, deviceName)
    } catch (approvalError) {
      console.error('Cihaz kaydı otomatik onaylanamadı:', approvalError)
    }
  }

  return accessStatus
}

async function verifyUserRequest(req) {
  const accessToken = getBearerToken(req)

  if (!isNotBlank(accessToken)) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Oturum bulunamadı.',
    }
  }

  const supabase = createUserClient(accessToken)
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)

  if (userError || !userData?.user?.id) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Kullanıcı doğrulanamadı.',
    }
  }

  const userId = userData.user.id
  const { data: profile, error: profileError } = await fetchProfileById(
    supabase,
    userId
  )

  if (profileError || !profile) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Kullanıcı profili bulunamadı.',
    }
  }

  if (profile.is_active === false) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Kullanıcı pasif durumda.',
    }
  }

  return {
    ok: true,
    accessToken,
    supabase,
    userId,
    profile,
  }
}

export async function requestDeviceAccess(req, deviceName = '') {
  const authResult = await verifyUserRequest(req)

  if (!authResult.ok) {
    return authResult
  }

  const deviceToken = getDeviceToken(req)

  if (deviceToken.length < 32) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Geçerli cihaz anahtarı bulunamadı.',
    }
  }

  const deviceHash = hashDeviceToken(deviceToken)

  const { data, error } = await authResult.supabase.rpc('request_device_access', {
    p_device_hash: deviceHash,
    p_device_name: String(deviceName || '').slice(0, 500),
  })

  if (error) {
    throw new Error(`Cihaz kaydı yapılamadı: ${error.message}`)
  }

  const result = normalizeDeviceResult(data)
  let status = result.status || 'pending'
  status = await allowDeviceWithoutApproval({
    userId: authResult.userId,
    deviceHash,
    deviceName,
    status,
  })

  return {
    ...authResult,
    deviceStatus: status,
    deviceApproved: status === 'approved',
  }
}

export async function verifyApprovedDeviceRequest(req, options = {}) {
  const { requireAdmin = false } = options
  const authResult = await verifyUserRequest(req)

  if (!authResult.ok) {
    return authResult
  }

  if (requireAdmin && authResult.profile.role !== 'admin') {
    return {
      ok: false,
      statusCode: 403,
      error: 'Bu işlem için admin yetkisi gerekir.',
    }
  }

  const deviceToken = getDeviceToken(req)

  if (deviceToken.length < 32) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Cihaz doğrulaması bulunamadı.',
    }
  }

  const { data, error } = await authResult.supabase.rpc('check_device_access', {
    p_device_hash: hashDeviceToken(deviceToken),
  })

  if (error) {
    throw new Error(`Cihaz doğrulanamadı: ${error.message}`)
  }

  const result = normalizeDeviceResult(data)
  let status = result.status || (typeof data === 'string' ? data : 'missing')
  status = await allowDeviceWithoutApproval({
    userId: authResult.userId,
    deviceHash: hashDeviceToken(deviceToken),
    deviceName: getHeader(req, 'user-agent'),
    status,
  })

  if (status !== 'approved') {
    return {
      ok: false,
      statusCode: 403,
      deviceStatus: status,
      error:
        status === 'pending'
          ? 'Bu cihaz yönetici onayı bekliyor.'
          : 'Bu cihazın erişim izni yok.',
    }
  }

  return {
    ...authResult,
    deviceStatus: status,
    deviceApproved: true,
  }
}
