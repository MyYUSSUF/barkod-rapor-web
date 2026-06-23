import { useCallback, useEffect, useRef, useState } from 'react'
import './NativePdfViewer.css'

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
    viewerTitle: 'Rapor PDF görüntüleyici',
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
    viewerTitle: 'Report PDF viewer',
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
    viewerTitle: 'عارض التقرير PDF',
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
  const objectUrlRef = useRef('')
  const pdfBlobRef = useRef(null)
  const abortControllerRef = useRef(null)
  const [objectUrl, setObjectUrl] = useState('')
  const [error, setError] = useState('')
  const [shareError, setShareError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)

  const isArabic = language === 'ar'
  const t = TEXTS[language] || TEXTS.tr
  const finalFileName = sanitizeFileName(
    fileName?.toLowerCase().endsWith('.pdf')
      ? fileName
      : `${fileName || reportName || 'rapor'}.pdf`
  )

  const clearObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) {
      return
    }

    URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = ''
    pdfBlobRef.current = null
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

        const nextObjectUrl = URL.createObjectURL(blob)

        if (!active) {
          URL.revokeObjectURL(nextObjectUrl)
          return
        }

        objectUrlRef.current = nextObjectUrl
        pdfBlobRef.current = blob
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
        </div>

        <button
          type="button"
          className="nativePdfShareButton"
          onClick={sharePdf}
          disabled={!objectUrl || sharing}
          aria-label={sharing ? t.sharing : t.share}
        >
          {sharing ? t.sharing : t.share}
        </button>
      </header>

      <main className="nativePdfContent">
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
            src={`${objectUrl}#page=1&view=Fit`}
            title={t.viewerTitle}
          />
        ) : null}
      </main>
    </div>
  )
}

export default NativePdfViewer
