import { verifyApprovedDeviceRequest } from './_device-auth.js'
import {
  canProfileViewReport,
  createReportAccessToken,
  getReportDefinition,
} from './_report-access.js'
import { handleCors } from './_cors.js'
import { enforceRequestLimit } from './_rate-limit.js'

const BASE_URL = 'http://repx.elvandyeing.com'
const ENDPOINT = `${BASE_URL}/RepxService/vxC_RepxWebService.asmx`
const WSDL_URL = `${ENDPOINT}?WSDL`
const SHIPMENT_CUSTOMER_CODES = new Set([
  '61001',
  '61002',
  'M000172',
])

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
  const cleanLanguage = reportLanguage
    ? String(reportLanguage).trim().toLowerCase()
    : 'tr'

  if (['en', 'eng', 'english', 'ar', 'ara', 'arabic'].includes(cleanLanguage)) {
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
    .replace('http://10.64.46.5', BASE_URL)
    .replace('https://10.64.46.5', BASE_URL)
}

async function ensureWsdlInfoLoaded() {
  if (isNotBlank(cachedTargetNs)) {
    return
  }

  const response = await fetch(WSDL_URL)

  if (!response.ok) {
    throw new Error(`WSDL okunamadı. HTTP ${response.status}`)
  }

  const wsdl = await response.text()
  const targetNs = matchFirst(wsdl, 'targetNamespace\\s*=\\s*"([^"]+)"')

  if (isNotBlank(targetNs)) {
    cachedTargetNs = targetNs.trim()
  }
}

async function getReportPdfUrl(reportCode, options = {}) {
  await ensureWsdlInfoLoaded()

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

  console.log('GetReport request:', {
    reportCode,
    parameterMode: reportCode === 'RAR00036' ? 'dateRange' : 'barcode',
    userCode,
    languageCode: reportLocale.languageCode,
  })

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

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${soapAction}"`,
      'Accept-Encoding': 'identity',
    },
    body: soap,
  })

  const body = await response.text()

  if (!response.ok) {
    throw new Error(`SOAP HTTP ${response.status}: ${body.slice(0, 500)}`)
  }

  const errorMessage = extractTagText(body, 'errorMessage')

  if (isNotBlank(errorMessage)) {
    throw new Error(`ERP errorMessage: ${errorMessage}`)
  }

  let result = extractTagText(body, 'GetReportResult')

  if (!isNotBlank(result)) {
    throw new Error('GetReportResult boş.')
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

export default async function handler(req, res) {
  if (handleCors(req, res)) {
    return
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Sadece POST isteği desteklenir.' })
    }

    const authResult = await verifyApprovedDeviceRequest(req)

    if (!authResult.ok) {
      return res.status(authResult.statusCode || 403).json({
        error: authResult.error || 'Yetkisiz istek.',
        deviceStatus: authResult.deviceStatus || '',
      })
    }

    const {
      barcode,
      reportCode,
      reportLanguage,
      startDate,
      endDate,
      customerCode,
    } = req.body || {}
    const cleanReportCode = String(reportCode || '').trim()

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
      !enforceRequestLimit(res, {
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

    if (reportDefinition.requiresBarcode && !isNotBlank(barcode)) {
      return res.status(400).json({ error: 'Barkod zorunludur.' })
    }

    if (
      reportDefinition.requiresDateRange &&
      (!isNotBlank(startDate) || !isNotBlank(endDate))
    ) {
      return res.status(400).json({ error: 'Başlangıç ve bitiş tarihi zorunludur.' })
    }

    if (
      reportDefinition.requiresCustomer &&
      !SHIPMENT_CUSTOMER_CODES.has(String(customerCode || '').trim())
    ) {
      return res.status(400).json({ error: 'Geçerli bir müşteri seçilmelidir.' })
    }

    const pdfUrl = await getReportPdfUrl(cleanReportCode, {
      barcode: reportDefinition.requiresBarcode ? barcode : '',
      startDate,
      endDate,
      customerCode,
      reportLanguage,
    })

    const reportToken = createReportAccessToken({
      userId: authResult.userId,
      reportCode: cleanReportCode,
      pdfUrl,
    })

    return res.status(200).json({ pdfUrl, reportToken })
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Rapor linki alınamadı.',
    })
  }
}
