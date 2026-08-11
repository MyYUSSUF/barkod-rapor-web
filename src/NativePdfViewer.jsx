import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Document, Page, pdfjs } from 'react-pdf'
import PdfDetailLayer from './PdfDetailLayer'
import {
  MAX_PDF_ZOOM,
  MIN_PDF_ZOOM,
  getPdfShareCachePath,
  isPdfShareCancellation,
  normalizePdfZoom,
  removeStaleCachedPdfFiles,
} from './lib/pdfViewerUtils'
import './NativePdfViewer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const ZOOM_STEP = 0.25
const PAGE_GAP = 14
const PAGE_RENDER_SCALE = 3
// Görünen sayfa ile iki komşusu hazır tutulur, uzak canvas'lar kaldırılır.
const PAGE_RENDER_RADIUS = 1
const PAGE_METADATA_CONCURRENCY = 4
const DETAIL_RENDER_DELAY_MS = 220
const DETAIL_RENDER_RETRY_MS = 140
// Mobil WebView belleğini korumak için detay katmanı ekran boyutunda tutulur.
const MAX_DETAIL_CANVAS_PIXELS = 5242880
const MAX_DETAIL_CANVAS_EDGE = 4096
const MAX_DETAIL_OVERSCAN_RATIO = 0.2

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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(reader.error)
    reader.onloadend = () => {
      const result = String(reader.result || '')
      const [, base64 = result] = result.split(',')
      resolve(base64)
    }

    reader.readAsDataURL(blob)
  })
}

function openBlobFallback(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 30000)
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

function releaseCanvas(canvas) {
  if (!canvas) {
    return
  }

  canvas.style.visibility = 'hidden'
  canvas.width = 0
  canvas.height = 0
}

async function loadPageSizes(pdf) {
  const sizes = new Array(pdf.numPages)
  let nextPageIndex = 0
  const workerCount = Math.min(
    PAGE_METADATA_CONCURRENCY,
    pdf.numPages
  )

  const loadNextPage = async () => {
    while (nextPageIndex < pdf.numPages) {
      const pageIndex = nextPageIndex
      nextPageIndex += 1

      const page = await pdf.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: 1 })

      sizes[pageIndex] = {
        page,
        width: viewport.width,
        height: viewport.height,
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, loadNextPage)
  )

  return sizes
}

function findClosestPageElement(pages, clientY, preferredPage) {
  const pageCount = pages.children.length
  const preferredIndex = Math.min(
    pageCount - 1,
    Math.max(0, preferredPage - 1)
  )
  const candidateIndexes = [
    preferredIndex - 1,
    preferredIndex,
    preferredIndex + 1,
  ]
  let closestElement = null
  let closestDistance = Number.POSITIVE_INFINITY

  candidateIndexes.forEach((index) => {
    const pageElement = pages.children.item(index)

    if (!pageElement) {
      return
    }

    const rect = pageElement.getBoundingClientRect()
    const distance =
      clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0

    if (distance < closestDistance) {
      closestDistance = distance
      closestElement = pageElement
    }
  })

  return closestElement
}

function captureZoomAnchor(
  container,
  pages,
  preferredPage,
  centerX,
  centerY
) {
  const containerRect = container.getBoundingClientRect()
  const clientX = containerRect.left + centerX
  const clientY = containerRect.top + centerY
  const pageElement = findClosestPageElement(
    pages,
    clientY,
    preferredPage
  )

  if (!pageElement) {
    return null
  }

  const pageRect = pageElement.getBoundingClientRect()

  return {
    centerX,
    centerY,
    pageNumber:
      Number(pageElement.dataset.pageNumber) || preferredPage,
    xRatio: Math.min(
      1,
      Math.max(0, (clientX - pageRect.left) / pageRect.width)
    ),
    yRatio: Math.min(
      1,
      Math.max(0, (clientY - pageRect.top) / pageRect.height)
    ),
  }
}

