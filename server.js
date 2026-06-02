import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const PORT = process.env.PORT || 3001

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'http://repx.elvandyeing.com'
const ENDPOINT = `${BASE_URL}/RepxService/vxC_RepxWebService.asmx`
const WSDL_URL = `${ENDPOINT}?WSDL`

let cachedTargetNs = null

app.use(cors())
app.use(express.json())

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

  return url
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

async function getReportPdfUrl(reportCode, barcode) {
  await ensureWsdlInfoLoaded()

  const soapNs = isNotBlank(cachedTargetNs)
    ? cachedTargetNs.trim()
    : 'http://localhost:5800/RepxService/'

  const soapAction = soapNs.endsWith('/')
    ? soapNs + 'GetReport'
    : soapNs + '/GetReport'

  const reportParameters = buildReportParametersFromBarcode(barcode)

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
    '<languageCode>TUR</languageCode>' +
    '<dateFormat>dd.mm.yyyy</dateFormat>' +
    '<numberDecimalSeperator>.</numberDecimalSeperator>' +
    '<currentCultureName>TR-tr</currentCultureName>' +
    '<userCode>Admin</userCode>' +
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
    return BASE_URL + result
  }

  return BASE_URL + '/' + result
}

app.post('/api/report-url', async (req, res) => {
  try {
    const { barcode, reportCode } = req.body

    if (!isNotBlank(barcode)) {
      return res.status(400).json({ error: 'Barkod zorunludur.' })
    }

    if (!isNotBlank(reportCode)) {
      return res.status(400).json({ error: 'Rapor kodu zorunludur.' })
    }

    const pdfUrl = await getReportPdfUrl(reportCode, barcode)

    res.json({ pdfUrl })
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Rapor linki alınamadı.',
    })
  }
})

app.use(express.static(path.join(__dirname, 'dist')))

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Barkod Rapor Web çalışıyor: http://localhost:${PORT}`)
})