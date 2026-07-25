export function supportsCameraTorch(track) {
  if (
    !track ||
    typeof track.getCapabilities !== 'function' ||
    typeof track.applyConstraints !== 'function'
  ) {
    return false
  }

  try {
    return track.getCapabilities()?.torch === true
  } catch {
    return false
  }
}

export async function applyCameraTorch(track, enabled) {
  if (!supportsCameraTorch(track)) {
    return false
  }

  await track.applyConstraints({
    advanced: [{ torch: Boolean(enabled) }],
  })

  return true
}
