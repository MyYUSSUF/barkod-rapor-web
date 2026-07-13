import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function cleanKey(value) {
  return String(value || '')
    .replace('Public Key:', '')
    .replace('Private Key:', '')
    .replace('Public key:', '')
    .replace('Private key:', '')
    .replace('PUBLIC KEY:', '')
    .replace('PRIVATE KEY:', '')
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replaceAll(' ', '')
    .replaceAll('\n', '')
    .replaceAll('\r', '')
    .replaceAll('=', '')
    .trim()
}

function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!isNotBlank(supabaseUrl) || !isNotBlank(serviceRoleKey)) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function configureWebPush() {
  const publicKey = cleanKey(process.env.VAPID_PUBLIC_KEY)
  const privateKey = cleanKey(process.env.VAPID_PRIVATE_KEY)
  const configuredSubject = String(process.env.VAPID_SUBJECT || '').trim()
  const subject =
    configuredSubject.startsWith('http://') ||
    configuredSubject.startsWith('https://') ||
    configuredSubject.startsWith('mailto:')
      ? configuredSubject
      : 'https://barkod-rapor-web.vercel.app'

  if (!publicKey || !privateKey) {
    return false
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

export async function hasRegisteredDevice(userId, deviceHash) {
  const supabaseAdmin = createAdminClient()

  if (!supabaseAdmin) {
    return false
  }

  const { data, error } = await supabaseAdmin
    .from('user_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('device_hash', deviceHash)
    .maybeSingle()

  if (error) {
    throw new Error(`Cihaz geçmişi kontrol edilemedi: ${error.message}`)
  }

  return Boolean(data?.id)
}

export async function approveFirstPendingDevice(userId, deviceHash) {
  const supabaseAdmin = createAdminClient()

  if (!supabaseAdmin) {
    return false
  }

  const { data: devices, error: devicesError } = await supabaseAdmin
    .from('user_devices')
    .select('id, device_hash, status')
    .eq('user_id', userId)

  if (devicesError) {
    throw new Error(`Kullanıcı cihazları kontrol edilemedi: ${devicesError.message}`)
  }

  if (
    devices?.length !== 1 ||
    devices[0].device_hash !== deviceHash ||
    devices[0].status !== 'pending'
  ) {
    return false
  }

  const { data: approvedDevice, error: approveError } = await supabaseAdmin
    .from('user_devices')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', devices[0].id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (approveError) {
    throw new Error(`İlk cihaz otomatik onaylanamadı: ${approveError.message}`)
  }

  return Boolean(approvedDevice?.id)
}

export async function approveAdminDevice(userId, deviceHash, deviceName = '') {
  const supabaseAdmin = createAdminClient()

  if (!supabaseAdmin) {
    return false
  }

  const cleanDeviceName = String(deviceName || '').slice(0, 500)
  const now = new Date().toISOString()
  const { data: existingDevice, error: existingError } = await supabaseAdmin
    .from('user_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('device_hash', deviceHash)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Admin cihazı kontrol edilemedi: ${existingError.message}`)
  }

  if (existingDevice?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('user_devices')
      .update({
        status: 'approved',
        device_name: cleanDeviceName,
        last_seen_at: now,
        approved_at: now,
        approved_by: userId,
      })
      .eq('id', existingDevice.id)

    if (updateError) {
      throw new Error(`Admin cihazı onaylanamadı: ${updateError.message}`)
    }

    return true
  }

  const { error: insertError } = await supabaseAdmin
    .from('user_devices')
    .insert({
      user_id: userId,
      device_hash: deviceHash,
      device_name: cleanDeviceName,
      status: 'approved',
      approved_at: now,
      approved_by: userId,
    })

  if (insertError) {
    throw new Error(`Admin cihazı oluşturulamadı: ${insertError.message}`)
  }

  return true
}

export async function notifyAdminsAboutDeviceAccess({
  userId,
  userName,
  deviceName,
  status,
}) {
  const supabaseAdmin = createAdminClient()

  if (!supabaseAdmin || !configureWebPush()) {
    return {
      sent: 0,
      skipped: true,
    }
  }

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .or('is_active.is.null,is_active.eq.true')

  if (adminsError) {
    throw new Error(`Admin kullanıcıları alınamadı: ${adminsError.message}`)
  }

  const adminIds = (admins || []).map((admin) => admin.id)

  if (adminIds.length === 0) {
    return {
      sent: 0,
      skipped: true,
    }
  }

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, subscription')
    .in('user_id', adminIds)

  if (subscriptionsError) {
    throw new Error(`Admin bildirim cihazları alınamadı: ${subscriptionsError.message}`)
  }

  const safeUserName = String(userName || userId || 'Bilinmeyen kullanıcı').slice(0, 120)
  const safeDeviceName = String(deviceName || 'Yeni cihaz').slice(0, 180)
  const automaticallyApproved = status === 'approved'
  const payload = JSON.stringify({
    title: automaticallyApproved
      ? 'İlk cihaz otomatik onaylandı'
      : 'Yeni cihaz onayı bekliyor',
    body: `${safeUserName}: ${safeDeviceName}`,
    url: '/',
  })

  let sent = 0
  const invalidSubscriptionIds = []

  for (const item of subscriptions || []) {
    try {
      await webPush.sendNotification(item.subscription, payload)
      sent += 1
    } catch (error) {
      if ([400, 403, 404, 410].includes(error.statusCode)) {
        invalidSubscriptionIds.push(item.id)
      }
    }
  }

  if (invalidSubscriptionIds.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', invalidSubscriptionIds)
  }

  return {
    sent,
    skipped: false,
  }
}
