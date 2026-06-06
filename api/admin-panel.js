import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || ''

  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return ''
  }

  return String(authHeader).replace('Bearer ', '').trim()
}

function createSupabaseAdminClient() {
  if (!isNotBlank(SUPABASE_URL)) {
    throw new Error('SUPABASE_URL veya VITE_SUPABASE_URL eksik.')
  }

  if (!isNotBlank(SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY eksik.')
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function verifyAdminRequest(req, supabaseAdmin) {
  const bearerToken = getBearerToken(req)

  if (!isNotBlank(bearerToken)) {
    return {
      ok: false,
      error: 'Yetkisiz istek. Yönetici oturumu bulunamadı.',
    }
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(bearerToken)

  if (userError || !userData?.user?.id) {
    return {
      ok: false,
      error: 'Yetkisiz istek. Kullanıcı doğrulanamadı.',
    }
  }

  const userId = userData.user.id

  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', userId)
    .single()

  if (profileError || !profileData) {
    return {
      ok: false,
      error: 'Yetkisiz istek. Profil bulunamadı.',
    }
  }

  if (profileData.is_active === false) {
    return {
      ok: false,
      error: 'Yetkisiz istek. Kullanıcı pasif.',
    }
  }

  if (profileData.role !== 'admin') {
    return {
      ok: false,
      error: 'Yetkisiz istek. Bu işlem için admin yetkisi gerekir.',
    }
  }

  return {
    ok: true,
    userId,
    profile: profileData,
  }
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

  return {
    users: profiles || [],
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

export default async function handler(req, res) {
  try {
    if (!['GET', 'PATCH'].includes(req.method)) {
      return res.status(405).json({
        error: 'Sadece GET ve PATCH desteklenir.',
      })
    }

    const supabaseAdmin = createSupabaseAdminClient()
    const authResult = await verifyAdminRequest(req, supabaseAdmin)

    if (!authResult.ok) {
      return res.status(401).json({
        error: authResult.error || 'Yetkisiz istek.',
      })
    }

    if (req.method === 'PATCH') {
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