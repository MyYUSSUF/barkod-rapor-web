import { Capacitor, registerPlugin } from '@capacitor/core'

const AndroidSystemInsets = registerPlugin('AndroidSystemInsets')
const INSET_NAMES = ['top', 'right', 'bottom', 'left']
const IME_INSET_NAMES = ['imeTop', 'imeRight', 'imeBottom', 'imeLeft']
const VIEWPORT_WIDTH_TOLERANCE = 2
const ANDROID_INSET_MAX_ATTEMPTS = 6
const ANDROID_INSET_INITIAL_RETRY_MS = 50
const ANDROID_INSET_MAX_RETRY_MS = 800
const NON_KEYBOARD_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

function normalizePositiveNumber(value) {
  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0
}

export function normalizeAndroidInsets(value = {}) {
  const numericInsets = Object.fromEntries(
    [...INSET_NAMES, ...IME_INSET_NAMES].map((name) => [
      name,
      normalizePositiveNumber(value[name]),
    ]),
  )

  return {
    ...numericInsets,
    imeVisible: value.imeVisible === true,
    ready: value.ready === true,
  }
}

export function isAndroidInsetsSnapshotReady(value = {}) {
  return value.ready === true
}

export async function readAndroidInsetsWithRetry({
  attempts = ANDROID_INSET_MAX_ATTEMPTS,
  getInsets,
  wait = (delayMs) =>
    new Promise((resolve) => window.setTimeout(resolve, delayMs)),
} = {}) {
  if (typeof getInsets !== 'function') {
    throw new Error('Android güvenli alan okuyucusu bulunamadı.')
  }

  const safeAttempts =
    Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 1
  let lastError = null

  for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
    try {
      const snapshot = await getInsets()

      if (isAndroidInsetsSnapshotReady(snapshot)) {
        return snapshot
      }

      lastError = new Error('Android güvenli alan bilgisi henüz hazır değil.')
    } catch (error) {
      lastError = error
    }

    if (attempt < safeAttempts - 1) {
      const delayMs = Math.min(
        ANDROID_INSET_MAX_RETRY_MS,
        ANDROID_INSET_INITIAL_RETRY_MS * 2 ** attempt,
      )
      await wait(delayMs)
    }
  }

  throw lastError || new Error('Android güvenli alan bilgisi alınamadı.')
}

export function hasAndroidImeBottomOcclusion(value = {}) {
  const insets = normalizeAndroidInsets(value)

  return (
    insets.imeVisible &&
    insets.imeBottom > insets.bottom + 1
  )
}

export function applyAndroidInsets(value, root = document.documentElement) {
  const insets = normalizeAndroidInsets(value)

  for (const name of INSET_NAMES) {
    root.style.setProperty(`--android-inset-${name}`, `${insets[name]}px`)
  }

  for (const name of IME_INSET_NAMES) {
    const cssName = name.slice('ime'.length).toLowerCase()
    root.style.setProperty(
      `--android-ime-inset-${cssName}`,
      `${insets[name]}px`,
    )
  }

  root.style.setProperty(
    '--android-ime-visible',
    insets.imeVisible ? '1' : '0',
  )
  const imeOccludesBottom = hasAndroidImeBottomOcclusion(insets)
  root.style.setProperty(
    '--android-ime-occludes-bottom',
    imeOccludesBottom ? '1' : '0',
  )
  root.style.setProperty(
    '--android-system-bar-guard-bottom',
    `${imeOccludesBottom ? 0 : insets.bottom}px`,
  )

  return insets
}

export function isAndroidImeTarget(element) {
  if (!element || element.disabled || element.readOnly) {
    return false
  }

  const tagName = String(element.tagName || '').toLowerCase()

  if (tagName === 'textarea' || tagName === 'select') {
    return true
  }

  if (tagName === 'input') {
    return !NON_KEYBOARD_INPUT_TYPES.has(
      String(element.type || 'text').toLowerCase(),
    )
  }

  return element.isContentEditable === true
}

