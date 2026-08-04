export const MIN_PDF_ZOOM = 1
export const MAX_PDF_ZOOM = 3
export const PDF_SHARE_CACHE_PATH = 'shared-pdfs'
export const PDF_SHARE_CACHE_MAX_AGE_MS = 15 * 60 * 1000

export function normalizePdfZoom(value) {
  const nextZoom = Number(value)

  if (!Number.isFinite(nextZoom)) {
    return MIN_PDF_ZOOM
  }

  return Math.min(
    MAX_PDF_ZOOM,
    Math.max(
      MIN_PDF_ZOOM,
      Math.round(nextZoom * 1000) / 1000,
    ),
  )
}

export async function removeCachedPdfFile(filesystem, options) {
  if (typeof filesystem?.deleteFile !== 'function') {
    return false
  }

  try {
    await filesystem.deleteFile(options)
    return true
  } catch {
    return false
  }
}

export function isPdfShareCancellation(error) {
  if (error?.name === 'AbortError') {
    return true
  }

  return /\b(?:share\s+)?cancel(?:ed|led)\b/i.test(
    String(error?.message || ''),
  )
}

export async function removeStaleCachedPdfFiles(
  filesystem,
  {
    directory,
    maxAgeMs = PDF_SHARE_CACHE_MAX_AGE_MS,
    now = Date.now(),
    path = PDF_SHARE_CACHE_PATH,
  } = {},
) {
  if (
    typeof filesystem?.readdir !== 'function' ||
    typeof filesystem?.deleteFile !== 'function'
  ) {
    return { checked: false, failed: 0, removed: 0 }
  }

  let files

  try {
    const result = await filesystem.readdir({ path, directory })
    files = Array.isArray(result?.files) ? result.files : []
  } catch {
    return { checked: false, failed: 0, removed: 0 }
  }

  const cleanNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const cleanMaxAge = Math.max(0, Number(maxAgeMs) || 0)
  const staleBefore = cleanNow - cleanMaxAge
  let failed = 0
  let removed = 0

  for (const file of files) {
    const modifiedAt = Number(file?.mtime ?? file?.ctime)
    const fileName = String(file?.name || '')

    if (
      file?.type !== 'file' ||
      !fileName ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      !Number.isFinite(modifiedAt) ||
      modifiedAt > staleBefore
    ) {
      continue
    }

    const didRemove = await removeCachedPdfFile(filesystem, {
      path: `${path}/${fileName}`,
      directory,
    })

    if (didRemove) {
      removed += 1
    } else {
      failed += 1
    }
  }

  return { checked: true, failed, removed }
}
