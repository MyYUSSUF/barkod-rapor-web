$ErrorActionPreference = "Stop"

$appPath = Join-Path $PSScriptRoot "src\App.jsx"
$backupPath = Join-Path $PSScriptRoot "src\App.jsx.backup-before-pdf-viewer"

if (-not (Test-Path $appPath)) {
    throw "src\App.jsx bulunamadi."
}

$content = Get-Content -Path $appPath -Raw -Encoding UTF8

Copy-Item -Path $appPath -Destination $backupPath -Force

# PdfViewer importu
$importNeedle = "import { supabase } from './lib/supabaseClient'"
$importReplacement = @"
import { supabase } from './lib/supabaseClient'
import PdfViewer from './PdfViewer'
"@

if ($content -notmatch [regex]::Escape("import PdfViewer from './PdfViewer'")) {
    if (-not $content.Contains($importNeedle)) {
        throw "Supabase import satiri bulunamadi."
    }

    $content = $content.Replace(
        $importNeedle,
        $importReplacement.TrimEnd()
    )
}

# Uygulama sürümü
$content = $content.Replace(
    "const APP_VERSION = 'v1.17'",
    "const APP_VERSION = 'v1.18'"
)

$content = $content.Replace(
    "const APP_LOG_VERSION = 'web-v1.17'",
    "const APP_LOG_VERSION = 'web-v1.18'"
)

# PDF viewer state
$screenState = "  const [screen, setScreen] = useState('main')"
$pdfState = "  const [pdfViewerData, setPdfViewerData] = useState(null)"

if (-not $content.Contains($pdfState)) {
    if (-not $content.Contains($screenState)) {
        throw "screen state satiri bulunamadi."
    }

    $content = $content.Replace(
        $screenState,
        "$screenState`r`n$pdfState"
    )
}

# Kullanici durumu sifirlanirken PDF viewer kapansin
if (-not $content.Contains("    setPdfViewerData(null)")) {
    $resetFunctionStart = $content.IndexOf("  const resetUserState = () => {")

    if ($resetFunctionStart -lt 0) {
        throw "resetUserState fonksiyonu bulunamadi."
    }

    $resetFunctionEnd = $content.IndexOf("  }", $resetFunctionStart)

    if ($resetFunctionEnd -lt 0) {
        throw "resetUserState fonksiyonunun sonu bulunamadi."
    }

    $resetBlock = $content.Substring(
        $resetFunctionStart,
        $resetFunctionEnd - $resetFunctionStart
    )

    $screenReset = "    setScreen('main')"

    if (-not $resetBlock.Contains($screenReset)) {
        throw "resetUserState icinde setScreen bulunamadi."
    }

    $newResetBlock = $resetBlock.Replace(
        $screenReset,
        "$screenReset`r`n    setPdfViewerData(null)"
    )

    $content =
        $content.Substring(0, $resetFunctionStart) +
        $newResetBlock +
        $content.Substring($resetFunctionEnd)
}

# Yeni openReport fonksiyonu
$newOpenReport = @'
  const openReport = async (report) => {
    const cleanBarcode = barcode.trim()
    const reportName = getReportName(report)
    const requiresBarcode = report.requiresBarcode !== false

    if (requiresBarcode && !cleanBarcode) {
      setMessage(t.barcodeRequired)
      return
    }

    if (cleanBarcode) {
      saveBarcodeToHistory(cleanBarcode)
    }

    stopScanner()
    setLoading(true)
    setSelectedReportCode(report.code)
    setMessage(`${reportName} ${t.reportPreparing}`)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id

      if (!userId) {
        setMessage(t.sessionMissing)
        setUserProfile(null)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/report-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          barcode: requiresBarcode ? cleanBarcode : '',
          reportCode: report.code,
          requiresBarcode,
        }),
      })

      const responseText = await response.text()
      let result = {}

      try {
        result = JSON.parse(responseText)
      } catch (err) {
        result = {
          error: responseText || 'Unknown error',
        }
      }

      if (!response.ok) {
        setMessage(
          t.reportUrlFailed +
          (result.error || 'Unknown error') +
          ` (${report.code}${cleanBarcode ? ' - ' + cleanBarcode : ''})`
        )

        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const pdfUrl = result.pdfUrl

      if (!pdfUrl) {
        setMessage(
          `${t.pdfUrlEmpty} (${report.code}${cleanBarcode ? ' - ' + cleanBarcode : ''})`
        )

        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const { error: logError } = await supabase.from('report_logs').insert({
        user_id: userId,
        barcode: cleanBarcode || 'Barkodsuz',
        report_code: report.code,
        report_name: reportName,
        device_name: getDeviceName(),
        app_version: APP_LOG_VERSION,
      })

      if (logError) {
        setMessage(t.reportLogFailed + logError.message)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const safeReportName = sanitizePdfFileName(reportName)
      const safeBarcode = sanitizePdfFileName(cleanBarcode || 'Barkodsuz')
      const pdfFileName = `${safeReportName}_${safeBarcode}.pdf`

      setPdfViewerData({
        pdfUrl:
          `${makePdfProxyUrl(pdfUrl)}&filename=${encodeURIComponent(pdfFileName)}`,
        fileName: pdfFileName,
        reportName,
      })

      setMessage('')
    } catch (err) {
      const errorText =
        err.name === 'AbortError'
          ? `${t.reportRequestTimeout} (${report.code}${cleanBarcode ? ' - ' + cleanBarcode : ''})`
          : `${t.unexpectedError}${err.message}`

      setMessage(errorText)
    }

    setLoading(false)
    setSelectedReportCode('')
  }


'@

$openReportStartText = "  const openReport = async (report) => {"
$restoreStartText = "  if (restoringSession) {"

$openReportStart = $content.IndexOf($openReportStartText)

if ($openReportStart -lt 0) {
    throw "openReport fonksiyonu bulunamadi."
}

$restoreStart = $content.IndexOf($restoreStartText, $openReportStart)

if ($restoreStart -lt 0) {
    throw "restoringSession bolumu bulunamadi."
}

$content =
    $content.Substring(0, $openReportStart) +
    $newOpenReport +
    $content.Substring($restoreStart)

# Tam ekran PDF viewer ekrani
$pdfViewerReturn = @'
  if (pdfViewerData) {
    return (
      <PdfViewer
        pdfUrl={pdfViewerData.pdfUrl}
        fileName={pdfViewerData.fileName}
        reportName={pdfViewerData.reportName}
        language={language}
        onClose={() => setPdfViewerData(null)}
      />
    )
  }


'@

if (-not $content.Contains("  if (pdfViewerData) {")) {
    $restoreStart = $content.IndexOf($restoreStartText)

    if ($restoreStart -lt 0) {
        throw "PDF viewer ekleme noktasi bulunamadi."
    }

    $content =
        $content.Substring(0, $restoreStart) +
        $pdfViewerReturn +
        $content.Substring($restoreStart)
}

Set-Content -Path $appPath -Value $content -Encoding UTF8

Write-Host ""
Write-Host "App.jsx basariyla guncellendi." -ForegroundColor Green
Write-Host "Yedek dosya: src\App.jsx.backup-before-pdf-viewer" -ForegroundColor Yellow
Write-Host ""