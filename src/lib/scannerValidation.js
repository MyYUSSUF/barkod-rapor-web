export const BARCODE_CONFIRMATION_WINDOW_MS = 1200

function normalizeRect(rect) {
  const left = Number(rect?.left)
  const top = Number(rect?.top)
  const width = Number(rect?.width)
  const height = Number(rect?.height)

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }
}

export function getContainedMediaRect(videoRect, sourceWidth, sourceHeight) {
  const normalizedVideoRect = normalizeRect(videoRect)
  const width = Number(sourceWidth)
  const height = Number(sourceHeight)

  if (
    !normalizedVideoRect ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }

  // ZXing source piksellerini ekrandaki contain alanına taşır.
  const scale = Math.min(
    normalizedVideoRect.width / width,
    normalizedVideoRect.height / height
  )
  const renderedWidth = width * scale
  const renderedHeight = height * scale
  const left =
    normalizedVideoRect.left + (normalizedVideoRect.width - renderedWidth) / 2
  const top =
    normalizedVideoRect.top + (normalizedVideoRect.height - renderedHeight) / 2

  return {
    left,
    top,
    width: renderedWidth,
    height: renderedHeight,
    right: left + renderedWidth,
    bottom: top + renderedHeight,
    scale,
  }
}

export function isBarcodeCenteredInFrame({
  points,
  sourceWidth,
  sourceHeight,
  videoRect,
  frameRect,
}) {
  const mediaRect = getContainedMediaRect(
    videoRect,
    sourceWidth,
    sourceHeight
  )
  const normalizedFrameRect = normalizeRect(frameRect)
  const validPoints = (points || []).filter(
    (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)
  )

  if (!mediaRect || !normalizedFrameRect || validPoints.length === 0) {
    return false
  }

  const xs = validPoints.map((point) => mediaRect.left + point.x * mediaRect.scale)
  const ys = validPoints.map((point) => mediaRect.top + point.y * mediaRect.scale)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2

  return (
    centerX >= normalizedFrameRect.left &&
    centerX <= normalizedFrameRect.right &&
    centerY >= normalizedFrameRect.top &&
    centerY <= normalizedFrameRect.bottom
  )
}

export function confirmBarcodeCandidate(
  candidate,
  text,
  detectedAt,
  confirmationWindowMs = BARCODE_CONFIRMATION_WINDOW_MS
) {
  const currentText = String(text || '').trim()
  const currentTime = Number(detectedAt)
  const previousTime = Number(candidate?.detectedAt)
  const isRecentMatch =
    currentText &&
    candidate?.text === currentText &&
    Number.isFinite(currentTime) &&
    Number.isFinite(previousTime) &&
    currentTime >= previousTime &&
    currentTime - previousTime <= confirmationWindowMs

  return {
    candidate: {
      text: currentText,
      detectedAt: currentTime,
    },
    confirmed: Boolean(isRecentMatch),
  }
}
