import { verifyApprovedDeviceRequest } from './_device-auth.js'
import {
  canProfileViewReport,
  createReportAccessToken,
  getReportDefinition,
} from './_report-access.js'
import { handleCors } from './_cors.js'
import { getNotificationLanguageForReportLanguage } from './_notification-language.js'
import { enforceRequestLimit } from './_rate-limit.js'
import { randomUUID } from 'node:crypto'
import { ReportInputError, validateReportInput } from './_report-input.js'
import { ErpRequestError, fetchErpXml, withErpDeadline } from './_erp-request.js'
import { isAllowedReportUrl } from './report-pdf.js'

const BASE_URL = 'https://repx.elvandyeing.com'
const ENDPOINT = `${BASE_URL}/RepxService/vxC_RepxWebService.asmx`
const WSDL_URL = `${ENDPOINT}?WSDL`

let cachedTargetNs = null

function isNotBlank(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function esc(value) {
  if (value === null || value === undefined) return ''

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildReportParametersFromBarcode(barcode) {
  const cleanBarcode = barcode ? String(barcode).trim() : ''

  if (!cleanBarcode) {
    return ''
  }

  return (
    '<ReportParameter>' +
    '<FieldName>IEM_KodIsemri</FieldName>' +
    '<WhereOperator>=</WhereOperator>' +
    '<Value>' + esc(cleanBarcode) + '</Value>' +
    '</ReportParameter>'
  )
}

function formatErpDate(value) {
  const cleanValue = value ? String(value).trim() : ''

  if (!cleanValue) {
    return ''
  }

  const isoDateMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (isoDateMatch) {
    return `${isoDateMatch[3]}.${isoDateMatch[2]}.${isoDateMatch[1]}`
  }

  return cleanValue
}

function buildShipmentReportParameters(startDate, endDate) {
  const cleanStartDate = formatErpDate(startDate)
  const cleanEndDate = formatErpDate(endDate)

  return (
    '<ReportParameter>' +
    '<FieldName>HSI_TarihIrs</FieldName>' +
    '<Connector>AND</Connector>' +
    '<WhereOperator>&gt;=</WhereOperator>' +
    '<Value>' + esc(cleanStartDate) + '</Value>' +
    '</ReportParameter>' +
    '<ReportParameter>' +
    '<FieldName>HSI_TarihIrs</FieldName>' +
    '<Connector>AND</Connector>' +
    '<WhereOperator>&lt;=</WhereOperator>' +
    '<Value>' + esc(cleanEndDate) + '</Value>' +
    '</ReportParameter>'
  )
}

function getUserCodeForReport(reportCode, customerCode) {
  if (reportCode === 'RAR00036' && isNotBlank(customerCode)) {
    return String(customerCode).trim()
  }

  return 'Admin'
}

function getReportLocale(reportLanguage) {
  if (getNotificationLanguageForReportLanguage(reportLanguage) === 'en') {
    return {
      languageCode: 'ENG',
      currentCultureName: 'EN-us',
    }
  }

  return {
    languageCode: 'TUR',
    currentCultureName: 'TR-tr',
  }
}

export async function rememberNativeNotificationLanguage(
  authResult,
  reportLanguage,
) {
  if (!authResult?.deviceHash || !authResult?.supabase?.rpc) {
    return false
  }

  try {
    return await withErpDeadline(async (signal) => {
      const query = authResult.supabase.rpc(
        'set_native_notification_language',
        {
          p_device_hash: authResult.deviceHash,
          p_notification_language:
            getNotificationLanguageForReportLanguage(reportLanguage),
        },
      )
      const { data, error } = await (query.abortSignal ? query.abortSignal(signal) : query)
      return !error && data === true
    }, 1000)
  } catch {
    // Language discovery is best effort and must never block a report.
    return false
  }
}

function extractTagText(xml, tagName) {
  if (!xml) return ''

  const regex = new RegExp(`<[^>]*${tagName}[^>]*>([\\s\\S]*?)<\\/[^>]*${tagName}>`, 'i')
  const match = xml.match(regex)

  if (!match) return ''

  return match[1]
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .trim()
}

function matchFirst(text, regexText) {
  if (!text) return null

  const regex = new RegExp(regexText, 'i')
  const match = text.match(regex)

  return match ? match[1] : null
}

function convertInternalUrlToPublicIfNeeded(url) {
  if (!url) return ''

  return String(url)
    .replaceAll('\\', '/')
    .replace('http://repx.elvandyeing.com', BASE_URL)
    .replace('http://10.64.46.5', BASE_URL)
    .replace('https://10.64.46.5', BASE_URL)
}

async function ensureWsdlInfoLoaded(signal, fetchImpl) {
  if (isNotBlank(cachedTargetNs)) {
    return
  }

  const wsdl = await fetchErpXml(WSDL_URL, { signal }, { fetchImpl })
  const targetNs = matchFirst(wsdl, 'targetNamespace\\s*=\\s*"([^"]+)"')

  if (isNotBlank(targetNs)) {
    cachedTargetNs = targetNs.trim()
  }
}

export async function getReportPdfUrl(reportCode, options = {}, { signal, fetchImpl = fetch } = {}) {
  await ensureWsdlInfoLoaded(signal, fetchImpl)

  const {
    barcode = '',
    startDate = '',
    endDate = '',
    customerCode = '',
    reportLanguage = 'tr',
  } = options

  const soapNs = isNotBlank(cachedTargetNs)
    ? cachedTargetNs.trim()
    : 'http://localhost:5800/RepxService/'

  const soapAction = soapNs.endsWith('/')
    ? soapNs + 'GetReport'
    : soapNs + '/GetReport'

  const reportParameters = reportCode === 'RAR00036'
    ? buildShipmentReportParameters(startDate, endDate)
    : buildReportParametersFromBarcode(barcode)
  const userCode = getUserCodeForReport(reportCode, customerCode)
  const reportLocale = getReportLocale(reportLanguage)
  const dateFormat = 'dd.mm.yyyy'

  const soap =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body>' +
    '<GetReport xmlns="' + esc(soapNs) + '">' +
    '<databaseCode>KOZA</databaseCode>' +
    '<reportReferenceCode>' + esc(reportCode) + '</reportReferenceCode>' +
    '<reportParameters>' + reportParameters + '</reportParameters>' +
    '<recordSetParameters></recordSetParameters>' +
    '<flagAlternationRowColor>0</flagAlternationRowColor>' +
    '<flagSinglePage>0</flagSinglePage>' +
    '<languageCode>' + esc(reportLocale.languageCode) + '</languageCode>' +
    '<dateFormat>' + esc(dateFormat) + '</dateFormat>' +
    '<numberDecimalSeperator>.</numberDecimalSeperator>' +
    '<currentCultureName>' + esc(reportLocale.currentCultureName) + '</currentCultureName>' +
    '<userCode>' + esc(userCode) + '</userCode>' +
    '<companyCode>YZV-0001</companyCode>' +
    '<plantCode>YZV-0001-01</plantCode>' +
    '<errorMessage></errorMessage>' +
    '</GetReport>' +
    '</soap:Body>' +
    '</soap:Envelope>'

  const body = await fetchErpXml(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${soapAction}"`,
      'Accept-Encoding': 'identity',
    },
    body: soap,
    signal,
  }, { fetchImpl })

  const errorMessage = extractTagText(body, 'errorMessage')

  if (isNotBlank(errorMessage)) {
    throw new ErpRequestError('ERP_REPORT_ERROR')
  }

  let result = extractTagText(body, 'GetReportResult')

  if (!isNotBlank(result)) {
    throw new ErpRequestError('ERP_EMPTY_RESULT')
  }

  result = result.trim()

  if (result.startsWith('http://') || result.startsWith('https://')) {
    return convertInternalUrlToPublicIfNeeded(result)
  }

  if (result.startsWith('/')) {
    return convertInternalUrlToPublicIfNeeded(BASE_URL + result)
  }

  return convertInternalUrlToPublicIfNeeded(BASE_URL + '/' + result)
}

