import { createClient } from '@supabase/supabase-js'

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
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

export async function approvePendingDevice(userId, deviceHash, deviceName = '') {
  const supabaseAdmin = createAdminClient()

  if (!supabaseAdmin) {
    return false
  }

  const cleanDeviceName = String(deviceName || '').slice(0, 500)
  const now = new Date().toISOString()
  const { data: existingDevice, error: existingError } = await supabaseAdmin
    .from('user_devices')
    .select('id, status')
    .eq('user_id', userId)
    .eq('device_hash', deviceHash)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Cihaz kaydı kontrol edilemedi: ${existingError.message}`)
  }

  // Yeni ve bekleyen cihazlar serbesttir; yönetici tarafından kaldırılan izin korunur.
  if (existingDevice?.status === 'revoked') {
    return false
  }

  if (existingDevice?.id) {
    const updatePayload = {
      status: 'approved',
      device_name: cleanDeviceName,
      last_seen_at: now,
    }

    if (existingDevice.status !== 'approved') {
      updatePayload.approved_at = now
      updatePayload.approved_by = null
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_devices')
      .update(updatePayload)
      .eq('id', existingDevice.id)

    if (updateError) {
      throw new Error(`Cihaz kaydı güncellenemedi: ${updateError.message}`)
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
      approved_by: null,
    })

  if (insertError) {
    throw new Error(`Cihaz kaydı oluşturulamadı: ${insertError.message}`)
  }

  return true
}
