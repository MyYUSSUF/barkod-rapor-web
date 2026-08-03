import { createClient } from '@supabase/supabase-js'
import { verifyApprovedDeviceRequest } from './_device-auth.js'
import { handleCors } from './_cors.js'
import { enforceRequestLimit } from './_rate-limit.js'

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
    } catch {
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

function enrichProfiles(profiles, devices) {
  const deviceSummaryMap = new Map()
  const devicesByUserMap = new Map()

  for (const device of devices || []) {
    const summary = deviceSummaryMap.get(device.user_id) || {
      approved_device_count: 0,
      pending_device_count: 0,
      revoked_device_count: 0,
      last_device_seen_at: null,
    }
    const userDevices = devicesByUserMap.get(device.user_id) || []

    if (device.status === 'approved') summary.approved_device_count += 1
    if (device.status === 'pending') summary.pending_device_count += 1
    if (device.status === 'revoked') summary.revoked_device_count += 1

    if (
      device.last_seen_at &&
      (!summary.last_device_seen_at ||
        new Date(device.last_seen_at) > new Date(summary.last_device_seen_at))
    ) {
      summary.last_device_seen_at = device.last_seen_at
    }

    if (device.status !== 'revoked') {
      userDevices.push(device)
    }

    deviceSummaryMap.set(device.user_id, summary)
    devicesByUserMap.set(device.user_id, userDevices)
  }

  return (profiles || []).map((profile) => ({
    ...profile,
    ...(deviceSummaryMap.get(profile.id) || {
      approved_device_count: 0,
      pending_device_count: 0,
      revoked_device_count: 0,
      last_device_seen_at: null,
    }),
    devices: (devicesByUserMap.get(profile.id) || []).sort((left, right) => {
      const statusOrder = {
        pending: 0,
        approved: 1,
        revoked: 2,
      }
      const statusDifference =
        (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3)

      if (statusDifference !== 0) {
        return statusDifference
      }

      return new Date(right.last_seen_at || 0) - new Date(left.last_seen_at || 0)
    }),
  }))
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function getEmailFromUsername(username) {
  return `${username}@app.local`
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

async function listProfiles(supabaseAdmin) {
  let { data, error } = await supabaseAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('email', { ascending: true })

  if (error && isMissingYarnStockPermissionColumn(error)) {
    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_SELECT_FALLBACK)
      .order('email', { ascending: true })

    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map(normalizeProfile)
}

async function updateProfile(supabaseAdmin, userId, updatePayload) {
  let { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single()

  if (error && isMissingYarnStockPermissionColumn(error)) {
    const fallbackPayload = { ...updatePayload }
    delete fallbackPayload.can_view_yarn_stock_report

    if (Object.keys(fallbackPayload).length === 0) {
      const profileResult = await supabaseAdmin
        .from('profiles')
        .select(PROFILE_SELECT_FALLBACK)
        .eq('id', userId)
        .single()

      data = profileResult.data
      error = profileResult.error
    } else {
      const fallbackResult = await supabaseAdmin
        .from('profiles')
        .update(fallbackPayload)
        .eq('id', userId)
        .select(PROFILE_SELECT_FALLBACK)
        .single()

      data = fallbackResult.data
      error = fallbackResult.error
    }
  }

  if (error) {
    throw new Error(error.message)
  }

  return normalizeProfile(data)
}

async function upsertProfile(supabaseAdmin, profilePayload) {
  let { data, error } = await supabaseAdmin
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select(PROFILE_SELECT)
    .single()

  if (error && isMissingYarnStockPermissionColumn(error)) {
    const fallbackPayload = { ...profilePayload }
    delete fallbackPayload.can_view_yarn_stock_report

    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .upsert(fallbackPayload, { onConflict: 'id' })
      .select(PROFILE_SELECT_FALLBACK)
      .single()

    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    throw new Error(error.message)
  }

  return normalizeProfile(data)
}

async function getAdminData(supabaseAdmin) {
  const profiles = await listProfiles(supabaseAdmin)

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
    .range(0, 9999)

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

  const { count: nativeSubscriptionCount, error: nativeSubscriptionError } =
    await supabaseAdmin
      .from('native_push_subscriptions')
      .select('id', {
        count: 'exact',
        head: true,
      })

  if (nativeSubscriptionError) {
    throw new Error(nativeSubscriptionError.message)
  }

  const { data: devices, error: devicesError } = await supabaseAdmin
    .from('user_devices')
    .select('id, user_id, device_name, status, created_at, last_seen_at, approved_at')
    .order('created_at', { ascending: false })

  if (devicesError) {
    throw new Error(devicesError.message)
  }

  const visibleDevices = (devices || []).filter(
    (device) => device.status !== 'revoked'
  )

  return {
    users: enrichProfiles(profiles || [], devices || []),
    devices: enrichLogs(visibleDevices, profileMap),
    loginLogs: enrichLogs(loginLogs || [], profileMap),
    reportLogs: enrichLogs(reportLogs || [], profileMap),
    subscriptionCount:
      (subscriptionCount || 0) + (nativeSubscriptionCount || 0),
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

  if (typeof body.can_view_fixing_report === 'boolean') {
    updatePayload.can_view_fixing_report = body.can_view_fixing_report
  }

  if (typeof body.can_view_shipment_report === 'boolean') {
    updatePayload.can_view_shipment_report = body.can_view_shipment_report
  }

  if (typeof body.can_view_yarn_stock_report === 'boolean') {
    updatePayload.can_view_yarn_stock_report = body.can_view_yarn_stock_report
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new Error('Güncellenecek alan yok.')
  }

  return updateProfile(supabaseAdmin, userId, updatePayload)
}

async function updateUserPassword(req, supabaseAdmin) {
  const body = parseBody(req)
  const userId = body.userId
  const password = String(body.password || '')

  if (!isNotBlank(userId)) {
    throw new Error('Kullanıcı ID eksik.')
  }

  if (!isNotBlank(password)) {
    throw new Error('Yeni şifre boş olamaz.')
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    id: data?.user?.id || userId,
  }
}

async function createUser(req, supabaseAdmin) {
  const body = parseBody(req)
  const username = normalizeUsername(body.username)
  const password = String(body.password || '')
  const fullName = String(body.full_name || '').trim()
  const role = isNotBlank(body.role) ? String(body.role).trim() : 'user'

  if (!isNotBlank(username)) {
    throw new Error('Kullanıcı adı eksik.')
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    throw new Error('Kullanıcı adı sadece harf, rakam, nokta, tire veya alt çizgi içerebilir.')
  }

  if (!isNotBlank(password)) {
    throw new Error('Şifre eksik.')
  }

  if (!['admin', 'user'].includes(role)) {
    throw new Error('Rol sadece admin veya user olabilir.')
  }

  const email = getEmailFromUsername(username)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  })

  if (authError || !authData?.user?.id) {
    throw new Error(authError?.message || 'Kullanıcı oluşturulamadı.')
  }

  const profilePayload = {
    id: authData.user.id,
    email,
    full_name: fullName || username,
    role,
    is_active: true,
    can_view_fixing_report:
      role === 'admin' ? true : body.can_view_fixing_report === true,
    can_view_shipment_report:
      role === 'admin' ? true : body.can_view_shipment_report === true,
    can_view_yarn_stock_report:
      role === 'admin' ? true : body.can_view_yarn_stock_report === true,
  }

  try {
    return await upsertProfile(supabaseAdmin, profilePayload)
  } catch (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {})
    throw new Error(profileError.message, { cause: profileError })
  }
}

async function deleteUser(req, supabaseAdmin, authResult) {
  const body = parseBody(req)
  const userId = body.userId

  if (!isNotBlank(userId)) {
    throw new Error('Kullanıcı ID eksik.')
  }

  if (userId === authResult.userId) {
    throw new Error('Kendi kullanıcını silemezsin.')
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  const deleteSteps = [
    async () =>
      supabaseAdmin
        .from('user_devices')
        .update({ approved_by: null })
        .eq('approved_by', userId),
    async () =>
      supabaseAdmin
        .from('native_push_subscriptions')
        .delete()
        .eq('user_id', userId),
    async () =>
      supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId),
    async () =>
      supabaseAdmin
        .from('report_logs')
        .delete()
        .eq('user_id', userId),
    async () =>
      supabaseAdmin
        .from('login_logs')
        .delete()
        .eq('user_id', userId),
    async () =>
      supabaseAdmin
        .from('user_devices')
        .delete()
        .eq('user_id', userId),
    async () =>
      supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId),
  ]

  for (const runStep of deleteSteps) {
    const { error } = await runStep()

    if (error) {
      throw new Error(error.message)
    }
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (authDeleteError) {
    throw new Error(authDeleteError.message)
  }

  return {
    id: userId,
    email: profile?.email || '',
    full_name: profile?.full_name || '',
  }
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
  if (handleCors(req, res)) {
    return
  }

  try {
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
      return res.status(405).json({
        error: 'Sadece GET, POST, PATCH ve DELETE desteklenir.',
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

    const requestBody = parseBody(req)
    const isReadRequest = req.method === 'GET'

    if (
      !enforceRequestLimit(res, {
        scope: isReadRequest ? 'admin-read' : 'admin-change',
        key: isReadRequest
          ? authResult.userId
          : `${authResult.userId}:${req.method}:${requestBody.action || 'user'}`,
        maxRequests: isReadRequest ? 120 : 30,
        windowMs: 60_000,
        minIntervalMs: isReadRequest ? 0 : 250,
        errorMessage:
          'Yönetim işlemi çok hızlı tekrarlandı. Lütfen kısa bir süre bekleyin.',
      })
    ) {
      return
    }

    if (req.method === 'POST') {
      const newUser = await createUser(req, supabaseAdmin)

      return res.status(201).json({
        success: true,
        user: newUser,
      })
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req)

      if (body.action === 'update_password') {
        const updatedPasswordUser = await updateUserPassword(req, supabaseAdmin)

        return res.status(200).json({
          success: true,
          user: updatedPasswordUser,
        })
      }

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

    if (req.method === 'DELETE') {
      const deletedUser = await deleteUser(req, supabaseAdmin, authResult)

      return res.status(200).json({
        success: true,
        user: deletedUser,
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