export function createReportUrlHandler({
  verifyRequest = verifyApprovedDeviceRequest,
  requestLimit = enforceRequestLimit,
  reportUrl = getReportPdfUrl,
  signToken = createReportAccessToken,
  rememberLanguage = rememberNativeNotificationLanguage,
} = {}) {
  return async function handler(req, res) {
    if (handleCors(req, res)) {
      return
    }

    const requestId = randomUUID()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Request-ID', requestId)
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST isteği desteklenir.' })
      }

      const authResult = await verifyRequest(req)

      if (!authResult.ok) {
        return res.status(authResult.statusCode || 403).json({
          error: authResult.error || 'Yetkisiz istek.',
          deviceStatus: authResult.deviceStatus || '',
        })
      }

      const input = req.body
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ReportInputError('Geçerli bir JSON nesnesi gönderilmelidir.')
      }
      const cleanReportCode = typeof input.reportCode === 'string' ? input.reportCode.trim() : ''

      if (!isNotBlank(cleanReportCode)) {
        return res.status(400).json({ error: 'Rapor kodu zorunludur.' })
      }

      const reportDefinition = getReportDefinition(cleanReportCode)

      if (!reportDefinition) {
        return res.status(400).json({ error: 'Desteklenmeyen rapor kodu.' })
      }

      if (!canProfileViewReport(authResult.profile, cleanReportCode)) {
        return res.status(403).json({
          error: 'Bu rapor için kullanıcı yetkiniz bulunmuyor.',
        })
      }

      if (
        !requestLimit(res, {
          scope: 'report-url',
          key: `${authResult.userId}:${cleanReportCode}`,
          maxRequests: 15,
          windowMs: 60_000,
          minIntervalMs: 1000,
          errorMessage:
            'Rapor isteği çok hızlı tekrarlandı. Lütfen kısa bir süre bekleyin.',
        })
      ) {
        return
      }

      const parameters = validateReportInput(input, reportDefinition)
      // Dil kaydı başarısız/yavaş olduğunda rapor beklemez; işlem süresi de sınırlıdır.
      await rememberLanguage(authResult, parameters.reportLanguage)
      const pdfUrl = await withErpDeadline((signal) => reportUrl(cleanReportCode, parameters, { signal }))
      if (!isAllowedReportUrl(pdfUrl)) throw new ErpRequestError('ERP_INVALID_RESULT_URL')

      const reportToken = signToken({
        userId: authResult.userId,
        reportCode: cleanReportCode,
        pdfUrl,
      })

      return res.status(200).json({ pdfUrl, reportToken, requestId })
    } catch (error) {
      const invalidInput = error instanceof ReportInputError
      const upstream = error instanceof ErpRequestError
      const code = invalidInput ? 'INVALID_REPORT_INPUT' : upstream ? error.code : 'REPORT_REQUEST_FAILED'
      if (!invalidInput) console.error('Rapor isteği başarısız:', { requestId, code })
      return res.status(invalidInput ? 400 : upstream ? error.statusCode : 500).json({
        error: invalidInput ? error.message : error?.statusCode === 504
          ? 'Rapor servisi zamanında yanıt vermedi. Lütfen tekrar deneyin.'
          : 'Rapor hazırlanamadı. Lütfen daha sonra tekrar deneyin.',
        code,
        requestId,
      })
    }
  }
}

export default createReportUrlHandler()
