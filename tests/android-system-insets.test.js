import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAndroidInsets,
  blurAndroidImeTarget,
  ensureAndroidImeTargetVisible,
  hasAndroidImeBottomOcclusion,
  installAndroidImeViewportHandling,
  isAndroidImeTarget,
  isAndroidInsetsSnapshotReady,
  normalizeAndroidInsets,
  readAndroidInsetsWithRetry,
  resolveAndroidImeVisibleBounds,
} from '../src/lib/androidSystemInsets.js'

test('Android inset değerlerini sonlu ve pozitif sayılarla sınırlar', () => {
  assert.deepEqual(
    normalizeAndroidInsets({
      top: 28,
      right: '4.5',
      bottom: -3,
      left: Number.NaN,
      imeTop: 0,
      imeRight: '2',
      imeBottom: 312.5,
      imeLeft: -4,
      imeVisible: true,
    }),
    {
      top: 28,
      right: 4.5,
      bottom: 0,
      left: 0,
      imeTop: 0,
      imeRight: 2,
      imeBottom: 312.5,
      imeLeft: 0,
      imeVisible: true,
      ready: false,
    },
  )
})

test('Android inset başlangıcı yalnız native snapshot hazır olduğunda tamamlanır', async () => {
  const snapshots = [
    { ready: false },
    { top: 28, bottom: 24, ready: true },
  ]
  const waits = []
  const result = await readAndroidInsetsWithRetry({
    attempts: 3,
    getInsets: async () => snapshots.shift(),
    wait: async (delayMs) => waits.push(delayMs),
  })

  assert.equal(isAndroidInsetsSnapshotReady(result), true)
  assert.equal(result.top, 28)
  assert.deepEqual(waits, [50])
})

test('Android inset başlangıcı sınırlı denemeden sonra kapalı kalır', async () => {
  let readCount = 0

  await assert.rejects(
    readAndroidInsetsWithRetry({
      attempts: 3,
      getInsets: async () => {
        readCount += 1
        return { ready: false }
      },
      wait: async () => {},
    }),
    /henüz hazır değil/,
  )

  assert.equal(readCount, 3)
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

  applyAndroidInsets(
    {
      top: 24,
      right: 1,
      bottom: 48,
      left: 2,
      imeTop: 0,
      imeRight: 0,
      imeBottom: 320,
      imeLeft: 0,
      imeVisible: true,
    },
    root,
  )

  assert.deepEqual(Object.fromEntries(properties), {
    '--android-inset-top': '24px',
    '--android-inset-right': '1px',
    '--android-inset-bottom': '48px',
    '--android-inset-left': '2px',
    '--android-ime-inset-top': '0px',
    '--android-ime-inset-right': '0px',
    '--android-ime-inset-bottom': '320px',
    '--android-ime-inset-left': '0px',
    '--android-ime-visible': '1',
    '--android-ime-occludes-bottom': '1',
    '--android-system-bar-guard-bottom': '0px',
  })
})

test('Alt sistem çubuğu koruyucusu klavye kapalıyken geri gelir', () => {
  const properties = new Map()
  const root = {
    style: {
      setProperty(name, value) {
        properties.set(name, value)
      },
    },
  }

  applyAndroidInsets(
    { bottom: 48, imeBottom: 0, imeVisible: false },
    root,
  )

  assert.equal(properties.get('--android-ime-visible'), '0')
  assert.equal(properties.get('--android-ime-occludes-bottom'), '0')
  assert.equal(
    properties.get('--android-system-bar-guard-bottom'),
    '48px',
  )
})

test('Floating klavye alt gezinme koruyucusunu kaldırmaz', () => {
  const properties = new Map()
  const root = {
    style: {
      setProperty(name, value) {
        properties.set(name, value)
      },
    },
  }
  const floatingInsets = {
    bottom: 48,
    imeBottom: 48,
    imeVisible: true,
  }

  applyAndroidInsets(floatingInsets, root)

  assert.equal(hasAndroidImeBottomOcclusion(floatingInsets), false)
  assert.equal(properties.get('--android-ime-occludes-bottom'), '0')
  assert.equal(
    properties.get('--android-system-bar-guard-bottom'),
    '48px',
  )
})

test('Native IME fallback OEM WebView küçülmese bile görünür alt sınırı bulur', () => {
  const bounds = resolveAndroidImeVisibleBounds({
    baselineViewport: { bottom: 800, width: 400 },
    insets: {
      bottom: 48,
      imeBottom: 320,
      imeVisible: true,
      top: 24,
    },
    innerHeight: 800,
    innerWidth: 400,
    visualViewport: { offsetTop: 0, height: 800, width: 400 },
  })

  assert.equal(bounds.top, 36)
  assert.equal(bounds.bottom, 468)
})

test('IME fallback küçülmüş visualViewport değerini ikinci kez çıkarmaz', () => {
  const bounds = resolveAndroidImeVisibleBounds({
    baselineViewport: { bottom: 800, width: 400 },
    insets: {
      bottom: 48,
      imeBottom: 320,
      imeVisible: true,
      top: 24,
    },
    innerHeight: 480,
    innerWidth: 400,
    visualViewport: { offsetTop: 0, height: 480, width: 400 },
  })

  assert.equal(bounds.bottom, 468)
})

test('Yalnızca klavye kullanabilen düzenleme alanlarını IME hedefi sayar', () => {
  assert.equal(isAndroidImeTarget({ tagName: 'INPUT', type: 'text' }), true)
  assert.equal(
    isAndroidImeTarget({ tagName: 'INPUT', type: 'checkbox' }),
    false,
  )
  assert.equal(isAndroidImeTarget({ tagName: 'TEXTAREA' }), true)
  assert.equal(
    isAndroidImeTarget({ tagName: 'DIV', isContentEditable: true }),
    true,
  )
  assert.equal(isAndroidImeTarget({ tagName: 'INPUT', disabled: true }), false)
})

