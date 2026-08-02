import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export const SelectionDialog = forwardRef(function SelectionDialog(
  {
    ariaLabel,
    className = '',
    closeLabel,
    disabled = false,
    id,
    label,
    onChange,
    options,
    placeholder,
    title,
    value,
  },
  forwardedRef
) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const selectedOption = options.find((option) => option.value === value)

  useImperativeHandle(forwardedRef, () => triggerRef.current)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const optionButton =
      dialogRef.current?.querySelector('[aria-checked="true"]') ||
      dialogRef.current?.querySelector('.selectionDialogOption')
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    optionButton?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeDialog()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const closeDialog = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const selectOption = (nextValue) => {
    onChange(nextValue)
    closeDialog()
  }

  return (
    <>
      {label ? <label htmlFor={id}>{label}</label> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`selectionDialogTrigger ${className}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span>{selectedOption?.label || placeholder}</span>
        <svg
          className="selectionDialogChevron"
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          className="selectionDialogBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog()
            }
          }}
        >
          <section
            ref={dialogRef}
            className="selectionDialogPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="selectionDialogHeader">
              <strong id={titleId}>{title}</strong>
              <button
                type="button"
                className="selectionDialogClose"
                aria-label={closeLabel}
                onClick={closeDialog}
              >
                ×
              </button>
            </div>

            <div className="selectionDialogOptions" role="radiogroup">
              {options.map((option) => {
                const selected = option.value === value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`selectionDialogOption${selected ? ' isSelected' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => selectOption(option.value)}
                  >
                    <span>{option.label}</span>
                    {selected ? <span aria-hidden="true">✓</span> : null}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
})
