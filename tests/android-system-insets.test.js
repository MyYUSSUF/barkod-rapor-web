import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAndroidInsets,
  normalizeAndroidInsets,
} from '../src/lib/androidSystemInsets.js'

test('Android inset değerlerini sonlu ve pozitif sayılarla sınırlar', () => {
  assert.deepEqual(
    normalizeAndroidInsets({
      top: 28,
      right: '4.5',
      bottom: -3,
      left: Number.NaN,
    }),
    {
      top: 28,
      right: 4.5,
      bottom: 0,
      left: 0,
    },
  )
})

test('Android inset değerlerini CSS custom property olarak uygular', () => {
  const properties = new Map()
  const root = {
    style: {
      setProperty(name, value) {
        properties.set(name, value)
      },
    },
  }

  applyAndroidInsets({ top: 24, right: 1, bottom: 48, left: 2 }, root)

  assert.deepEqual(Object.fromEntries(properties), {
    '--android-inset-top': '24px',
    '--android-inset-right': '1px',
    '--android-inset-bottom': '48px',
    '--android-inset-left': '2px',
  })
})
