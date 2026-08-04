export const PLAY_UPDATE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  UNKNOWN: 'unknown',
})

export const REMOTE_POLICY_STATUS = Object.freeze({
  VERIFIED: 'verified',
  CACHE: 'cache',
  UNKNOWN: 'unknown',
})

const parseSafeInteger = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : Number.NaN
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return Number.NaN
  }

  const parsedValue = Number(value.trim())
  return Number.isSafeInteger(parsedValue) ? parsedValue : Number.NaN
}

const isInstalledVersionCodeValid = (value) => {
  const installedVersionCode = parseSafeInteger(value)
  return (
    Number.isSafeInteger(installedVersionCode) && installedVersionCode > 0
  )
}

const normalizePlayUpdateStatus = (value) => {
  return Object.values(PLAY_UPDATE_STATUS).includes(value)
    ? value
    : PLAY_UPDATE_STATUS.UNKNOWN
}

const normalizeRemotePolicyStatus = (value) => {
  return Object.values(REMOTE_POLICY_STATUS).includes(value)
    ? value
    : REMOTE_POLICY_STATUS.UNKNOWN
}

const transientDecision = (previousCheckSucceeded, reason) => ({
  action: previousCheckSucceeded ? 'preserve' : 'retry',
  reason,
})

export function normalizeAppUpdatePolicy(value = {}) {
  const minimumVersionCode = parseSafeInteger(value?.minimumVersionCode)

  return {
    forceUpdate: value?.forceUpdate === true,
    minimumVersionCode:
      Number.isSafeInteger(minimumVersionCode) && minimumVersionCode > 0
        ? minimumVersionCode
        : 0,
  }
}

export function isValidAppUpdatePolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  if (typeof value.forceUpdate !== 'boolean') {
    return false
  }

  const minimumVersionCode = parseSafeInteger(value.minimumVersionCode)

  if (!Number.isSafeInteger(minimumVersionCode) || minimumVersionCode < 0) {
    return false
  }

  return !value.forceUpdate || minimumVersionCode > 0
}

export function isMandatoryAppUpdate(policy, currentVersionCode) {
  const normalizedPolicy = normalizeAppUpdatePolicy(policy)
  const installedVersionCode = parseSafeInteger(currentVersionCode)

  return Boolean(
    normalizedPolicy.forceUpdate &&
      normalizedPolicy.minimumVersionCode > 0 &&
      isInstalledVersionCodeValid(installedVersionCode) &&
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
  playStatus = PLAY_UPDATE_STATUS.UNKNOWN,
  remotePolicyStatus = REMOTE_POLICY_STATUS.UNKNOWN,
  previousCheckSucceeded = false,
  allPlayUpdatesMandatory = true,
  debugPlayCheckBypassed = false,
} = {}) {
  const normalizedPlayStatus = normalizePlayUpdateStatus(playStatus)
  const normalizedRemotePolicyStatus =
    normalizeRemotePolicyStatus(remotePolicyStatus)

  if (
    allPlayUpdatesMandatory &&
    normalizedPlayStatus === PLAY_UPDATE_STATUS.AVAILABLE
  ) {
    return { action: 'require', reason: 'play' }
  }

  if (isMandatoryAppUpdate(policy, currentVersionCode)) {
    return { action: 'require', reason: 'policy' }
  }

  if (!isInstalledVersionCodeValid(currentVersionCode)) {
    return transientDecision(previousCheckSucceeded, 'version-unavailable')
  }

  if (!isValidAppUpdatePolicy(policy)) {
    return transientDecision(previousCheckSucceeded, 'policy-invalid')
  }

  if (normalizedRemotePolicyStatus !== REMOTE_POLICY_STATUS.VERIFIED) {
    return transientDecision(
      previousCheckSucceeded,
      normalizedRemotePolicyStatus === REMOTE_POLICY_STATUS.CACHE
        ? 'policy-cache-unverified'
        : 'policy-status-unknown',
    )
  }

  if (
    allPlayUpdatesMandatory &&
    normalizedPlayStatus === PLAY_UPDATE_STATUS.UNKNOWN &&
    !debugPlayCheckBypassed
  ) {
    return transientDecision(previousCheckSucceeded, 'play-status-unknown')
  }

  return {
    action: 'allow',
    reason:
      normalizedPlayStatus === PLAY_UPDATE_STATUS.UNKNOWN &&
      debugPlayCheckBypassed
        ? 'debug-play-bypass'
        : 'up-to-date',
  }
}