export function blurAndroidImeTarget(element) {
  if (!isAndroidImeTarget(element) || typeof element.blur !== 'function') {
    return false
  }

  element.blur()
  return true
}

function getAndroidViewportMetrics({
  innerHeight = 0,
  innerWidth = 0,
  visualViewport,
} = {}) {
  const top = normalizePositiveNumber(visualViewport?.offsetTop)
  const visualHeight = normalizePositiveNumber(visualViewport?.height)
  const height = visualHeight || normalizePositiveNumber(innerHeight)
  const visualWidth = normalizePositiveNumber(visualViewport?.width)
  const width = visualWidth || normalizePositiveNumber(innerWidth)

  return {
    bottom: top + height,
    height,
    top,
    width,
  }
}

export function resolveAndroidImeVisibleBounds({
  baselineViewport,
  insets = {},
  innerHeight = 0,
  innerWidth = 0,
  margin = 12,
  visualViewport,
} = {}) {
  const normalizedInsets = normalizeAndroidInsets(insets)
  const viewport = getAndroidViewportMetrics({
    innerHeight,
    innerWidth,
    visualViewport,
  })
  const safeMargin = normalizePositiveNumber(margin)
  const imeOccludesBottom = hasAndroidImeBottomOcclusion(
    normalizedInsets,
  )
  let visibleBottom = viewport.bottom

  if (imeOccludesBottom) {
    const baselineBottom = normalizePositiveNumber(
      baselineViewport?.bottom,
    )
    const baselineWidth = normalizePositiveNumber(
      baselineViewport?.width,
    )
    const widthsMatch =
      baselineWidth > 0 &&
      viewport.width > 0 &&
      Math.abs(baselineWidth - viewport.width) <=
        VIEWPORT_WIDTH_TOLERANCE

    if (baselineBottom > 0 && widthsMatch) {
      visibleBottom = Math.min(
        visibleBottom,
        Math.max(
          viewport.top,
          baselineBottom - normalizedInsets.imeBottom,
        ),
      )
    }
  } else {
    visibleBottom -= normalizedInsets.bottom
  }

  return {
    bottom: visibleBottom - safeMargin,
    top: viewport.top + normalizedInsets.top + safeMargin,
    viewport,
  }
}

export function ensureAndroidImeTargetVisible(
  element,
  {
    baselineViewport,
    insets = {},
    innerHeight = 0,
    innerWidth = 0,
    margin = 12,
    visualViewport,
  } = {},
) {
  if (
    !isAndroidImeTarget(element) ||
    element.isConnected === false ||
    typeof element.getBoundingClientRect !== 'function' ||
    typeof element.scrollIntoView !== 'function'
  ) {
    return false
  }

  const visibleBounds = resolveAndroidImeVisibleBounds({
    baselineViewport,
    insets,
    innerHeight,
    innerWidth,
    margin,
    visualViewport,
  })

  if (visibleBounds.viewport.height <= 0) {
    return false
  }

  const rect = element.getBoundingClientRect()

  if (
    rect.top >= visibleBounds.top &&
    rect.bottom <= visibleBounds.bottom
  ) {
    return false
  }

  element.scrollIntoView({
    behavior: 'auto',
    block: 'center',
    inline: 'nearest',
  })

  return true
}

