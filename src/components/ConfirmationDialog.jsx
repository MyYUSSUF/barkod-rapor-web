import { useEffect, useRef } from 'react'

export function ConfirmationDialog({
  cancelLabel,
  confirmLabel,
  disabled = false,
  message,
  onCancel,
  onConfirm,
  open,
  title,
}) {
  const confirmButtonRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmButtonRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onCancel, open])

  if (!open) {
    return null
  }

  return (
    <div className="selectionDialogBackdrop confirmationDialogBackdrop">
      <section
        className="selectionDialogPanel confirmationDialogPanel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmationDialogTitle"
        aria-describedby="confirmationDialogMessage"
      >
        <strong id="confirmationDialogTitle">{title}</strong>
        <p id="confirmationDialogMessage">{message}</p>
        <div className="confirmationDialogActions">
          <button type="button" onClick={onCancel} disabled={disabled}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={disabled}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
