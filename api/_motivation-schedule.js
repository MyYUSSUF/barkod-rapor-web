export const MOTIVATION_TIME_ZONE = 'Africa/Cairo'

const SCHEDULE_WINDOWS = Object.freeze([
  { startMinute: 7 * 60 + 30, endMinute: 7 * 60 + 44, attempt: 'primary' },
  { startMinute: 7 * 60 + 45, endMinute: 7 * 60 + 59, attempt: 'retry-1' },
  { startMinute: 8 * 60, endMinute: 8 * 60 + 14, attempt: 'retry-2' },
])

export function getCairoCalendarDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOTIVATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  }
}

export function getCairoScheduleAttempt(date = new Date()) {
  const localDateTime = getCairoCalendarDateTime(date)
  const localTime = [localDateTime.hour, localDateTime.minute]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
  const minuteOfDay = localDateTime.hour * 60 + localDateTime.minute
  const scheduleWindow = SCHEDULE_WINDOWS.find(
    ({ startMinute, endMinute }) =>
      minuteOfDay >= startMinute && minuteOfDay <= endMinute,
  )

  return scheduleWindow
    ? { attempt: scheduleWindow.attempt, localTime, ...localDateTime }
    : null
}
