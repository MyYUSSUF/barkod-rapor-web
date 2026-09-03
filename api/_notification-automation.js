import { getDailyMotivation } from './_daily-motivation.js'

export const AUTOMATION_TIMEZONE = 'Africa/Cairo'
export const MAX_AUTOMATION_TARGET_USERS = 100
export const AUTOMATION_CONTENT_TYPES = new Set(['custom', 'daily_motivation'])
export const AUTOMATION_AUDIENCES = new Set(['all', 'user'])
export const AUTOMATION_DELIVERY_SCOPES = new Set([
  'all_devices',
  'latest_device',
])

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/
const WEEKDAY_MAP = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
})

export class NotificationAutomationError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'NotificationAutomationError'
    this.statusCode = statusCode
  }
}

function normalizeText(
  value,
  label,
  { maxLength, maxBytes, required = true } = {},
) {
  const result = String(value ?? '').trim()

  if (required && !result) {
    throw new NotificationAutomationError(`${label} boş olamaz.`)
  }

  if (maxLength && Array.from(result).length > maxLength) {
    throw new NotificationAutomationError(
      `${label} en fazla ${maxLength} karakter olabilir.`,
    )
  }

  if (maxBytes && Buffer.byteLength(result, 'utf8') > maxBytes) {
    throw new NotificationAutomationError(
      `${label} UTF-8 olarak en fazla ${maxBytes} bayt olabilir.`,
    )
  }

  return result
}

export function normalizeAutomationDays(value) {
  const rawDays = Array.isArray(value) ? value : []
  const numericDays = rawDays.map((day) => Number(day))

  if (
    numericDays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    )
  ) {
    throw new NotificationAutomationError('Geçersiz gönderim günü seçildi.')
  }

  const days = [...new Set(numericDays)].sort((left, right) => left - right)

  if (days.length === 0) {
    throw new NotificationAutomationError('En az bir gönderim günü seçilmelidir.')
  }

  return days
}

export function normalizeAutomationTime(value) {
  const rawValue = String(value || '').trim()

  if (!TIME_PATTERN.test(rawValue)) {
    throw new NotificationAutomationError('Gönderim saati HH:MM biçiminde olmalıdır.')
  }

  return rawValue.slice(0, 5)
}

export function normalizeAutomationId(value, label = 'Otomasyon') {
  const result = String(value || '').trim().toLowerCase()

  if (!USER_ID_PATTERN.test(result)) {
    throw new NotificationAutomationError(`${label} ID geçersiz.`)
  }

  return result
}

export function normalizeAutomationTargetUserIds(input = {}) {
  const targetUserIdsValue = input.targetUserIds ?? input.target_user_ids
  const hasTargetUserIds =
    targetUserIdsValue !== undefined && targetUserIdsValue !== null
  const rawTargetUserIds = hasTargetUserIds
    ? targetUserIdsValue
    : [input.targetUserId ?? input.target_user_id].filter(
      (targetUserId) =>
        targetUserId !== undefined &&
        targetUserId !== null &&
        String(targetUserId).trim() !== '',
    )

  if (!Array.isArray(rawTargetUserIds)) {
    throw new NotificationAutomationError(
      'Otomasyon hedefleri bir kullanıcı listesi olmalıdır.',
    )
  }

  const normalizedTargetUserIds = []
  const seenTargetUserIds = new Set()

  for (const targetUserId of rawTargetUserIds) {
    const normalizedTargetUserId = String(targetUserId ?? '')
      .trim()
      .toLowerCase()

    if (!USER_ID_PATTERN.test(normalizedTargetUserId)) {
      throw new NotificationAutomationError(
        'Otomasyon hedeflerindeki kullanıcı ID geçersiz.',
      )
    }

    if (seenTargetUserIds.has(normalizedTargetUserId)) continue

    seenTargetUserIds.add(normalizedTargetUserId)
    normalizedTargetUserIds.push(normalizedTargetUserId)

    if (normalizedTargetUserIds.length > MAX_AUTOMATION_TARGET_USERS) {
      throw new NotificationAutomationError(
        `En fazla ${MAX_AUTOMATION_TARGET_USERS} kullanıcı seçilebilir.`,
      )
    }
  }

  return normalizedTargetUserIds
}

