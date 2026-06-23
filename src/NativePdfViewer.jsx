import { useCallback, useEffect, useRef, useState } from 'react'
import './NativePdfViewer.css'

const TEXTS = {
  tr: {
    close: 'Kapat',
    loading: 'Rapor hazırlanıyor...',
    loadError: 'Rapor görüntülenemedi.',
    invalidPdf: 'Sunucudan geçerli bir PDF gelmedi.',
    retry: 'Tekrar Dene',
    viewerTitle: 'Sevkiyat raporu PDF görüntüleyici',
  },
  en: {
    close: 'Close',
    loading: 'Preparing report...',
    loadError: 'Report could not be displayed.',
    invalidPdf: 'The server did not return a valid PDF.',
    retry: 'Try Again',
    viewerTitle: 'Shipment report PDF viewer',
  },
  ar: {
    close: 'إغلاق',
    loading: 'جارٍ تحضير التقرير...',
    loadError: 'تعذر عرض التقرير.',
    invalidPdf: 'لم يرسل الخادم ملف PDF صالحًا.',
    retry: 'حاول مرة أخرى',
    viewerTitle: 'عارض تقرير الشحن PDF',
  },
}

function NativePdfViewer({
  pdfUrl,
  reportName,
  reportMeta,
  accessToken,
  deviceToken,
  language = 'tr',
  onClose,
}) {
  const objectUrlRef = useRef('')
  const abortControllerRef = useRef(null)
  const [objectUrl, setObjectUrl] = useState('')
  const [error, setError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)

  const isArabic = language === 'ar'
  const t = TEXTS[language] || TEXTS.tr

  const clearObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) {
      return
    }

    URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = ''
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
    let active = true
    const abortController = new AbortController()

    abortControllerRef.current?.abort()
    abortControllerRef.current = abortController
    clearObjectUrl()
    setObjectUrl('')
    setError('')

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

        const nextObjectUrl = URL.createObjectURL(blob)

        if (!active) {
          URL.revokeObjectURL(nextObjectUrl)
          return
        }

        objectUrlRef.current = nextObjectUrl
        setObjectUrl(nextObjectUrl)
      } catch (loadError) {
        if (
          !active ||
          loadError.name === 'AbortError'
        ) {
          return
        }

        setError(loadError.message || t.loadError)
      }
    }

    loadPdf()

    return () => {
      active = false
      abortController.abort()
      clearObjectUrl()
    }
  }, [
    accessToken,
    clearObjectUrl,
    deviceToken,
    loadVersion,
    pdfUrl,
    t.invalidPdf,
    t.loadError,
  ])

  const handleClose = () => {
    abortControllerRef.current?.abort()
    clearObjectUrl()

    if (typeof onClose === 'function') {
      onClose()
    }
  }

  const retry = () => {
    setLoadVersion((value) => value + 1)
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
        </div>

        <span
          className="nativePdfHeaderSpacer"
          aria-hidden="true"
        />
      </header>

      <main className="nativePdfContent">
        {!objectUrl && !error ? (
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

        {objectUrl ? (
          <iframe
            className="nativePdfFrame"
            src={objectUrl}
            title={t.viewerTitle}
          />
        ) : null}
      </main>
    </div>
  )
}

export default NativePdfViewer
