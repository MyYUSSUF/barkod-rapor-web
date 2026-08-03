export function normalizeAppUpdatePolicy(value = {}) {
  const minimumVersionCode = Number.parseInt(value.minimumVersionCode, 10)

  return {
    forceUpdate: value.forceUpdate === true,
    minimumVersionCode:
      Number.isSafeInteger(minimumVersionCode) && minimumVersionCode > 0
        ? minimumVersionCode
        : 0,
  }
}

export function isMandatoryAppUpdate(policy, currentVersionCode) {
  const normalizedPolicy = normalizeAppUpdatePolicy(policy)
  const installedVersionCode = Number.parseInt(currentVersionCode, 10)

  return Boolean(
    normalizedPolicy.forceUpdate &&
      normalizedPolicy.minimumVersionCode > 0 &&
      Number.isSafeInteger(installedVersionCode) &&
      installedVersionCode < normalizedPolicy.minimumVersionCode
  )
}

export function shouldRequireAppUpdate({
  policy,
  currentVersionCode,
  playUpdateAvailable = false,
  allPlayUpdatesMandatory = true,
} = {}) {
  return Boolean(
    isMandatoryAppUpdate(policy, currentVersionCode) ||
      (allPlayUpdatesMandatory && playUpdateAvailable),
  )
}

export function decideAndroidUpdateState({
  policy,
  currentVersionCode,
  playCheckSucceeded = false,
  playUpdateAvailable = false,
  previousCheckSucceeded = false,
  allPlayUpdatesMandatory = true,
} = {}) {
  if (isMandatoryAppUpdate(policy, currentVersionCode)) {
    return { action: 'require', reason: 'policy' }
  }

  if (allPlayUpdatesMandatory && playUpdateAvailable) {
    return { action: 'require', reason: 'play' }
  }

  if (!playCheckSucceeded) {
    return {
      action: previousCheckSucceeded ? 'preserve' : 'retry',
      reason: 'play-check-failed',
    }
  }

  const installedVersionCode = Number.parseInt(currentVersionCode, 10)

  if (!Number.isSafeInteger(installedVersionCode)) {
    return {
      action: previousCheckSucceeded ? 'preserve' : 'retry',
      reason: 'version-unavailable',
    }
  }

  return { action: 'allow', reason: 'up-to-date' }
}
