import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

function sanitizeFileName(value) {
  return String(value || 'rapor.pdf')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'rapor.pdf'
}

function PdfViewer({
  pdfUrl,
  fileName,
  reportName,
  language = 'tr',
  onClose,
}) {
  const containerRef = useRef(null)
  const renderIdRef = useRef(0)
  const pdfDocumentRef = useRef(null)
  const pdfBlobRef = useRef(null)

  const [zoom, setZoom] = useState(1)
  const [fitVersion, setFitVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const isArabic = language === 'ar'

  const texts = {
    tr: {
      close: 'Kapat',
      share: 'Paylaş',
      sharing: 'Paylaşılıyor...',
      download: 'İndir',
      downloading: 'İndiriliyor...',
      fit: 'Sığdır',
      loading: 'Rapor hazırlanıyor...',
      loadError: 'Rapor görüntülenemedi.',
      shareError: 'PDF paylaşılamadı.',
      downloadError: 'PDF indirilemedi.',
      page: 'Sayfa',
      zoomOut: 'Uzaklaştır',
      zoomIn: 'Yakınlaştır',
    },
    en: {
      close: 'Close',
      share: 'Share',
      sharing: 'Sharing...',
      download: 'Download',
      downloading: 'Downloading...',
      fit: 'Fit',
      loading: 'Preparing report...',
      loadError: 'Report could not be displayed.',
      shareError: 'PDF could not be shared.',
      downloadError: 'PDF could not be downloaded.',
      page: 'Page',
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
    },
    ar: {
      close: 'إغلاق',
      share: 'مشاركة',
      sharing: 'جارٍ المشاركة...',
      download: 'تنزيل',
      downloading: 'جارٍ التنزيل...',
      fit: 'ملاءمة',
      loading: 'جارٍ تجهيز التقرير...',
      loadError: 'تعذر عرض التقرير.',
      shareError: 'تعذرت مشاركة ملف PDF.',
      downloadError: 'تعذر تنزيل ملف PDF.',
      page: 'صفحة',
      zoomOut: 'تصغير',
      zoomIn: 'تكبير',
    },
  }

  const t = texts[language] || texts.tr

  const finalFileName = sanitizeFileName(
    fileName?.toLowerCase().endsWith('.pdf')
      ? fileName
      : `${fileName || reportName || 'rapor'}.pdf`
  )

  const loadPdfBlob = useCallback(async () => {
    if (pdfBlobRef.current) {
      return pdfBlobRef.current
    }

    const response = await fetch(pdfUrl, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`PDF alınamadı. HTTP ${response.status}`)
    }

    const blob = await response.blob()

    if (!blob.type.includes('pdf')) {
      throw new Error('Sunucudan geçerli bir PDF gelmedi.')
    }

    pdfBlobRef.current = blob
    return blob
  }, [pdfUrl])

  const renderPdf = useCallback(async () => {
    const currentRenderId = renderIdRef.current + 1
    renderIdRef.current = currentRenderId

    setLoading(true)
    setError('')

    try {
      const blob = await loadPdfBlob()
      const arrayBuffer = await blob.arrayBuffer()

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        disableAutoFetch: false,
        disableStream: false,
      })

      const pdfDocument = await loadingTask.promise

      if (currentRenderId !== renderIdRef.current) {
        await pdfDocument.destroy()
        return
      }

      if (pdfDocumentRef.current) {
        try {
          await pdfDocumentRef.current.destroy()
        } catch (destroyError) {
          console.log('Eski PDF kapatma hatası:', destroyError)
        }
      }

      pdfDocumentRef.current = pdfDocument
      setPageCount(pdfDocument.numPages)
      setCurrentPage(1)

      const container = containerRef.current

      if (!container) {
        throw new Error('PDF görüntüleme alanı bulunamadı.')
      }

      container.innerHTML = ''

      const availableWidth = Math.max(container.clientWidth - 24, 280)
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2)

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        if (currentRenderId !== renderIdRef.current) {
          return
        }

        const page = await pdfDocument.getPage(pageNumber)
        const originalViewport = page.getViewport({ scale: 1 })

        const fitScale = availableWidth / originalViewport.width
        const finalScale = fitScale * zoom
        const viewport = page.getViewport({ scale: finalScale })

        const pageWrapper = document.createElement('section')
        pageWrapper.className = 'pdfViewerPage'
        pageWrapper.dataset.pageNumber = String(pageNumber)

        const pageLabel = document.createElement('div')
        pageLabel.className = 'pdfViewerPageLabel'
        pageLabel.textContent = `${t.page} ${pageNumber} / ${pdfDocument.numPages}`

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', {
          alpha: false,
          willReadFrequently: false,
        })

        canvas.width = Math.floor(viewport.width * devicePixelRatio)
        canvas.height = Math.floor(viewport.height * devicePixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        pageWrapper.appendChild(pageLabel)
        pageWrapper.appendChild(canvas)
        container.appendChild(pageWrapper)

        await page.render({
          canvasContext: context,
          viewport,
          transform:
            devicePixelRatio === 1
              ? null
              : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
          background: '#ffffff',
        }).promise
      }

      if (currentRenderId === renderIdRef.current) {
        setLoading(false)
      }
    } catch (renderError) {
      console.error('PDF render hatası:', renderError)

      if (currentRenderId === renderIdRef.current) {
        setError(`${t.loadError} ${renderError.message || ''}`.trim())
        setLoading(false)
      }
    }
  }, [fitVersion, loadPdfBlob, t.loadError, t.page, zoom])

  useEffect(() => {
    renderPdf()

    return () => {
      renderIdRef.current += 1

      if (pdfDocumentRef.current) {
        pdfDocumentRef.current.destroy().catch(() => {})
        pdfDocumentRef.current = null
      }
    }
  }, [renderPdf])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return undefined
    }

    const updateCurrentPage = () => {
      const pages = Array.from(
        container.querySelectorAll('.pdfViewerPage')
      )

      if (pages.length === 0) {
        return
      }

      const toolbarHeight = 90
      let closestPage = 1
      let closestDistance = Number.POSITIVE_INFINITY

      pages.forEach((pageElement) => {
        const rect = pageElement.getBoundingClientRect()
        const distance = Math.abs(rect.top - toolbarHeight)

        if (distance < closestDistance) {
          closestDistance = distance
          closestPage = Number(pageElement.dataset.pageNumber || 1)
        }
      })

      setCurrentPage(closestPage)
    }

    container.addEventListener('scroll', updateCurrentPage, {
      passive: true,
    })

    return () => {
      container.removeEventListener('scroll', updateCurrentPage)
    }
  }, [pageCount])

  useEffect(() => {
    let resizeTimer

    const handleResize = () => {
      clearTimeout(resizeTimer)

      resizeTimer = setTimeout(() => {
        setFitVersion((value) => value + 1)
      }, 250)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  const zoomIn = () => {
    setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
  }

  const zoomOut = () => {
    setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
  }

  const fitToScreen = () => {
    setZoom(1)
    setFitVersion((value) => value + 1)
  }

  const sharePdf = async () => {
    setSharing(true)
    setError('')

    try {
      const blob = await loadPdfBlob()
      const file = new File([blob], finalFileName, {
        type: 'application/pdf',
      })

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: reportName || finalFileName,
          text: reportName || finalFileName,
          files: [file],
        })
      } else if (navigator.share) {
        await navigator.share({
          title: reportName || finalFileName,
          text: reportName || finalFileName,
          url: pdfUrl,
        })
      } else {
        throw new Error('Bu cihaz dosya paylaşımını desteklemiyor.')
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        setError(`${t.shareError} ${shareError.message || ''}`.trim())
      }
    }

    setSharing(false)
  }

  const downloadPdf = async () => {
    setDownloading(true)
    setError('')

    try {
      const blob = await loadPdfBlob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')

      anchor.href = objectUrl
      anchor.download = finalFileName
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()

      setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
      }, 1500)
    } catch (downloadError) {
      setError(`${t.downloadError} ${downloadError.message || ''}`.trim())
    }

    setDownloading(false)
  }

  return (
    <div
      className="pdfViewerOverlay"
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <header className="pdfViewerToolbar">
        <div className="pdfViewerToolbarTop">
          <button
            type="button"
            className="pdfViewerCloseButton"
            onClick={onClose}
          >
            {t.close}
          </button>

          <div className="pdfViewerTitleArea">
            <strong>{reportName || finalFileName}</strong>

            {pageCount > 0 && (
              <span>
                {t.page} {currentPage} / {pageCount}
              </span>
            )}
          </div>

          <button
            type="button"
            className="pdfViewerShareButton"
            onClick={sharePdf}
            disabled={sharing || loading}
          >
            {sharing ? t.sharing : t.share}
          </button>
        </div>

        <div className="pdfViewerToolbarBottom">
          <button
            type="button"
            className="pdfViewerToolButton"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM || loading}
            aria-label={t.zoomOut}
          >
            −
          </button>

          <button
            type="button"
            className="pdfViewerFitButton"
            onClick={fitToScreen}
            disabled={loading}
          >
            {t.fit}
          </button>

          <span className="pdfViewerZoomValue">
            %{Math.round(zoom * 100)}
          </span>

          <button
            type="button"
            className="pdfViewerToolButton"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM || loading}
            aria-label={t.zoomIn}
          >
            +
          </button>

          <button
            type="button"
            className="pdfViewerDownloadButton"
            onClick={downloadPdf}
            disabled={downloading || loading}
          >
            {downloading ? t.downloading : t.download}
          </button>
        </div>
      </header>

      {loading && (
        <div className="pdfViewerLoading">
          <div className="pdfViewerSpinner" />
          <strong>{t.loading}</strong>
        </div>
      )}

      {error && (
        <div className="pdfViewerError">
          {error}
        </div>
      )}

      <main
        ref={containerRef}
        className={`pdfViewerContent ${loading ? 'pdfViewerContentHidden' : ''}`}
      />
    </div>
  )
}

export default PdfViewer