function buildDetailRequest({
  container,
  pageNumber,
  pageRecord,
  pages,
  requestId,
  zoom,
}) {
  const pageShell = pages.querySelector(
    `[data-page-number="${pageNumber}"]`
  )
  const pageCanvas = pageShell?.querySelector(
    '.react-pdf__Page__canvas'
  )

  if (
    !pageCanvas ||
    pageCanvas.width <= 0 ||
    window.getComputedStyle(pageCanvas).visibility === 'hidden'
  ) {
    return null
  }

  const pageRect = pageCanvas.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const visibleLeft = Math.max(pageRect.left, containerRect.left)
  const visibleTop = Math.max(pageRect.top, containerRect.top)
  const visibleRight = Math.min(pageRect.right, containerRect.right)
  const visibleBottom = Math.min(
    pageRect.bottom,
    containerRect.bottom
  )
  const visibleWidth = visibleRight - visibleLeft
  const visibleHeight = visibleBottom - visibleTop

  if (visibleWidth < 2 || visibleHeight < 2) {
    return null
  }

  const requestedOutputScale = Math.max(
    1,
    window.devicePixelRatio || 1
  )
  const pixelRoom = Math.sqrt(
    MAX_DETAIL_CANVAS_PIXELS /
      (visibleWidth * visibleHeight * requestedOutputScale ** 2)
  )
  const widthRoom =
    MAX_DETAIL_CANVAS_EDGE /
    (visibleWidth * requestedOutputScale)
  const heightRoom =
    MAX_DETAIL_CANVAS_EDGE /
    (visibleHeight * requestedOutputScale)
  const linearRoom = Math.min(pixelRoom, widthRoom, heightRoom)
  const overscanRatio = Math.min(
    MAX_DETAIL_OVERSCAN_RATIO,
    Math.max(0, (linearRoom - 1) / 2)
  )
  const horizontalOverscan = visibleWidth * overscanRatio
  const verticalOverscan = visibleHeight * overscanRatio
  const left = Math.max(
    0,
    visibleLeft - pageRect.left - horizontalOverscan
  )
  const top = Math.max(
    0,
    visibleTop - pageRect.top - verticalOverscan
  )
  const right = Math.min(
    pageRect.width,
    visibleRight - pageRect.left + horizontalOverscan
  )
  const bottom = Math.min(
    pageRect.height,
    visibleBottom - pageRect.top + verticalOverscan
  )
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const outputScale = Math.max(
    0.25,
    Math.min(
      requestedOutputScale,
      Math.sqrt(MAX_DETAIL_CANVAS_PIXELS / (width * height)),
      MAX_DETAIL_CANVAS_EDGE / width,
      MAX_DETAIL_CANVAS_EDGE / height
    )
  )

  // Yüksek kalite yalnızca ekranda görünen alana çizilir.
  return {
    id: requestId,
    page: pageRecord.page,
    pageNumber,
    zoom,
    left,
    top,
    width,
    height,
    pageWidth: pageRect.width,
    viewportScale: pageRect.width / pageRecord.width,
    outputScale,
  }
}