test('Rapor açılırken yalnız aktif IME hedefinin odağını bırakır', () => {
  let blurCount = 0
  const input = {
    tagName: 'INPUT',
    type: 'text',
    blur() {
      blurCount += 1
    },
  }

  assert.equal(blurAndroidImeTarget(input), true)
  assert.equal(blurCount, 1)
  assert.equal(
    blurAndroidImeTarget({
      tagName: 'TEXTAREA',
      blur() {
        blurCount += 1
      },
    }),
    true,
  )
  assert.equal(blurCount, 2)
  assert.equal(
    blurAndroidImeTarget({ tagName: 'BUTTON', type: 'button', blur() {} }),
    false,
  )
  assert.equal(
    blurAndroidImeTarget({
      tagName: 'INPUT',
      type: 'text',
      readOnly: true,
      blur() {},
    }),
    false,
  )
  assert.equal(
    blurAndroidImeTarget({ tagName: 'INPUT', type: 'text' }),
    false,
  )
})

test('Odaklanan alan görünür klavye alanının altında kalırsa ortalanır', () => {
  const calls = []
  const input = {
    tagName: 'INPUT',
    type: 'text',
    isConnected: true,
    getBoundingClientRect: () => ({ top: 510, bottom: 550 }),
    scrollIntoView: (options) => calls.push(options),
  }

  assert.equal(
    ensureAndroidImeTargetVisible(input, {
      insets: { top: 24, bottom: 48, imeVisible: true },
      innerHeight: 800,
      visualViewport: { offsetTop: 0, height: 520 },
    }),
    true,
  )
  assert.deepEqual(calls, [
    { behavior: 'auto', block: 'center', inline: 'nearest' },
  ])
})

test('Görünür odak alanına gereksiz kaydırma yapmaz', () => {
  let scrollCount = 0
  const input = {
    tagName: 'INPUT',
    type: 'text',
    isConnected: true,
    getBoundingClientRect: () => ({ top: 120, bottom: 160 }),
    scrollIntoView: () => {
      scrollCount += 1
    },
  }

  assert.equal(
    ensureAndroidImeTargetVisible(input, {
      insets: { top: 24, bottom: 48, imeVisible: true },
      visualViewport: { offsetTop: 0, height: 520 },
    }),
    false,
  )
  assert.equal(scrollCount, 0)
})

test('Kullanıcı kaydırması odak alanını yeniden ortalamaz ve IME dinleyicileri temizlenebilir', () => {
  const documentListeners = new Map()
  const viewportListeners = new Map()
  const windowListeners = new Map()
  let frameCallback
  let scrollCount = 0
  let currentInsets = {
    top: 24,
    bottom: 48,
    imeBottom: 0,
    imeVisible: false,
  }
  const runFrame = () => {
    const callback = frameCallback
    frameCallback = undefined
    callback()
  }
  const documentObject = {
    addEventListener(name, listener) {
      documentListeners.set(name, listener)
    },
    removeEventListener(name, listener) {
      if (documentListeners.get(name) === listener) {
        documentListeners.delete(name)
      }
    },
  }
  const visualViewport = {
    offsetTop: 0,
    height: 800,
    width: 360,
    addEventListener(name, listener) {
      viewportListeners.set(name, listener)
    },
    removeEventListener(name, listener) {
      if (viewportListeners.get(name) === listener) {
        viewportListeners.delete(name)
      }
    },
  }
  const windowObject = {
    innerHeight: 800,
    innerWidth: 360,
    visualViewport,
    addEventListener(name, listener) {
      windowListeners.set(name, listener)
    },
    removeEventListener(name, listener) {
      if (windowListeners.get(name) === listener) {
        windowListeners.delete(name)
      }
    },
    requestAnimationFrame(callback) {
      frameCallback = callback
      return 7
    },
    cancelAnimationFrame() {
      frameCallback = undefined
    },
  }
  const input = {
    tagName: 'INPUT',
    type: 'text',
    isConnected: true,
    getBoundingClientRect: () => ({ top: 600, bottom: 640 }),
    scrollIntoView: () => {
      scrollCount += 1
    },
  }
  const handling = installAndroidImeViewportHandling({
    documentObject,
    getInsets: () => currentInsets,
    windowObject,
  })

  documentListeners.get('focusin')({ target: input })
  runFrame()

  assert.equal(scrollCount, 0)
  assert.deepEqual([...documentListeners.keys()].sort(), [
    'focusin',
    'focusout',
  ])
  assert.deepEqual([...viewportListeners.keys()], ['resize'])
  assert.equal(viewportListeners.has('scroll'), false)
  assert.deepEqual([...windowListeners.keys()], ['resize'])

  currentInsets = {
    top: 24,
    bottom: 48,
    imeBottom: 303,
    imeVisible: true,
  }
  visualViewport.height = 497
  viewportListeners.get('resize')()
  runFrame()

  assert.equal(scrollCount, 1)

  viewportListeners.get('resize')()
  assert.equal(typeof frameCallback, 'function')
  documentListeners.get('focusout')({ target: input })
  assert.equal(frameCallback, undefined)
  assert.equal(scrollCount, 1)

  handling.cleanup()

  assert.equal(documentListeners.size, 0)
  assert.equal(viewportListeners.size, 0)
  assert.equal(windowListeners.size, 0)
})
