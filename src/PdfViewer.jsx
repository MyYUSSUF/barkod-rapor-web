import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const HIGH_QUALITY_DPR_LIMIT = 2
const LOW_QUALITY_DPR_LIMIT = 1.25
const LEGACY_MOBILE_DPR_LIMIT = 1
const FIRST_PAGE_TIMEOUT_MS = 12000
const OTHER_PAGE_TIMEOUT_MS = 15000
const MIN_ZOOM_LEVEL = 1
const MAX_ZOOM_LEVEL = 2
const ZOOM_STEP = 0.25

function clampZoomLevel(value) {
  return Math.min(
    MAX_ZOOM_LEVEL,
    Math.max(MIN_ZOOM_LEVEL, value)
  )
}

function isLikelyLegacyMobileDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
  const iosMatch = userAgent.match(/OS (\d+)[._]/i)
  const iosMajorVersion = iosMatch ? Number(iosMatch[1]) : 0
  const lowMemory =
    typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 3
  const lowCoreCount =
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency <= 4

  return (
    (isIOS && (!iosMajorVersion || iosMajorVersion <= 15)) ||
    (lowMemory && lowCoreCount)
  )
}

function getInitialDprLimit() {
  return isLikelyLegacyMobileDevice()
    ? LEGACY_MOBILE_DPR_LIMIT
    : HIGH_QUALITY_DPR_LIMIT
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

function createTimeoutError() {
  const error = new Error('PDF sayfası hazırlanırken cihaz zaman aşımına uğradı.')
  error.name = 'PdfRenderTimeoutError'
  return error
}

function PdfViewer({
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
  const renderIdRef = useRef(0)
  const pdfDocumentRef = useRef(null)
  const pdfBlobRef = useRef(null)
  const activeRenderTaskRef = useRef(null)
  const adaptiveDprLimitRef = useRef(HIGH_QUALITY_DPR_LIMIT)

  const [renderVersion, setRenderVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoomLevel, setZoomLevel] = useState(1)

  const isArabic = language === 'ar'

  const texts = {
    tr: {
      close: 'Kapat',
      share: 'Paylaş',
      sharing: 'Paylaşılıyor...',
      loading: 'Rapor hazırlanıyor...',
      loadError: 'Rapor görüntülenemedi.',
      shareError: 'PDF paylaşılamadı.',
      shareNotSupported:
        'Bu telefon PDF dosyası paylaşımını desteklemiyor.',
      pdfNotReady:
        'PDF henüz hazır değil. Birkaç saniye sonra tekrar deneyin.',
      page: 'Sayfa',
      pageError: 'Bu sayfa görüntülenemedi.',
      ready: 'PDF hazır',
      reload: 'Yenile',
    },
    en: {
      close: 'Close',
      share: 'Share',
      sharing: 'Sharing...',
      loading: 'Preparing report...',
      loadError: 'Report could not be displayed.',
      shareError: 'PDF could not be shared.',
      shareNotSupported:
        'This phone does not support sharing PDF files.',
      pdfNotReady:
        'The PDF is not ready yet. Try again in a few seconds.',
      page: 'Page',
      pageError: 'This page could not be displayed.',
      ready: 'PDF ready',
      reload: 'Reload',
    },
    ar: {
      close: 'إغلاق',
      share: 'مشاركة',
      sharing: 'جارٍ المشاركة...',
      loading: 'جارٍ تجهيز التقرير...',
      loadError: 'تعذر عرض التقرير.',
      shareError: 'تعذرت مشاركة ملف PDF.',
      shareNotSupported:
        'هذا الهاتف لا يدعم مشاركة ملفات PDF.',
      pdfNotReady:
        'ملف PDF غير جاهز بعد. حاول مرة أخرى بعد لحظات.',
      page: 'صفحة',
      pageError: 'تعذر عرض هذه الصفحة.',
      ready: 'ملف PDF جاهز',
      reload: 'تحديث',
    },
  }

  const t = texts[language] || texts.tr
  const openInBrowserText =
    language === 'tr'
      ? 'Tarayıcıda Aç'
      : language === 'ar'
        ? 'فتح في المتصفح'
        : 'Open in Browser'
  const openInBrowserErrorText =
    language === 'tr'
      ? 'PDF yeni sekmede açılamadı.'
      : language === 'ar'
        ? 'تعذر فتح ملف PDF في علامة تبويب جديدة.'
        : 'The PDF could not be opened in a new tab.'

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
      throw new Error('Sunucudan geçerli bir PDF gelmedi.')
    }

    pdfBlobRef.current = blob
    return blob
  }, [accessToken, deviceToken, pdfUrl])

  const destroyCurrentPdf = useCallback(async () => {
    if (activeRenderTaskRef.current) {
      try {
        activeRenderTaskRef.current.cancel()
      } catch (cancelError) {
        console.log('PDF render iptal hatası:', cancelError)
      }

      activeRenderTaskRef.current = null
    }

    if (!pdfDocumentRef.current) {
      return
    }

    try {
      await pdfDocumentRef.current.destroy()
    } catch (destroyError) {
      console.log('PDF kapatma hatası:', destroyError)
    }

    pdfDocumentRef.current = null
  }, [])

  const renderCanvasWithTimeout = useCallback(
    async ({
      page,
      viewport,
      canvas,
      context,
      devicePixelRatio,
      timeoutMs,
    }) => {
      canvas.width = Math.max(
        1,
        Math.floor(viewport.width * devicePixelRatio)
      )

      canvas.height = Math.max(
        1,
        Math.floor(viewport.height * devicePixelRatio)
      )

      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform:
          devicePixelRatio === 1
            ? null
            : [
                devicePixelRatio,
                0,
                0,
                devicePixelRatio,
                0,
                0,
              ],
        background: '#ffffff',
      })

      activeRenderTaskRef.current = renderTask

      let timeoutId

      const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          try {
            renderTask.cancel()
          } catch (cancelError) {
            console.log('Zaman aşımı render iptal hatası:', cancelError)
          }

          reject(createTimeoutError())
        }, timeoutMs)
      })

      try {
        await Promise.race([
          renderTask.promise,
          timeoutPromise,
        ])
      } finally {
        clearTimeout(timeoutId)

        if (activeRenderTaskRef.current === renderTask) {
          activeRenderTaskRef.current = null
        }
      }
    },
    []
  )

  const renderSinglePage = useCallback(
    async ({
      pdfDocument,
      pageNumber,
      container,
      availableWidth,
      currentRenderId,
    }) => {
      const page = await pdfDocument.getPage(pageNumber)

      if (currentRenderId !== renderIdRef.current) {
        return false
      }

      const originalViewport = page.getViewport({
        scale: 1,
      })

      const fitScale =
        availableWidth / originalViewport.width

      const viewport = page.getViewport({
        scale: fitScale * zoomLevel,
      })

      const pageWrapper =
        document.createElement('section')

      pageWrapper.className = 'pdfViewerPage'
      pageWrapper.dataset.pageNumber = String(pageNumber)

      const pageLabel =
        document.createElement('div')

      pageLabel.className = 'pdfViewerPageLabel'
      pageLabel.textContent =
        `${t.page} ${pageNumber} / ${pdfDocument.numPages}`

      const canvas =
        document.createElement('canvas')

      const context = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: false,
      })

      if (!context) {
        throw new Error(
          'PDF çizim alanı oluşturulamadı.'
        )
      }

      pageWrapper.appendChild(pageLabel)
      pageWrapper.appendChild(canvas)
      container.appendChild(pageWrapper)

      const nativeDpr = window.devicePixelRatio || 1

      const zoomAwareDprLimit =
        zoomLevel > 1
          ? Math.min(adaptiveDprLimitRef.current, LOW_QUALITY_DPR_LIMIT)
          : adaptiveDprLimitRef.current

      const highQualityDpr = Math.min(
        nativeDpr,
        zoomAwareDprLimit
      )

      const timeoutMs =
        pageNumber === 1
          ? FIRST_PAGE_TIMEOUT_MS
          : OTHER_PAGE_TIMEOUT_MS

      try {
        await renderCanvasWithTimeout({
          page,
          viewport,
          canvas,
          context,
          devicePixelRatio: highQualityDpr,
          timeoutMs,
        })

        return true
      } catch (firstRenderError) {
        if (
          currentRenderId !== renderIdRef.current ||
          firstRenderError?.name === 'RenderingCancelledException'
        ) {
          return false
        }

        console.log(
          `Sayfa ${pageNumber} yüksek kalite render başarısız:`,
          firstRenderError
        )

        adaptiveDprLimitRef.current =
          LOW_QUALITY_DPR_LIMIT

        const lowQualityDpr = Math.min(
          nativeDpr,
          LOW_QUALITY_DPR_LIMIT
        )

        canvas.width = 1
        canvas.height = 1

        try {
          await renderCanvasWithTimeout({
            page,
            viewport,
            canvas,
            context,
            devicePixelRatio: lowQualityDpr,
            timeoutMs: OTHER_PAGE_TIMEOUT_MS,
          })

          return true
        } catch (secondRenderError) {
          if (
            currentRenderId !== renderIdRef.current ||
            secondRenderError?.name ===
              'RenderingCancelledException'
          ) {
            return false
          }

          console.error(
            `Sayfa ${pageNumber} hafif render başarısız:`,
            secondRenderError
          )

          pageWrapper.innerHTML = ''

          const failedPageLabel =
            document.createElement('div')

          failedPageLabel.className =
            'pdfViewerPageLabel'

          failedPageLabel.textContent =
            `${t.page} ${pageNumber} / ${pdfDocument.numPages}`

          const failedMessage =
            document.createElement('div')

          failedMessage.style.width =
            `${Math.floor(viewport.width)}px`

          failedMessage.style.minHeight = '180px'
          failedMessage.style.padding = '30px 20px'
          failedMessage.style.background = '#ffffff'
          failedMessage.style.color = '#991b1b'
          failedMessage.style.display = 'flex'
          failedMessage.style.alignItems = 'center'
          failedMessage.style.justifyContent = 'center'
          failedMessage.style.textAlign = 'center'
          failedMessage.style.fontWeight = '700'
          failedMessage.textContent = t.pageError

          pageWrapper.appendChild(failedPageLabel)
          pageWrapper.appendChild(failedMessage)

          return false
        }
      }
    },
    [
      renderCanvasWithTimeout,
      t.page,
      t.pageError,
      zoomLevel,
    ]
  )

  const renderPdf = useCallback(async () => {
    const currentRenderId = renderIdRef.current + 1
    renderIdRef.current = currentRenderId

    adaptiveDprLimitRef.current = getInitialDprLimit()

    setLoading(true)
    setError('')
    setPageCount(0)
    setCurrentPage(1)

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

      await destroyCurrentPdf()

      pdfDocumentRef.current = pdfDocument
      setPageCount(pdfDocument.numPages)

      const container = containerRef.current

      if (!container) {
        throw new Error(
          'PDF görüntüleme alanı bulunamadı.'
        )
      }

      container.innerHTML = ''
      container.scrollTop = 0
      container.scrollLeft = 0

      const availableWidth = Math.max(
        container.clientWidth - 24,
        280
      )

      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        if (currentRenderId !== renderIdRef.current) {
          return
        }

        const pageRendered = await renderSinglePage({
          pdfDocument,
          pageNumber,
          container,
          availableWidth,
          currentRenderId,
        })

        if (currentRenderId !== renderIdRef.current) {
          return
        }

        if (pageNumber === 1) {
          if (!pageRendered) {
            throw new Error(
              'İlk PDF sayfası görüntülenemedi.'
            )
          }

          setLoading(false)
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 25)
        })
      }

      if (currentRenderId === renderIdRef.current) {
        setLoading(false)
      }
    } catch (renderError) {
      console.error('PDF render hatası:', renderError)

      if (currentRenderId === renderIdRef.current) {
        setError(
          `${t.loadError} ${
            renderError.message || ''
          }`.trim()
        )

        setLoading(false)
      }
    }
  }, [
    destroyCurrentPdf,
    loadPdfBlob,
    renderSinglePage,
    renderVersion,
    t.loadError,
  ])

  useEffect(() => {
    renderPdf()

    return () => {
      renderIdRef.current += 1

      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel()
        } catch (cancelError) {
          console.log(
            'PDF render temizleme hatası:',
            cancelError
          )
        }

        activeRenderTaskRef.current = null
      }

      destroyCurrentPdf()
    }
  }, [destroyCurrentPdf, renderPdf])

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

      const toolbarHeight = 64
      let closestPage = 1
      let closestDistance =
        Number.POSITIVE_INFINITY

      pages.forEach((pageElement) => {
        const rect =
          pageElement.getBoundingClientRect()

        const distance = Math.abs(
          rect.top - toolbarHeight
        )

        if (distance < closestDistance) {
          closestDistance = distance

          closestPage = Number(
            pageElement.dataset.pageNumber || 1
          )
        }
      })

      setCurrentPage(closestPage)
    }

    container.addEventListener(
      'scroll',
      updateCurrentPage,
      {
        passive: true,
      }
    )

    return () => {
      container.removeEventListener(
        'scroll',
        updateCurrentPage
      )
    }
  }, [pageCount])

  useEffect(() => {
    let resizeTimer

    const handleResize = () => {
      clearTimeout(resizeTimer)

      resizeTimer = setTimeout(() => {
        setRenderVersion((value) => value + 1)
      }, 350)
    }

    window.addEventListener(
      'orientationchange',
      handleResize
    )

    return () => {
      clearTimeout(resizeTimer)

      window.removeEventListener(
        'orientationchange',
        handleResize
      )
    }
  }, [])

  const sharePdf = () => {
    setError('')

    const blob = pdfBlobRef.current

    if (!blob) {
      setError(t.pdfNotReady)
      return
    }

    if (
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function'
    ) {
      setError(t.shareNotSupported)
      return
    }

    const file = new File(
      [blob],
      finalFileName,
      {
        type: 'application/pdf',
      }
    )

    if (!navigator.canShare({ files: [file] })) {
      setError(t.shareNotSupported)
      return
    }

    setSharing(true)

    navigator
      .share({
        files: [file],
        title: reportName || finalFileName,
      })
      .catch((shareError) => {
        if (shareError?.name !== 'AbortError') {
          console.error(
            'PDF paylaşım hatası:',
            shareError
          )

          setError(
            `${t.shareError} ${
              shareError.message || ''
            }`.trim()
          )
        }
      })
      .finally(() => {
        setSharing(false)
      })
  }

  const reloadPdf = () => {
    setError('')
    setRenderVersion((value) => value + 1)
  }

  const zoomOut = () => {
    setZoomLevel((value) => clampZoomLevel(value - ZOOM_STEP))
  }

  const zoomIn = () => {
    setZoomLevel((value) => clampZoomLevel(value + ZOOM_STEP))
  }

  const openPdfInBrowser = () => {
    setError('')

    const blob = pdfBlobRef.current

    if (!blob) {
      setError(t.pdfNotReady)
      return
    }

    const objectUrl = URL.createObjectURL(blob)
    const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer')

    if (!opened) {
      URL.revokeObjectURL(objectUrl)
      setError(openInBrowserErrorText)
      return
    }

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  }

  const handleClose = async () => {
    renderIdRef.current += 1

    if (activeRenderTaskRef.current) {
      try {
        activeRenderTaskRef.current.cancel()
      } catch (cancelError) {
        console.log(
          'PDF kapatılırken render iptal hatası:',
          cancelError
        )
      }

      activeRenderTaskRef.current = null
    }

    if (containerRef.current) {
      containerRef.current.scrollTop = 0
      containerRef.current.scrollLeft = 0
      containerRef.current.innerHTML = ''
    }

    await destroyCurrentPdf()

    document.documentElement.style.overflow = ''
    document.documentElement.style.height = ''

    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.width = ''
    document.body.style.height = ''

    window.scrollTo(0, 0)

    if (typeof onClose === 'function') {
      onClose()
    }

    requestAnimationFrame(() => {
      window.scrollTo(0, 0)
    })

    setTimeout(() => {
      window.scrollTo(0, 0)
    }, 100)
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
            onClick={handleClose}
            aria-label={t.close}
          >
            {t.close}
          </button>

          <div className="pdfViewerTitleArea">
            <strong>
              {reportName || finalFileName}
            </strong>

            {reportMeta && (
              <span className="pdfViewerMeta">
                {reportMeta}
              </span>
            )}

            {pageCount > 0 && (
              <span className="pdfViewerPageStatus">
                {t.page} {currentPage} / {pageCount}
              </span>
            )}
          </div>

          <button
            type="button"
            className="pdfViewerShareButton"
            onClick={sharePdf}
            disabled={sharing || loading}
            aria-label={t.share}
          >
            {sharing ? t.sharing : t.share}
          </button>
        </div>

        <div className="pdfViewerToolbarBottom" aria-label="PDF actions">
          <button
            type="button"
            className="pdfViewerToolButton"
            onClick={zoomOut}
            disabled={loading || zoomLevel <= MIN_ZOOM_LEVEL}
            aria-label="Zoom out"
          >
            -
          </button>

          <span className="pdfViewerZoomValue">
            {Math.round(zoomLevel * 100)}%
          </span>

          <button
            type="button"
            className="pdfViewerToolButton"
            onClick={zoomIn}
            disabled={loading || zoomLevel >= MAX_ZOOM_LEVEL}
            aria-label="Zoom in"
          >
            +
          </button>

          <button
            type="button"
            className="pdfViewerActionButton"
            onClick={reloadPdf}
            disabled={loading}
          >
            {t.reload}
          </button>

          <button
            type="button"
            className="pdfViewerActionButton pdfViewerBrowserButton"
            onClick={openPdfInBrowser}
          >
            {openInBrowserText}
          </button>

          {pageCount > 0 && !loading && (
            <span className="pdfViewerReadyBadge" role="status">
              {t.ready}
            </span>
          )}
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
        className={
          `pdfViewerContent ${
            loading
              ? 'pdfViewerContentHidden'
              : ''
          }`
        }
      />
    </div>
  )
}

export default PdfViewer