const PdfPage = memo(function PdfPage({
  detailRequest,
  devicePixelRatio,
  pageNumber,
  pageSize,
  onPageRender,
  shouldKeepDetail,
  shouldRender,
  texts,
  viewportSize,
  zoom,
}) {
  const baseCanvasRef = useRef(null)
  const fittedSize = getFittedPageSize(pageSize, viewportSize, zoom)

  // Ana canvas sabit kalır; netlik ayrı detay katmanında yenilenir.
  const renderSize = getFittedPageSize(
    pageSize,
    viewportSize,
    PAGE_RENDER_SCALE
  )

  const handleCanvasRef = useCallback((canvas) => {
    // React-PDF normal yeniden çizimlerde ref'i kısa süreli null gönderebilir.
    if (!canvas) {
      return
    }

    const previousCanvas = baseCanvasRef.current

    if (previousCanvas && previousCanvas !== canvas) {
      releaseCanvas(previousCanvas)
    }

    baseCanvasRef.current = canvas
  }, [])

  useLayoutEffect(() => {
    return () => {
      releaseCanvas(baseCanvasRef.current)
      baseCanvasRef.current = null
    }
  }, [])

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
          canvasRef={handleCanvasRef}
          pageNumber={pageNumber}
          width={renderSize.width}
          devicePixelRatio={devicePixelRatio}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          onRenderSuccess={() => onPageRender(pageNumber)}
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
      {shouldRender ? (
        <PdfDetailLayer
          detailRequest={detailRequest}
          pageWidth={fittedSize.width}
          shouldKeep={shouldKeepDetail}
        />
      ) : null}
    </section>
  )
})

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
  const scrollFrameRef = useRef(0)
  const pinchFrameRef = useRef(0)
  const pendingZoomRef = useRef(null)
  const detailTimerRef = useRef(0)
  const detailGenerationRef = useRef(0)
  const zoomRef = useRef(1)
  const currentPageRef = useRef(1)
  const pageSizesRef = useRef([])
  const pinchRef = useRef({
    active: false,
    cleanupAfterCommit: false,
    startDistance: 0,
    startZoom: 1,
    targetZoom: 1,
    previewScale: 1,
    centerX: 0,
    centerY: 0,
    previewX: 0,
    previewY: 0,
    zoomAnchor: null,
  })

  const [pdfBlob, setPdfBlob] = useState(null)
  const [containerElement, setContainerElement] = useState(null)
  const [pageSizes, setPageSizes] = useState([])
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [detailPage, setDetailPage] = useState(null)
  const [detailRequest, setDetailRequest] = useState(null)
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
  const devicePixelRatio = 1

  const handleContainerRef = useCallback((node) => {
    containerRef.current = node
    setContainerElement(node)
  }, [])

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
    if (!Capacitor.isNativePlatform()) {
      return
    }

    void removeStaleCachedPdfFiles(Filesystem, {
      directory: Directory.Cache,
    })
  }, [])

  useEffect(() => {
    return () => {
      detailGenerationRef.current += 1

      if (detailTimerRef.current) {
        window.clearTimeout(detailTimerRef.current)
        detailTimerRef.current = 0
      }
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current

    if (!container || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      const styles = window.getComputedStyle(container)
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0)
      const verticalPadding =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0)
      const nextSize = {
        width: Math.max(
          1,
          Math.round(rect.width - horizontalPadding)
        ),
        height: Math.max(
          1,
          Math.round(rect.height - verticalPadding)
        ),
      }

      setViewportSize((currentSize) =>
        currentSize.width === nextSize.width &&
        currentSize.height === nextSize.height
          ? currentSize
          : nextSize
      )
    }

    const observer = new ResizeObserver(() => {
      // Kaydırma çubukları canvas ölçüsünü değiştirip yeniden çizim başlatmasın.
      updateSize()
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
    pdfDocumentRef.current = null
    pdfBlobRef.current = null
    pendingZoomRef.current = null
    detailGenerationRef.current += 1

    if (detailTimerRef.current) {
      window.clearTimeout(detailTimerRef.current)
      detailTimerRef.current = 0
    }

    zoomRef.current = 1
    currentPageRef.current = 1
    pageSizesRef.current = []
    setPdfBlob(null)
    setPageSizes([])
    setZoom(1)
    setCurrentPage(1)
    setDetailPage(null)
    setDetailRequest(null)
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
    pdfDocumentRef.current = pdf

    try {
      const sizes = await loadPageSizes(pdf)

      if (pdfDocumentRef.current !== pdf) {
        return
      }

      pageSizesRef.current = sizes
      setPageSizes(sizes)
    } catch (documentError) {
      if (pdfDocumentRef.current !== pdf) {
        return
      }

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
    const pageElements = pages.children
    let closestPage = currentPageRef.current
    let closestDistance = Number.POSITIVE_INFINITY

    if (
      numPages > 0 &&
      container.scrollTop >=
        container.scrollHeight - container.clientHeight - 4
    ) {
      currentPageRef.current = numPages
      setCurrentPage(numPages)
      return
    }

    let lowerIndex = 0
    let upperIndex = pageElements.length - 1

    while (lowerIndex <= upperIndex) {
      const middleIndex = Math.floor(
        (lowerIndex + upperIndex) / 2
      )
      const pageElement = pageElements.item(middleIndex)
      const pageRect = pageElement.getBoundingClientRect()
      const pageCenter = pageRect.top + pageRect.height / 2
      const distance = Math.abs(pageCenter - viewportCenter)

      if (distance < closestDistance) {
        closestDistance = distance
        closestPage =
          Number(pageElement.dataset.pageNumber) || middleIndex + 1
      }

      if (pageCenter < viewportCenter) {
        lowerIndex = middleIndex + 1
      } else {
        upperIndex = middleIndex - 1
      }
    }

    currentPageRef.current = closestPage
    setCurrentPage((value) =>
      value === closestPage ? value : closestPage
    )
  }, [numPages])

  const schedulePageScroll = useCallback(() => {
    if (scrollFrameRef.current) {
      return
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0
      handlePageScroll()
    })
  }, [handlePageScroll])

  const prepareDetailRender = useCallback((requestId) => {
    const container = containerRef.current
    const pages = pagesRef.current
    const pageNumber = currentPageRef.current
    const pageRecord = pageSizesRef.current[pageNumber - 1]
    const currentZoom = zoomRef.current
    const screenDensity = Math.max(
      1,
      window.devicePixelRatio || 1
    )

    if (!container || !pages || !pageRecord?.page) {
      return false
    }

    if (PAGE_RENDER_SCALE / currentZoom >= screenDensity) {
      setDetailPage(null)
      setDetailRequest(null)
      return true
    }

    const request = buildDetailRequest({
      container,
      pageNumber,
      pageRecord,
      pages,
      requestId,
      zoom: currentZoom,
    })

    if (!request) {
      return false
    }

    setDetailPage(pageNumber)
    setDetailRequest(request)
    return true
  }, [])

  const suspendDetailRender = useCallback(() => {
    detailGenerationRef.current += 1

    if (detailTimerRef.current) {
      window.clearTimeout(detailTimerRef.current)
      detailTimerRef.current = 0
    }

    setDetailRequest((currentRequest) =>
      currentRequest === null ? currentRequest : null
    )
  }, [])

  const scheduleDetailRender = useCallback((delay = DETAIL_RENDER_DELAY_MS) => {
    detailGenerationRef.current += 1
    const requestId = detailGenerationRef.current

    if (detailTimerRef.current) {
      window.clearTimeout(detailTimerRef.current)
    }

    setDetailRequest((currentRequest) =>
      currentRequest === null ? currentRequest : null
    )

    let attempts = 0

    const attemptRender = () => {
      if (detailGenerationRef.current !== requestId) {
        return
      }

      attempts += 1

      if (prepareDetailRender(requestId) || attempts >= 10) {
        detailTimerRef.current = 0
        return
      }

      detailTimerRef.current = window.setTimeout(
        attemptRender,
        DETAIL_RENDER_RETRY_MS
      )
    }

    detailTimerRef.current = window.setTimeout(
      attemptRender,
      delay
    )
  }, [prepareDetailRender])

  const handleBasePageRender = useCallback((pageNumber) => {
    if (pageNumber === currentPageRef.current) {
      scheduleDetailRender(0)
    }
  }, [scheduleDetailRender])

  const handleViewerScroll = useCallback(() => {
    schedulePageScroll()
    scheduleDetailRender()
  }, [scheduleDetailRender, schedulePageScroll])

  useEffect(() => {
    schedulePageScroll()

    if (pageSizes.length > 0) {
      scheduleDetailRender()
    }
  }, [
    currentPage,
    pageSizes,
    scheduleDetailRender,
    schedulePageScroll,
    viewportSize,
    zoom,
  ])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return undefined
    }

    container.addEventListener('scroll', handleViewerScroll, {
      passive: true,
    })

    return () => {
      container.removeEventListener('scroll', handleViewerScroll)

      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current)
        scrollFrameRef.current = 0
      }
    }
  }, [containerElement, handleViewerScroll])

  const applyZoom = useCallback((nextZoom, anchor = null) => {
    const container = containerRef.current
    const pages = pagesRef.current
    const currentZoom = zoom
    const targetZoom = normalizePdfZoom(nextZoom)

    if (!container || !pages || targetZoom === currentZoom) {
      return false
    }

    suspendDetailRender()

    const centerX = anchor?.centerX ?? container.clientWidth / 2
    const centerY = anchor?.centerY ?? container.clientHeight / 2
    const zoomAnchor =
      anchor?.pageNumber
        ? anchor
        : captureZoomAnchor(
            container,
            pages,
            currentPageRef.current,
            centerX,
            centerY
          )

    if (!zoomAnchor) {
      return false
    }

    pendingZoomRef.current = zoomAnchor
    zoomRef.current = targetZoom
    setZoom(targetZoom)

    return true
  }, [suspendDetailRender, zoom])

  const clearPinchPreview = useCallback(() => {
    if (pinchFrameRef.current) {
      cancelAnimationFrame(pinchFrameRef.current)
      pinchFrameRef.current = 0
    }

    if (pagesRef.current) {
      pagesRef.current.style.transform = ''
      pagesRef.current.style.transformOrigin = ''
      pagesRef.current.style.willChange = ''
    }

    pinchRef.current.cleanupAfterCommit = false
  }, [])

  useLayoutEffect(() => {
    const container = containerRef.current
    const pages = pagesRef.current
    const pendingZoom = pendingZoomRef.current

    if (pinchRef.current.cleanupAfterCommit) {
      clearPinchPreview()
    }

    if (container && pages && pendingZoom) {
      const pageElement = pages.children.item(
        pendingZoom.pageNumber - 1
      )

      if (pageElement) {
        const containerRect = container.getBoundingClientRect()
        const pageRect = pageElement.getBoundingClientRect()
        const anchorClientX =
          pageRect.left + pageRect.width * pendingZoom.xRatio
        const anchorClientY =
          pageRect.top + pageRect.height * pendingZoom.yRatio
        const targetClientX =
          containerRect.left + pendingZoom.centerX
        const targetClientY =
          containerRect.top + pendingZoom.centerY

        container.scrollLeft =
          container.scrollLeft + anchorClientX - targetClientX
        container.scrollTop = Math.max(
          0,
          container.scrollTop + anchorClientY - targetClientY
        )
      }

      pendingZoomRef.current = null
      schedulePageScroll()
    }
  }, [clearPinchPreview, schedulePageScroll, zoom])

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
      const startDistance = getDistance(event.touches)

      if (startDistance <= 0) {
        return
      }

      suspendDetailRender()
      clearPinchPreview()
      pages.style.willChange = 'transform'

      const containerRect = container.getBoundingClientRect()
      const pagesRect = pages.getBoundingClientRect()
      const clientX = containerRect.left + center.x
      const clientY = containerRect.top + center.y

      pinchRef.current = {
        active: true,
        cleanupAfterCommit: false,
        startDistance,
        startZoom: zoom,
        targetZoom: zoom,
        previewScale: 1,
        centerX: center.x,
        centerY: center.y,
        previewX: clientX - pagesRect.left,
        previewY: clientY - pagesRect.top,
        zoomAnchor: captureZoomAnchor(
          container,
          pages,
          currentPageRef.current,
          center.x,
          center.y
        ),
      }
    }

    const handleTouchMove = (event) => {
      const pinch = pinchRef.current

      if (!pinch.active || event.touches.length !== 2) {
        return
      }

      event.preventDefault()

      const nextZoom = normalizePdfZoom(
        pinch.startZoom *
          (getDistance(event.touches) / pinch.startDistance)
      )

      pinch.targetZoom = nextZoom
      pinch.previewScale = nextZoom / pinch.startZoom

      if (!pinchFrameRef.current) {
        pinchFrameRef.current = requestAnimationFrame(() => {
          pinchFrameRef.current = 0

          if (!pinchRef.current.active || !pagesRef.current) {
            return
          }

          pagesRef.current.style.transform =
            `scale(${pinchRef.current.previewScale})`
          pagesRef.current.style.transformOrigin =
            `${pinchRef.current.previewX}px ${pinchRef.current.previewY}px`
        })
      }
    }

    const handleTouchEnd = () => {
      const pinch = pinchRef.current

      if (!pinch.active) {
        return
      }

      if (pinchFrameRef.current) {
        cancelAnimationFrame(pinchFrameRef.current)
        pinchFrameRef.current = 0
      }

      pinch.active = false
      pinch.cleanupAfterCommit = true

      if (!pinch.zoomAnchor) {
        clearPinchPreview()
      }

      const zoomApplied = applyZoom(
        pinch.targetZoom,
        pinch.zoomAnchor ?? {
          centerX: pinch.centerX,
          centerY: pinch.centerY,
        }
      )

      if (!zoomApplied) {
        clearPinchPreview()
        scheduleDetailRender()
      }
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

      if (pinchFrameRef.current) {
        cancelAnimationFrame(pinchFrameRef.current)
        pinchFrameRef.current = 0
      }
    }
  }, [
    applyZoom,
    clearPinchPreview,
    containerElement,
    numPages,
    scheduleDetailRender,
    suspendDetailRender,
    zoom,
  ])

  const handleClose = () => {
    suspendDetailRender()
    setDetailPage(null)
    abortControllerRef.current?.abort()
    pdfDocumentRef.current?.destroy?.()
    pdfDocumentRef.current = null
    pdfBlobRef.current = null
    pendingZoomRef.current = null

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

    setSharing(true)

    try {
      if (Capacitor.isNativePlatform()) {
        await removeStaleCachedPdfFiles(Filesystem, {
          directory: Directory.Cache,
        })

        const nativePath = getPdfShareCachePath(finalFileName)
        const data = await blobToBase64(blob)

        await Filesystem.writeFile({
          path: nativePath,
          data,
          directory: Directory.Cache,
          recursive: true,
        })

        const { uri } = await Filesystem.getUri({
          path: nativePath,
          directory: Directory.Cache,
        })

        await Share.share({
          title: reportName || finalFileName,
          text: reportMeta || reportName || finalFileName,
          files: [uri],
          dialogTitle: reportName || finalFileName,
        })

        return
      }

      const file = new File([blob], finalFileName, {
        type: 'application/pdf',
      })

      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: reportName || finalFileName,
        })
        return
      }

      openBlobFallback(blob, finalFileName)
    } catch (shareFailure) {
      if (!isPdfShareCancellation(shareFailure)) {
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
                  detailRequest={
                    detailRequest?.pageNumber === index + 1
                      ? detailRequest
                      : null
                  }
                  devicePixelRatio={devicePixelRatio}
                  onPageRender={handleBasePageRender}
                  pageNumber={index + 1}
                  pageSize={pageSize}
                  shouldKeepDetail={detailPage === index + 1}
                  shouldRender={
                    Math.abs(index + 1 - currentPage) <=
                    PAGE_RENDER_RADIUS
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
              disabled={zoom <= MIN_PDF_ZOOM}
              aria-label="Zoom out"
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_PDF_ZOOM}
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
