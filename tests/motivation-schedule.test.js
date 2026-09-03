import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MOTIVATION_TIME_ZONE,
  getCairoCalendarDateTime,
  getCairoScheduleAttempt,
} from '../api/_motivation-schedule.js'

test('motivation schedule uses the Africa/Cairo time zone', () => {
  assert.equal(MOTIVATION_TIME_ZONE, 'Africa/Cairo')
})

test('07:30 Cairo is selected correctly during daylight saving time', () => {
  assert.deepEqual(
    getCairoScheduleAttempt(new Date('2026-09-04T04:30:00.000Z')),
    {
      attempt: 'primary',
      localTime: '07:30',
      year: 2026,
      month: 9,
      day: 4,
      hour: 7,
      minute: 30,
    },
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T05:30:00.000Z')),
    null,
  )
})

test('07:30 Cairo is selected correctly outside daylight saving time', () => {
  assert.deepEqual(
    getCairoScheduleAttempt(new Date('2026-12-01T05:30:00.000Z')),
    {
      attempt: 'primary',
      localTime: '07:30',
      year: 2026,
      month: 12,
      day: 1,
      hour: 7,
      minute: 30,
    },
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-12-01T04:30:00.000Z')),
    null,
  )
})

test('Cairo retry windows are available only at 07:45 and 08:00', () => {
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T04:45:00.000Z')).attempt,
    'retry-1',
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T05:00:00.000Z')).attempt,
    'retry-2',
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-12-01T05:45:00.000Z')).attempt,
    'retry-1',
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-12-01T06:00:00.000Z')).attempt,
    'retry-2',
  )
})

test('small scheduler delays stay inside the intended attempt window', () => {
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T04:44:59.000Z')).attempt,
    'primary',
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T04:59:59.000Z')).attempt,
    'retry-1',
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T05:14:59.000Z')).attempt,
    'retry-2',
  )
  assert.equal(
    getCairoScheduleAttempt(new Date('2026-09-04T05:15:00.000Z')),
    null,
  )
})

test('Cairo calendar date follows the local day around UTC midnight', () => {
  assert.deepEqual(
    getCairoCalendarDateTime(new Date('2026-12-31T22:30:00.000Z')),
    {
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
      minute: 30,
    },
  )
})
