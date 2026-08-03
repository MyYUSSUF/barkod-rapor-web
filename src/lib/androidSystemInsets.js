import { Capacitor, registerPlugin } from '@capacitor/core'

const AndroidSystemInsets = registerPlugin('AndroidSystemInsets')
const INSET_NAMES = ['top', 'right', 'bottom', 'left']

export function normalizeAndroidInsets(value = {}) {
  return Object.fromEntries(
    INSET_NAMES.map((name) => {
      const parsedValue = Number(value[name])

      return [name, Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0]
    }),
  )
}

export function applyAndroidInsets(value, root = document.documentElement) {
  const insets = normalizeAndroidInsets(value)

  for (const name of INSET_NAMES) {
    root.style.setProperty(`--android-inset-${name}`, `${insets[name]}px`)
  }

  return insets
}

export async function initializeAndroidSystemInsets() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return undefined
  }

  const listener = await AndroidSystemInsets.addListener(
    'insetsChanged',
    (insets) => applyAndroidInsets(insets),
  )

  applyAndroidInsets(await AndroidSystemInsets.getInsets())

  return () => listener.remove()
}
