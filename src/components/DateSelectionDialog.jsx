import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { createCalendarDays, parseIsoDate, toIsoDate } from '../lib/calendar'

const LANGUAGE_LOCALES = {
  tr: 'tr-TR',
  en: 'en-US',
  ar: 'ar',
}

export const DateSelectionDialog = forwardRef(function DateSelectionDialog(
  {
    closeLabel,
    disabled = false,
    id,
    label,
    language = 'tr',
    max,
    min,
    nextMonthLabel,
    onChange,
    placeholder,
    previousMonthLabel,
    title,
    todayLabel,
    value,
  },
  forwardedRef
) {
  const locale = LANGUAGE_LOCALES[language] || LANGUAGE_LOCALES.tr
  const selectedDate = parseIsoDate(value)
  const today = useMemo(() => new Date(), [])
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState(
    () => selectedDate || new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (typeof forwardedRef === 'function') {
      forwardedRef(triggerRef.current)
    } else if (forwardedRef) {
      forwardedRef.current = triggerRef.current
    }
  }, [forwardedRef])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('[aria-pressed="true"]')?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const calendarDays = createCalendarDays(displayMonth)
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const monday = new Date(2024, 0, 1 + index)
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(monday)
  })
  const formattedValue = selectedDate
    ? new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(selectedDate)
    : placeholder
  const monthTitle = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(displayMonth)
  const todayIsoDate = toIsoDate(today)

  const closeDialog = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openDialog = () => {
    const initialMonth = selectedDate || today
    setDisplayMonth(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1))
    setOpen(true)
  }

  const selectDate = (isoDate) => {
    onChange(isoDate)
    closeDialog()
  }

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="datePickerTrigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openDialog}
      >
        <span>{formattedValue}</span>
        <span aria-hidden="true">▦</span>
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
            ref={panelRef}
            className="selectionDialogPanel datePickerPanel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="selectionDialogHeader">
              <strong>{title}</strong>
              <button
                type="button"
                className="selectionDialogClose"
                aria-label={closeLabel}
                onClick={closeDialog}
              >
                ×
              </button>
            </div>

            <div className="datePickerBody">
              <div className="datePickerMonthHeader">
              <button
                type="button"
                aria-label={previousMonthLabel}
                onClick={() =>
                  setDisplayMonth(
                    (current) =>
                      new Date(current.getFullYear(), current.getMonth() - 1, 1)
                  )
                }
              >
                ‹
              </button>
              <strong>{monthTitle}</strong>
              <button
                type="button"
                aria-label={nextMonthLabel}
                onClick={() =>
                  setDisplayMonth(
                    (current) =>
                      new Date(current.getFullYear(), current.getMonth() + 1, 1)
                  )
                }
              >
                ›
              </button>
            </div>

            <div className="datePickerWeekdays" aria-hidden="true">
              {weekdayLabels.map((weekday, index) => (
                <span key={`${weekday}-${index}`}>{weekday}</span>
              ))}
            </div>

            <div className="datePickerDays" role="grid">
              {calendarDays.map(({ date, inDisplayMonth, isoDate }) => {
                const outsideRange = Boolean(
                  (min && isoDate < min) || (max && isoDate > max)
                )
                const selected = isoDate === value

                return (
                  <button
                    key={isoDate}
                    type="button"
                    className={`${inDisplayMonth ? '' : 'isOutsideMonth '}${
                      isoDate === todayIsoDate ? 'isToday ' : ''
                    }${selected ? 'isSelected' : ''}`.trim()}
                    aria-label={new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(date)}
                    aria-pressed={selected}
                    disabled={outsideRange}
                    onClick={() => selectDate(isoDate)}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              className="datePickerTodayButton"
              disabled={Boolean(
                (min && todayIsoDate < min) || (max && todayIsoDate > max)
              )}
              onClick={() => selectDate(todayIsoDate)}
            >
              {todayLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
})
