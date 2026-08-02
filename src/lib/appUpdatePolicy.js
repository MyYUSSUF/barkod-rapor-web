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
