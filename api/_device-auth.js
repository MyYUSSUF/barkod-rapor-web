import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import {
  approveFirstPendingDevice,
  hasRegisteredDevice,
  notifyAdminsAboutDeviceAccess,
} from './_admin-device-notification.js'

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
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', userId)
    .single()

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
  let deviceWasRegistered = true

  try {
    deviceWasRegistered = await hasRegisteredDevice(authResult.userId, deviceHash)
  } catch (deviceHistoryError) {
    console.error('Cihaz geçmişi kontrol edilemedi:', deviceHistoryError)
  }

  const { data, error } = await authResult.supabase.rpc('request_device_access', {
    p_device_hash: deviceHash,
    p_device_name: String(deviceName || '').slice(0, 500),
  })

  if (error) {
    throw new Error(`Cihaz kaydı yapılamadı: ${error.message}`)
  }

  const result = normalizeDeviceResult(data)
  let status = result.status || 'pending'

  if (status === 'pending') {
    try {
      const firstDeviceApproved = await approveFirstPendingDevice(
        authResult.userId,
        deviceHash
      )

      if (firstDeviceApproved) {
        status = 'approved'
      }
    } catch (approvalError) {
      console.error('İlk cihaz otomatik onaylanamadı:', approvalError)
    }
  }

  if (['approved', 'pending'].includes(status) && !deviceWasRegistered) {
    try {
      await notifyAdminsAboutDeviceAccess({
        userId: authResult.userId,
        userName:
          authResult.profile.full_name ||
          authResult.profile.email ||
          authResult.userId,
        deviceName,
        status,
      })
    } catch (notificationError) {
      console.error('Admin cihaz bildirimi gönderilemedi:', notificationError)
    }
  }

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
  const status = result.status || (typeof data === 'string' ? data : 'missing')

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
