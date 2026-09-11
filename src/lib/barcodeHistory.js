const HISTORY_PREFIX = 'barkod_rapor_history_v2:'

export function barcodeHistoryKey(userId) {
  return typeof userId === 'string' && userId.trim()
    ? `${HISTORY_PREFIX}${encodeURIComponent(userId.trim())}`
    : null
}

export function readBarcodeHistory(storage, userId) {
  const key = barcodeHistoryKey(userId)
  if (!key) return []
  try {
    // Eski ortak geçmişin sahibi bilinmiyor; hiçbir kullanıcıya aktarılmaz.
    const parsed = JSON.parse(storage.getItem(key) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item.value === 'string' && item.value.trim())
      .slice(0, 10).map((item) => ({
        value: item.value.trim().slice(0, 120),
        reportCode: typeof item.reportCode === 'string' ? item.reportCode.slice(0, 80) : '',
        reportName: typeof item.reportName === 'string' ? item.reportName.slice(0, 160) : '',
      }))
  } catch {
    return []
  }
}

export function storeBarcodeHistory(storage, userId, history) {
  const key = barcodeHistoryKey(userId)
  if (!key) return false
  try {
    storage.setItem(key, JSON.stringify(history.slice(0, 10)))
    return true
  } catch {
    // Tarayıcı depolaması kapalı/dolu olduğunda rapor üretimi etkilenmez.
    return false
  }
}

export function removeBarcodeHistory(storage, userId) {
  const key = barcodeHistoryKey(userId)
  if (!key) return
  try { storage.removeItem(key) } catch { /* Özel gezinme/depolama engeli. */ }
}
