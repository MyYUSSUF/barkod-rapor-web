export function shouldRequestNativeNotificationPermission({
  permission,
  alreadyAsked = false,
  updateBlocked = false,
} = {}) {
  const canPrompt =
    permission === 'prompt' || permission === 'prompt-with-rationale'

  return canPrompt && !alreadyAsked && !updateBlocked
}
