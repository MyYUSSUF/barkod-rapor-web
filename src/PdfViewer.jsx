import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const HIGH_QUALITY_DPR_LIMIT = 2
const LOW_QUALITY_DPR_LIMIT = 1.25
const FIRST_PAGE_TIMEOUT_MS = 12000
const OTHER_PAGE_TIMEOUT_MS = 15000

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
        scale: fitScale,
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

      const highQualityDpr = Math.min(
        nativeDpr,
        adaptiveDprLimitRef.current
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
    ]
  )

  const renderPdf = useCallback(async () => {
    const currentRenderId = renderIdRef.current + 1
    renderIdRef.current = currentRenderId

    adaptiveDprLimitRef.current =
      HIGH_QUALITY_DPR_LIMIT

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
          >
            {sharing ? t.sharing : t.share}
          </button>
        </div>
      </header>

      {loading && (
        <div
          className="pdfViewerLoading"
          style={{
            inset: '56px 0 0',
          }}
        >
          <div className="pdfViewerSpinner" />
          <strong>{t.loading}</strong>
        </div>
      )}

      {error && (
        <div
          className="pdfViewerError"
          style={{
            top:
              'calc(66px + env(safe-area-inset-top, 0px))',
          }}
        >
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