export function normalizeAutomationInput(input = {}) {
  const name = normalizeText(input.name, 'Otomasyon adı', { maxLength: 80 })
  const contentType = String(input.contentType || input.content_type || 'custom')
    .trim()
    .toLowerCase()
  const audienceType = String(input.audienceType || input.audience_type || 'all')
    .trim()
    .toLowerCase()
  const deliveryScope = String(
    input.deliveryScope || input.delivery_scope ||
      (audienceType === 'user' ? 'latest_device' : 'all_devices'),
  )
    .trim()
    .toLowerCase()
  const targetUserIds = normalizeAutomationTargetUserIds(input)
  const sendTime = normalizeAutomationTime(input.sendTime || input.send_time)
  const daysOfWeek = normalizeAutomationDays(
    input.daysOfWeek || input.days_of_week,
  )
  const activeValue = input.isActive ?? input.is_active

  if (!AUTOMATION_CONTENT_TYPES.has(contentType)) {
    throw new NotificationAutomationError('Geçersiz bildirim içeriği türü.')
  }

  if (!AUTOMATION_AUDIENCES.has(audienceType)) {
    throw new NotificationAutomationError('Geçersiz alıcı türü.')
  }

  if (!AUTOMATION_DELIVERY_SCOPES.has(deliveryScope)) {
    throw new NotificationAutomationError('Geçersiz cihaz gönderim seçimi.')
  }

  if (audienceType === 'user' && targetUserIds.length === 0) {
    throw new NotificationAutomationError('Kişiye özel otomasyon için en az bir kullanıcı seçilmelidir.')
  }

  if (audienceType === 'all' && targetUserIds.length > 0) {
    throw new NotificationAutomationError('Toplu otomasyonda kullanıcı hedeflenemez.')
  }

  if (audienceType === 'all' && deliveryScope !== 'all_devices') {
    throw new NotificationAutomationError('Toplu otomasyon tüm aktif cihazlara gönderilmelidir.')
  }

  if (activeValue !== undefined && typeof activeValue !== 'boolean') {
    throw new NotificationAutomationError('Otomasyon durumu geçersiz.')
  }

  const result = {
    name,
    content_type: contentType,
    audience_type: audienceType,
    target_user_id: audienceType === 'user' ? targetUserIds[0] : null,
    target_user_ids: audienceType === 'user' ? targetUserIds : null,
    delivery_scope: deliveryScope,
    timezone: AUTOMATION_TIMEZONE,
    send_time: sendTime,
    days_of_week: daysOfWeek,
    title_tr: null,
    body_tr: null,
    title_en: null,
    body_en: null,
    url: normalizeText(input.url || '/', 'Bildirim bağlantısı', {
      maxLength: 512,
      maxBytes: 512,
    }),
    is_active: activeValue === undefined ? true : activeValue,
  }

  if (contentType === 'custom') {
    result.title_tr = normalizeText(
      input.titleTr ?? input.title_tr,
      'Türkçe başlık',
      { maxLength: 120, maxBytes: 480 },
    )
    result.body_tr = normalizeText(
      input.bodyTr ?? input.body_tr,
      'Türkçe mesaj',
      { maxLength: 800, maxBytes: 2800 },
    )
    result.title_en = normalizeText(
      input.titleEn ?? input.title_en,
      'İngilizce başlık',
      { maxLength: 120, maxBytes: 480 },
    )
    result.body_en = normalizeText(
      input.bodyEn ?? input.body_en,
      'İngilizce mesaj',
      { maxLength: 800, maxBytes: 2800 },
    )
  }

  return result
}

export function getZonedMinuteParts(
  date = new Date(),
  timeZone = AUTOMATION_TIMEZONE,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    weekday: WEEKDAY_MAP[values.weekday],
  }
}

export function findDueAutomationOccurrence(
  automation,
  now = new Date(),
  lookbackMinutes = 2,
) {
  const sendTime = normalizeAutomationTime(automation?.send_time)
  const days = normalizeAutomationDays(automation?.days_of_week)
  const timeZone = automation?.timezone || AUTOMATION_TIMEZONE
  const safeLookback = Math.max(0, Math.min(5, Number(lookbackMinutes) || 0))

  for (let offset = 0; offset <= safeLookback; offset += 1) {
    const candidate = new Date(now.getTime() - offset * 60_000)
    const parts = getZonedMinuteParts(candidate, timeZone)

    if (parts.time === sendTime && days.includes(parts.weekday)) {
      return new Date(Math.floor(candidate.getTime() / 60_000) * 60_000)
        .toISOString()
    }
  }

  return null
}

export function getAutomationNotificationPayload(automation, date = new Date()) {
  if (automation?.content_type === 'daily_motivation') {
    const motivation = getDailyMotivation(date)

    return {
      title: motivation.messages.en.title,
      body: motivation.messages.en.body,
      url: motivation.url || '/',
      localizedMessages: motivation.messages,
      motivationMessageId: motivation.messageId,
    }
  }

  return {
    title: automation?.title_en,
    body: automation?.body_en,
    url: automation?.url || '/',
    localizedMessages: {
      tr: {
        title: automation?.title_tr,
        body: automation?.body_tr,
        url: automation?.url || '/',
      },
      en: {
        title: automation?.title_en,
        body: automation?.body_en,
        url: automation?.url || '/',
      },
    },
    motivationMessageId: null,
  }
}

export function serializeAutomation(automation) {
  if (!automation) return automation

  const targetUserIds = normalizeAutomationTargetUserIds(automation)

  return {
    ...automation,
    target_user_id: targetUserIds[0] || null,
    target_user_ids: targetUserIds,
    targetUserId: targetUserIds[0] || null,
    targetUserIds,
    send_time: normalizeAutomationTime(automation.send_time),
    days_of_week: normalizeAutomationDays(automation.days_of_week),
    timezone: AUTOMATION_TIMEZONE,
  }
}
