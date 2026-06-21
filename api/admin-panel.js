import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!isNotBlank(supabaseUrl)) {
    throw new Error('SUPABASE_URL veya VITE_SUPABASE_URL eksik.')
  }

  if (!isNotBlank(serviceRoleKey)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function parseBody(req) {
  if (!req.body) {
    return {}
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch (err) {
      return {}
    }
  }

  return req.body
}

function enrichLogs(logs, profileMap) {
  return (logs || []).map((log) => {
    const profile = profileMap.get(log.user_id)

    return {
      ...log,
      user_email: profile?.email || '',
      user_name: profile?.full_name || profile?.email || log.user_id || '',
    }
  })
}

async function getAdminData(supabaseAdmin) {
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .order('email', { ascending: true })

  if (profilesError) {
    throw new Error(profilesError.message)
  }

  const profileMap = new Map()

  for (const profile of profiles || []) {
    profileMap.set(profile.id, profile)
  }

  const { data: loginLogs, error: loginLogsError } = await supabaseAdmin
    .from('login_logs')
    .select('id, user_id, event_type, device_name, app_version, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (loginLogsError) {
    throw new Error(loginLogsError.message)
  }

  const { data: reportLogs, error: reportLogsError } = await supabaseAdmin
    .from('report_logs')
    .select('id, user_id, barcode, report_code, report_name, device_name, app_version, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (reportLogsError) {
    throw new Error(reportLogsError.message)
  }

  const { count: subscriptionCount, error: subscriptionError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id', {
      count: 'exact',
      head: true,
    })

  if (subscriptionError) {
    throw new Error(subscriptionError.message)
  }

  const { data: devices, error: devicesError } = await supabaseAdmin
    .from('user_devices')
    .select('id, user_id, device_name, status, created_at, last_seen_at, approved_at')
    .order('created_at', { ascending: false })

  if (devicesError) {
    throw new Error(devicesError.message)
  }

  return {
    users: profiles || [],
    devices: enrichLogs(devices || [], profileMap),
    loginLogs: enrichLogs(loginLogs || [], profileMap),
    reportLogs: enrichLogs(reportLogs || [], profileMap),
    subscriptionCount: subscriptionCount || 0,
  }
}

async function updateUser(req, supabaseAdmin, authResult) {
  const body = parseBody(req)
  const userId = body.userId
  const updatePayload = {}

  if (!isNotBlank(userId)) {
    throw new Error('Kullanıcı ID eksik.')
  }

  if (typeof body.is_active === 'boolean') {
    if (userId === authResult.userId && body.is_active === false) {
      throw new Error('Kendi kullanıcını pasif yapamazsın.')
    }

    updatePayload.is_active = body.is_active
  }

  if (isNotBlank(body.role)) {
    if (!['admin', 'user'].includes(body.role)) {
      throw new Error('Rol sadece admin veya user olabilir.')
    }

    updatePayload.role = body.role
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('Güncellenecek alan yok.')
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId)
    .select('id, email, full_name, role, is_active')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function updateDevice(req, supabaseAdmin, authResult) {
  const body = parseBody(req)
  const deviceId = body.deviceId
  const action = body.action

  if (!isNotBlank(deviceId)) {
    throw new Error('Cihaz ID eksik.')
  }

  if (!['approve_device', 'revoke_device'].includes(action)) {
    throw new Error('Geçersiz cihaz işlemi.')
  }

  const { data: targetDevice, error: targetError } = await supabaseAdmin
    .from('user_devices')
    .select('id, user_id, status')
    .eq('id', deviceId)
    .single()

  if (targetError || !targetDevice) {
    throw new Error(targetError?.message || 'Cihaz bulunamadı.')
  }

  if (action === 'approve_device') {
    const { error: revokeError } = await supabaseAdmin
      .from('user_devices')
      .update({ status: 'revoked' })
      .eq('user_id', targetDevice.user_id)
      .eq('status', 'approved')
      .neq('id', targetDevice.id)

    if (revokeError) {
      throw new Error(revokeError.message)
    }

    const { data, error } = await supabaseAdmin
      .from('user_devices')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: authResult.userId,
      })
      .eq('id', targetDevice.id)
      .select('id, user_id, device_name, status, created_at, last_seen_at, approved_at')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  const { data, error } = await supabaseAdmin
    .from('user_devices')
    .update({
      status: 'revoked',
      approved_at: null,
      approved_by: null,
    })
    .eq('id', targetDevice.id)
    .select('id, user_id, device_name, status, created_at, last_seen_at, approved_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'PATCH'].includes(req.method)) {
      return res.status(405).json({
        error: 'Sadece GET ve PATCH desteklenir.',
      })
    }

    const supabaseAdmin = createSupabaseAdminClient()
    const authResult = await verifyApprovedDeviceRequest(req, {
      requireAdmin: true,
    })

    if (!authResult.ok) {
      return res.status(authResult.statusCode || 401).json({
        error: authResult.error || 'Yetkisiz istek.',
      })
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req)

      if (['approve_device', 'revoke_device'].includes(body.action)) {
        const updatedDevice = await updateDevice(req, supabaseAdmin, authResult)

        return res.status(200).json({
          success: true,
          device: updatedDevice,
        })
      }

      const updatedUser = await updateUser(req, supabaseAdmin, authResult)

      return res.status(200).json({
        success: true,
        user: updatedUser,
      })
    }

    const data = await getAdminData(supabaseAdmin)

    return res.status(200).json({
      success: true,
      admin: authResult.profile,
      ...data,
    })
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Admin panel verisi alınamadı.',
    })
  }
}