export function installAndroidImeViewportHandling({
  documentObject = document,
  getInsets = () => ({}),
  windowObject = window,
} = {}) {
  const visualViewport = windowObject.visualViewport
  const requestFrame =
    typeof windowObject.requestAnimationFrame === 'function'
      ? (callback) => windowObject.requestAnimationFrame(callback)
      : (callback) => windowObject.setTimeout(callback, 0)
  const cancelFrame =
    typeof windowObject.cancelAnimationFrame === 'function'
      ? (frameId) => windowObject.cancelAnimationFrame(frameId)
      : (frameId) => windowObject.clearTimeout(frameId)
  let focusedElement = null
  let frameId = 0
  let baselineViewport = null

  const rememberViewportBaseline = () => {
    const insets = normalizeAndroidInsets(getInsets())

    if (insets.imeVisible) {
      return
    }

    const nextBaseline = getAndroidViewportMetrics({
      innerHeight: windowObject.innerHeight,
      innerWidth: windowObject.innerWidth,
      visualViewport,
    })

    if (nextBaseline.height <= 0) {
      return
    }

    if (!baselineViewport || !focusedElement) {
      baselineViewport = nextBaseline
      return
    }

    if (
      Math.abs(baselineViewport.width - nextBaseline.width) <=
      VIEWPORT_WIDTH_TOLERANCE
    ) {
      baselineViewport = {
        ...nextBaseline,
        bottom: Math.max(
          baselineViewport.bottom,
          nextBaseline.bottom,
        ),
        height: Math.max(
          baselineViewport.height,
          nextBaseline.height,
        ),
      }
    }
  }

  rememberViewportBaseline()

  const schedule = () => {
    if (!focusedElement || frameId) {
      return
    }

    frameId = requestFrame(() => {
      frameId = 0
      ensureAndroidImeTargetVisible(focusedElement, {
        baselineViewport,
        insets: getInsets(),
        innerHeight: windowObject.innerHeight,
        innerWidth: windowObject.innerWidth,
        visualViewport,
      })
    })
  }

  const handleFocusIn = (event) => {
    if (!isAndroidImeTarget(event.target)) {
      return
    }

    focusedElement = event.target
    rememberViewportBaseline()
    schedule()
  }

  const handleFocusOut = (event) => {
    if (event.target !== focusedElement) {
      return
    }

    focusedElement = null

    if (frameId) {
      cancelFrame(frameId)
      frameId = 0
    }
  }

  const handleViewportChange = () => {
    rememberViewportBaseline()
    schedule()
  }

  documentObject.addEventListener('focusin', handleFocusIn)
  documentObject.addEventListener('focusout', handleFocusOut)
  windowObject.addEventListener('resize', handleViewportChange)

  if (visualViewport) {
    // Scrolling the visual viewport is a deliberate user action while the IME
    // is open. Re-centering the focused field here would undo that scroll.
    visualViewport.addEventListener('resize', handleViewportChange)
  }

  return {
    handleInsetsChange() {
      rememberViewportBaseline()
      schedule()
    },
    schedule,
    cleanup() {
      focusedElement = null

      if (frameId) {
        cancelFrame(frameId)
        frameId = 0
      }

      documentObject.removeEventListener('focusin', handleFocusIn)
      documentObject.removeEventListener('focusout', handleFocusOut)
      windowObject.removeEventListener('resize', handleViewportChange)

      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleViewportChange)
      }
    },
  }
}

export async function initializeAndroidSystemInsets() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return undefined
  }

  let currentInsets = normalizeAndroidInsets()
  let listener
  const viewportHandling = installAndroidImeViewportHandling({
    getInsets: () => currentInsets,
  })
  const handleInsets = (insets) => {
    if (!isAndroidInsetsSnapshotReady(insets)) {
      return false
    }

    currentInsets = applyAndroidInsets(insets)
    viewportHandling.handleInsetsChange()
    return true
  }

  try {
    listener = await AndroidSystemInsets.addListener(
      'insetsChanged',
      handleInsets,
    )

    const initialInsets = await readAndroidInsetsWithRetry({
      getInsets: () => AndroidSystemInsets.getInsets(),
    })
    handleInsets(initialInsets)
  } catch (error) {
    viewportHandling.cleanup()
    await listener?.remove()
    throw error
  }

  return () => {
    viewportHandling.cleanup()
    return listener.remove()
  }
}
