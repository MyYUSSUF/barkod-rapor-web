import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './PdfViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

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

  const [fitVersion, setFitVersion] = useState(0)
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
      page: 'Sayfa',
    },
    en: {
      close: 'Close',
      share: 'Share',
      sharing: 'Sharing...',
      loading: 'Preparing report...',
      loadError: 'Report could not be displayed.',
      shareError: 'PDF could not be shared.',
      page: 'Page',
    },
    ar: {
      close: 'إغلاق',
      share: 'مشاركة',
      sharing: 'جارٍ المشاركة...',
      loading: 'جارٍ تجهيز التقرير...',
      loadError: 'تعذر عرض التقرير.',
      shareError: 'تعذرت مشاركة ملف PDF.',
      page: 'صفحة',
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

      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        if (currentRenderId !== renderIdRef.current) {
          return
        }

        const page = await pdfDocument.getPage(pageNumber)
        const originalViewport = page.getViewport({ scale: 1 })

        const fitScale = availableWidth / originalViewport.width
        const viewport = page.getViewport({ scale: fitScale })

        const pageWrapper = document.createElement('section')
        pageWrapper.className = 'pdfViewerPage'
        pageWrapper.dataset.pageNumber = String(pageNumber)

        const pageLabel = document.createElement('div')
        pageLabel.className = 'pdfViewerPageLabel'
        pageLabel.textContent =
          `${t.page} ${pageNumber} / ${pdfDocument.numPages}`

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
        setError(
          `${t.loadError} ${renderError.message || ''}`.trim()
        )
        setLoading(false)
      }
    }
  }, [
    fitVersion,
    loadPdfBlob,
    t.loadError,
    t.page,
  ])

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

      const toolbarHeight = 64
      let closestPage = 1
      let closestDistance = Number.POSITIVE_INFINITY

      pages.forEach((pageElement) => {
        const rect = pageElement.getBoundingClientRect()
        const distance = Math.abs(rect.top - toolbarHeight)

        if (distance < closestDistance) {
          closestDistance = distance
          closestPage = Number(
            pageElement.dataset.pageNumber || 1
          )
        }
      })

      setCurrentPage(closestPage)
    }

    container.addEventListener('scroll', updateCurrentPage, {
      passive: true,
    })

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
        setFitVersion((value) => value + 1)
      }, 250)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener(
      'orientationchange',
      handleResize
    )

    return () => {
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener(
        'orientationchange',
        handleResize
      )
    }
  }, [])

  const sharePdf = async () => {
    setSharing(true)
    setError('')

    try {
      const blob = await loadPdfBlob()

      const file = new File(
        [blob],
        finalFileName,
        {
          type: 'application/pdf',
        }
      )

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
        throw new Error(
          'Bu cihaz dosya paylaşımını desteklemiyor.'
        )
      }
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') {
        setError(
          `${t.shareError} ${shareError.message || ''}`.trim()
        )
      }
    }

    setSharing(false)
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
            <strong>
              {reportName || finalFileName}
            </strong>

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
      </header>

      {loading && (
        <div
          className="pdfViewerLoading"
          style={{ inset: '56px 0 0' }}
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