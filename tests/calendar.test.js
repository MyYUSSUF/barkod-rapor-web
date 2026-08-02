import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCalendarDays,
  parseIsoDate,
  toIsoDate,
} from '../src/lib/calendar.js'

test('ISO dates keep the selected local calendar day', () => {
  const date = parseIsoDate('2026-08-01')

  assert.ok(date)
  assert.equal(toIsoDate(date), '2026-08-01')
})

test('invalid calendar dates are rejected', () => {
  assert.equal(parseIsoDate('2026-02-30'), null)
  assert.equal(parseIsoDate('01.08.2026'), null)
})

test('calendar grid starts on Monday and contains leap day', () => {
  const days = createCalendarDays(new Date(2024, 1, 1))

  assert.equal(days.length, 42)
  assert.equal(days[0].date.getDay(), 1)
  assert.equal(days.some((day) => day.isoDate === '2024-02-29'), true)
})
