import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import './NativePdfViewer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25
const PAGE_GAP = 14
const MAX_RENDER_DENSITY = 2
const ZOOM_RENDER_DELAY_MS = 180

const TEXTS = {
  tr: {
    close: 'Kapat',
    share: 'Paylaş',
    sharing: 'Paylaşılıyor...',
    loading: 'Rapor hazırlanıyor...',
    loadError: 'Rapor görüntülenemedi.',
    invalidPdf: 'Sunucudan geçerli bir PDF gelmedi.',
    pdfNotReady: 'PDF henüz hazır değil.',
    shareError: 'PDF paylaşılamadı.',
    shareNotSupported:
      'Bu cihaz PDF dosyası paylaşımını desteklemiyor.',
    retry: 'Tekrar Dene',
    page: 'Sayfa',
    fit: 'Sığdır',
    zoomControls: 'PDF yakınlaştırma araçları',
    pageError: 'Bu sayfa görüntülenemedi.',
  },
  en: {
    close: 'Close',
    share: 'Share',
    sharing: 'Sharing...',
    loading: 'Preparing report...',
    loadError: 'Report could not be displayed.',
    invalidPdf: 'The server did not return a valid PDF.',
    pdfNotReady: 'The PDF is not ready yet.',
    shareError: 'The PDF could not be shared.',
    shareNotSupported:
      'This device does not support sharing PDF files.',
    retry: 'Try Again',
    page: 'Page',
    fit: 'Fit',
    zoomControls: 'PDF zoom controls',
    pageError: 'This page could not be displayed.',
  },
  ar: {
    close: 'إغلاق',
    share: 'مشاركة',
    sharing: 'جارٍ المشاركة...',
    loading: 'جارٍ تحضير التقرير...',
    loadError: 'تعذر عرض التقرير.',
    invalidPdf: 'لم يرسل الخادم ملف PDF صالحًا.',
    pdfNotReady: 'ملف PDF غير جاهز بعد.',
    shareError: 'تعذرت مشاركة ملف PDF.',
    shareNotSupported:
      'هذا الجهاز لا يدعم مشاركة ملفات PDF.',
    retry: 'حاول مرة أخرى',
    page: 'صفحة',
    fit: 'ملاءمة',
    zoomControls: 'أدوات تكبير PDF',
    pageError: 'تعذر عرض هذه الصفحة.',
  },
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function sanitizeFileName(value) {
  return (
    String(value || 'rapor.pdf')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'rapor.pdf'
  )
}

function getFittedPageSize(pageSize, viewportSize, zoom) {
  const availableWidth = Math.max(1, viewportSize.width - 4)
  const availableHeight = Math.max(1, viewportSize.height - 4)
  const fitScale = Math.min(
    availableWidth / pageSize.width,
    availableHeight / pageSize.height
  )

  return {
    width: Math.max(1, Math.floor(pageSize.width * fitScale * zoom)),
    height: Math.max(1, Math.floor(pageSize.height * fitScale * zoom)),
  }
}

function PdfPage({
  devicePixelRatio,
  pageNumber,
  pageSize,
  shouldRender,
  texts,
  viewportSize,
  renderZoom,
  zoom,
}) {
  const fittedSize = getFittedPageSize(pageSize, viewportSize, zoom)
  const renderSize = getFittedPageSize(
    pageSize,
    viewportSize,
    renderZoom
  )

  return (
    <section
      className="nativePdfPageShell"
      data-page-number={pageNumber}
      style={{
        width: `${fittedSize.width}px`,
        height: `${fittedSize.height}px`,
      }}
      aria-label={`${texts.page} ${pageNumber}`}
    >
      {shouldRender ? (
        <Page
          pageNumber={pageNumber}
          width={renderSize.width}
          devicePixelRatio={devicePixelRatio}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          loading={
            <span
              className="nativePdfPageSpinner"
              aria-label={`${texts.page} ${pageNumber}`}
            />
          }
          error={
            <span className="nativePdfPageError">
              {texts.pageError}
            </span>
          }
        />
      ) : null}
    </section>
  )
}

function NativePdfViewer({
  pdfUrl,
  fileName,
  reportName,
  reportMeta,
  accessToken,
  deviceToken,
  language = 'tr',
  onClose,
}) {
  const containerRef = useRef(null)
  const pagesRef = useRef(null)
  const pdfDocumentRef = useRef(null)
  const pdfBlobRef = useRef(null)
  const abortControllerRef = useRef(null)
  const pinchRef = useRef({
    active: false,
    startDistance: 0,
    startZoom: 1,
    targetZoom: 1,
    centerX: 0,
    centerY: 0,
    contentX: 0,
    contentY: 0,
  })

  const [pdfBlob, setPdfBlob] = useState(null)
  const [containerElement, setContainerElement] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  const [zoom, setZoom] = useState(1)
  const [renderZoom, setRenderZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState('')
  const [shareError, setShareError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)

  const isArabic = language === 'ar'
  const t = TEXTS[language] || TEXTS.tr
  const numPages = pageSizes.length
  const finalFileName = sanitizeFileName(
    fileName?.toLowerCase().endsWith('.pdf')
      ? fileName
      : `${fileName || reportName || 'rapor'}.pdf`
  )
  const devicePixelRatio = Math.min(
    Math.max(1, window.devicePixelRatio || 1),
    Math.max(1, MAX_RENDER_DENSITY / renderZoom)
  )

  const handleContainerRef = useCallback((node) => {
    containerRef.current = node
    setContainerElement(node)
  }, [])

  useEffect(() => {
    const renderTimer = window.setTimeout(() => {
      setRenderZoom(zoom)
    }, ZOOM_RENDER_DELAY_MS)

    return () => window.clearTimeout(renderTimer)
  }, [zoom])

  useEffect(() => {
    const previousDocumentOverflow =
      document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow =
        previousDocumentOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current

    if (!container || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const updateSize = (entry = null) => {
      const contentRect = entry?.contentRect

      setViewportSize({
        width:
          contentRect?.width ??
          Math.max(1, container.clientWidth - 24),
        height:
          contentRect?.height ??
          Math.max(1, container.clientHeight - 96),
      })
    }

    const observer = new ResizeObserver((entries) => {
      updateSize(entries[0])
    })
    observer.observe(container)
    updateSize()

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    const abortController = new AbortController()

    abortControllerRef.current?.abort()
    abortControllerRef.current = abortController
    pdfBlobRef.current = null
    setPdfBlob(null)
    setPageSizes([])
    setZoom(1)
    setRenderZoom(1)
    setCurrentPage(1)
    setError('')
    setShareError('')

    const loadPdf = async () => {
      try {
        const response = await fetch(pdfUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: abortController.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Device-Token': deviceToken,
          },
        })

        if (!response.ok) {
          throw new Error(`PDF alınamadı. HTTP ${response.status}`)
        }

        const blob = await response.blob()

        if (!blob.type.includes('pdf')) {
          throw new Error(t.invalidPdf)
        }

        if (!active) {
          return
        }

        pdfBlobRef.current = blob
        setPdfBlob(blob)
      } catch (loadError) {
        if (!active || loadError.name === 'AbortError') {
          return
        }

        setError(loadError.message || t.loadError)
      }
    }

    loadPdf()

    return () => {
      active = false
      abortController.abort()
      pdfBlobRef.current = null
    }
  }, [
    accessToken,
    deviceToken,
    loadVersion,
    pdfUrl,
    t.invalidPdf,
    t.loadError,
  ])

  const handleDocumentLoad = useCallback(async (pdf) => {
    try {
      const sizes = await Promise.all(
        Array.from({ length: pdf.numPages }, async (_, index) => {
          const page = await pdf.getPage(index + 1)
          const viewport = page.getViewport({ scale: 1 })

          return {
            width: viewport.width,
            height: viewport.height,
          }
        })
      )

      pdfDocumentRef.current = pdf
      setPageSizes(sizes)
    } catch (documentError) {
      setError(documentError.message || t.loadError)
    }
  }, [t.loadError])

  const handleDocumentError = useCallback((documentError) => {
    setError(documentError.message || t.loadError)
  }, [t.loadError])

  const handlePageScroll = useCallback(() => {
    const container = containerRef.current
    const pages = pagesRef.current

    if (!container || !pages) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const viewportCenter =
      containerRect.top + container.clientHeight / 2
    let closestPage = 1
    let closestDistance = Number.POSITIVE_INFINITY

    if (
      numPages > 0 &&
      container.scrollTop >=
        container.scrollHeight - container.clientHeight - 4
    ) {
      setCurrentPage(numPages)
      return
    }

    pages
      .querySelectorAll('.nativePdfPageShell')
      .forEach((pageElement) => {
        const pageRect = pageElement.getBoundingClientRect()
        const pageCenter = pageRect.top + pageRect.height / 2
        const distance = Math.abs(pageCenter - viewportCenter)

        if (distance < closestDistance) {
          closestDistance = distance
          closestPage =
            Number(pageElement.dataset.pageNumber) || 1
        }
      })

    setCurrentPage((value) =>
      value === closestPage ? value : closestPage
    )
  }, [numPages])

  useEffect(() => {
    const frame = requestAnimationFrame(handlePageScroll)
    return () => cancelAnimationFrame(frame)
  }, [handlePageScroll, pageSizes, viewportSize, zoom])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return undefined
    }

    container.addEventListener('scroll', handlePageScroll, {
      passive: true,
    })
    const trackingTimer = window.setInterval(
      handlePageScroll,
      400
    )

    return () => {
      container.removeEventListener('scroll', handlePageScroll)
      window.clearInterval(trackingTimer)
    }
  }, [containerElement, handlePageScroll])

  const applyZoom = useCallback((nextZoom, anchor = null) => {
    const container = containerRef.current
    const currentZoom = zoom
    const targetZoom = clampZoom(nextZoom)

    if (!container || targetZoom === currentZoom) {
      return
    }

    const centerX = anchor?.centerX ?? container.clientWidth / 2
    const centerY = anchor?.centerY ?? container.clientHeight / 2
    const contentX =
      anchor?.contentX ?? container.scrollLeft + centerX
    const contentY =
      anchor?.contentY ?? container.scrollTop + centerY
    const scaleRatio = targetZoom / currentZoom

    setZoom(targetZoom)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(
          0,
          contentX * scaleRatio - centerX
        )
        container.scrollTop = Math.max(
          0,
          contentY * scaleRatio - centerY
        )
        handlePageScroll()
      })
    })
  }, [handlePageScroll, zoom])

  useEffect(() => {
    const container = containerRef.current
    const pages = pagesRef.current

    if (!container || !pages) {
      return undefined
    }

    const getDistance = (touches) => {
      return Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY
      )
    }

    const getCenter = (touches) => {
      const rect = container.getBoundingClientRect()

      return {
        x:
          (touches[0].clientX + touches[1].clientX) / 2 -
          rect.left,
        y:
          (touches[0].clientY + touches[1].clientY) / 2 -
          rect.top,
      }
    }

    const handleTouchStart = (event) => {
      if (event.touches.length !== 2) {
        return
      }

      const center = getCenter(event.touches)

      pinchRef.current = {
        active: true,
        startDistance: getDistance(event.touches),
        startZoom: zoom,
        targetZoom: zoom,
        centerX: center.x,
        centerY: center.y,
        contentX: container.scrollLeft + center.x,
        contentY: container.scrollTop + center.y,
      }
    }

    const handleTouchMove = (event) => {
      const pinch = pinchRef.current

      if (!pinch.active || event.touches.length !== 2) {
        return
      }

      event.preventDefault()

      const nextZoom = clampZoom(
        pinch.startZoom *
          (getDistance(event.touches) / pinch.startDistance)
      )

      pinch.targetZoom = nextZoom

      if (pagesRef.current) {
        const previewScale = nextZoom / pinch.startZoom
        pagesRef.current.style.transform =
          `scale(${previewScale})`
        pagesRef.current.style.transformOrigin =
          `${pinch.contentX}px ${pinch.contentY}px`
      }
    }

    const handleTouchEnd = () => {
      const pinch = pinchRef.current

      if (!pinch.active) {
        return
      }

      if (pagesRef.current) {
        pagesRef.current.style.transform = ''
        pagesRef.current.style.transformOrigin = ''
      }

      pinch.active = false
      applyZoom(pinch.targetZoom, {
        centerX: pinch.centerX,
        centerY: pinch.centerY,
        contentX: pinch.contentX,
        contentY: pinch.contentY,
      })
    }

    container.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    })
    container.addEventListener('touchmove', handleTouchMove, {
      passive: false,
    })
    container.addEventListener('touchend', handleTouchEnd, {
      passive: true,
    })
    container.addEventListener('touchcancel', handleTouchEnd, {
      passive: true,
    })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [applyZoom, containerElement, numPages, zoom])

  const handleClose = () => {
    abortControllerRef.current?.abort()
    pdfDocumentRef.current?.destroy?.()
    pdfDocumentRef.current = null
    pdfBlobRef.current = null

    if (typeof onClose === 'function') {
      onClose()
    }
  }

  const retry = () => {
    setLoadVersion((value) => value + 1)
  }

  const sharePdf = async () => {
    setShareError('')

    const blob = pdfBlobRef.current

    if (!blob) {
      setShareError(t.pdfNotReady)
      return
    }

    if (
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function'
    ) {
      setShareError(t.shareNotSupported)
      return
    }

    const file = new File([blob], finalFileName, {
      type: 'application/pdf',
    })

    if (!navigator.canShare({ files: [file] })) {
      setShareError(t.shareNotSupported)
      return
    }

    setSharing(true)

    try {
      await navigator.share({
        files: [file],
        title: reportName || finalFileName,
      })
    } catch (shareFailure) {
      if (shareFailure?.name !== 'AbortError') {
        console.error('PDF paylaşım hatası:', shareFailure)
        setShareError(t.shareError)
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div
      className="nativePdfOverlay"
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <header className="nativePdfHeader">
        <button
          type="button"
          className="nativePdfCloseButton"
          onClick={handleClose}
        >
          {t.close}
        </button>

        <div className="nativePdfTitle">
          <strong>{reportName}</strong>
          {reportMeta ? <span>{reportMeta}</span> : null}
          {numPages > 0 ? (
            <span>
              {t.page} {currentPage} / {numPages}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className="nativePdfShareButton"
          onClick={sharePdf}
          disabled={!pdfBlob || sharing}
          aria-label={sharing ? t.sharing : t.share}
        >
          {sharing ? t.sharing : t.share}
        </button>
      </header>

      <main
        ref={handleContainerRef}
        className="nativePdfContent"
        tabIndex={0}
        aria-label={reportName || 'PDF'}
      >
        {shareError ? (
          <div className="nativePdfActionMessage" role="alert">
            <span>{shareError}</span>
            <button
              type="button"
              onClick={() => setShareError('')}
              aria-label={t.close}
            >
              ×
            </button>
          </div>
        ) : null}

        {pdfBlob && !error ? (
          <Document
            file={pdfBlob}
            onLoadSuccess={handleDocumentLoad}
            onLoadError={handleDocumentError}
            loading={null}
            error={null}
          >
            <div
              ref={pagesRef}
              className="nativePdfDocument"
              style={{ gap: `${PAGE_GAP}px` }}
            >
              {pageSizes.map((pageSize, index) => (
                <PdfPage
                  key={index + 1}
                  devicePixelRatio={devicePixelRatio}
                  pageNumber={index + 1}
                  pageSize={pageSize}
                  renderZoom={renderZoom}
                  shouldRender={
                    Math.abs(index + 1 - currentPage) <=
                    (zoom <= 1.25 ? 2 : 1)
                  }
                  texts={t}
                  viewportSize={viewportSize}
                  zoom={zoom}
                />
              ))}
            </div>
          </Document>
        ) : null}

        {(!pdfBlob || pageSizes.length === 0) && !error ? (
          <div
            className="nativePdfStatus"
            role="status"
            aria-live="polite"
          >
            <span className="nativePdfSpinner" />
            <strong>{t.loading}</strong>
          </div>
        ) : null}

        {error ? (
          <div className="nativePdfStatus nativePdfError" role="alert">
            <strong>{t.loadError}</strong>
            <span>{error}</span>
            <button type="button" onClick={retry}>
              {t.retry}
            </button>
          </div>
        ) : null}

        {numPages > 0 ? (
          <div
            className="nativePdfZoomControls"
            aria-label={t.zoomControls}
          >
            <button
              type="button"
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="nativePdfFitButton"
              onClick={() => applyZoom(1)}
            >
              {t.fit}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default NativePdfViewer
