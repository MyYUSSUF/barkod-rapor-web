export const SUPPORTED_NOTIFICATION_LANGUAGES = new Set(['tr', 'en'])

export function parseOptionalNotificationLanguage(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }

  const language = String(value).trim().toLowerCase()
  return SUPPORTED_NOTIFICATION_LANGUAGES.has(language) ? language : null
}

export function getNotificationLanguage(value, fallback = 'tr') {
  return (
    parseOptionalNotificationLanguage(value) ||
    parseOptionalNotificationLanguage(fallback) ||
    'tr'
  )
}

export function getNotificationLanguageForAppLanguage(value) {
  return String(value || '').trim().toLowerCase() === 'tr' ? 'tr' : 'en'
}

export function getNotificationLanguageForReportLanguage(value) {
  const language = String(value || 'tr').trim().toLowerCase()

  return ['en', 'eng', 'english', 'ar', 'ara', 'arabic'].includes(language)
    ? 'en'
    : 'tr'
}
