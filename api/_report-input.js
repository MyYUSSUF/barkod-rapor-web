// ERP'ye yalnızca raporun beklediği, sınırlandırılmış değerleri iletir.
export const REPORT_BARCODE_MAX_LENGTH = 120
export const REPORT_MAX_RANGE_DAYS = 366
const CUSTOMER_CODES = new Set(['61001', '61002', 'M000172'])

export class ReportInputError extends Error {}

function text(value, label, maxLength) {
  if (typeof value !== 'string') throw new ReportInputError(`${label} metin olmalıdır.`)
  const result = value.trim()
  if (!result || result.length > maxLength) {
    throw new ReportInputError(`${label} boş veya geçersiz uzunlukta/biçimde.`)
  }
  const hasControl = [...result].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  if (hasControl) throw new ReportInputError(`${label} geçersiz karakter içeriyor.`)
  return result
}

export function parseReportDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10) === value ? date : null
}

export function validateReportInput(input, definition) {
  const language = input.reportLanguage === undefined ? 'tr' : input.reportLanguage
  if (!['tr', 'en', 'ar'].includes(language)) {
    throw new ReportInputError('Geçerli bir rapor dili seçilmelidir.')
  }
  const result = { barcode: '', startDate: '', endDate: '', customerCode: '', reportLanguage: language }
  if (definition.requiresBarcode) {
    result.barcode = text(input.barcode, 'Barkod', REPORT_BARCODE_MAX_LENGTH)
  }
  if (definition.requiresDateRange) {
    const start = parseReportDate(input.startDate)
    const end = parseReportDate(input.endDate)
    if (!start || !end) throw new ReportInputError('Tarihler geçerli YYYY-AA-GG biçiminde olmalıdır.')
    if (end < start) throw new ReportInputError('Bitiş tarihi başlangıçtan önce olamaz.')
    if ((end - start) / 86_400_000 + 1 > REPORT_MAX_RANGE_DAYS) {
      throw new ReportInputError(`Bir rapor en fazla ${REPORT_MAX_RANGE_DAYS} günlük dönemi kapsayabilir.`)
    }
    result.startDate = input.startDate
    result.endDate = input.endDate
  }
  if (definition.requiresCustomer) {
    result.customerCode = text(input.customerCode, 'Müşteri kodu', 20)
    if (!CUSTOMER_CODES.has(result.customerCode)) {
      throw new ReportInputError('Geçerli bir müşteri seçilmelidir.')
    }
  }
  return result
}
