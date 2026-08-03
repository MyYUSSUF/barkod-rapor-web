export function getFcmToken(subscription) {
  if (typeof subscription?.token === 'string') {
    return subscription.token.trim()
  }

  const payload = subscription?.subscription

  if (payload?.type === 'fcm' && typeof payload.token === 'string') {
    return payload.token.trim()
  }

  if (
    typeof subscription?.endpoint === 'string' &&
    subscription.endpoint.startsWith('fcm:')
  ) {
    return subscription.endpoint.slice(4).trim()
  }

  return ''
}

export function partitionNotificationSubscriptions(subscriptions = []) {
  const webSubscriptions = []
  const nativeSubscriptions = []

  for (const subscription of subscriptions) {
    if (getFcmToken(subscription)) {
      nativeSubscriptions.push(subscription)
    } else {
      webSubscriptions.push(subscription)
    }
  }

  return {
    webSubscriptions,
    nativeSubscriptions,
  }
}

export function isPermanentFcmFailure(errorCode) {
  return errorCode === 'messaging/registration-token-not-registered'
}
