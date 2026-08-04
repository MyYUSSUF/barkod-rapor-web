const normalizeUserId = (value) => String(value || '').trim()

const normalizeGeneration = (value) => {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function advanceSessionLifecycle(current = {}, userId = '') {
  return {
    generation: normalizeGeneration(current.generation) + 1,
    userId: normalizeUserId(userId),
  }
}

export function isSessionLifecycleCurrent(current = {}, candidate = {}) {
  const currentUserId = normalizeUserId(current.userId)
  const candidateUserId = normalizeUserId(candidate.userId)

  return Boolean(
    currentUserId &&
      candidateUserId &&
      currentUserId === candidateUserId &&
      normalizeGeneration(current.generation) ===
        normalizeGeneration(candidate.generation),
  )
}

export function isAuthSessionUser(session, expectedUserId) {
  const userId = normalizeUserId(expectedUserId)
  return Boolean(userId && normalizeUserId(session?.user?.id) === userId)
}
