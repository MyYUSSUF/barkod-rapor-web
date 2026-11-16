export function startForegroundPolling({
  check,
  intervalMs,
  documentObject = document,
  timers = window,
  initiallyActive = true,
}) {
  let stopped = false
  let appActive = initiallyActive
  let foreground = false
  let intervalId = null
  let running = false
  let resumePending = false
  const isForeground = () => !stopped && foreground

  const run = async () => {
    if (!isForeground() || running) return
    running = true
    try {
      await check({ isForeground })
    } finally {
      running = false
      if (resumePending) {
        resumePending = false
        if (isForeground()) void run()
      }
    }
  }

  const update = () => {
    const next = !stopped && appActive && documentObject.visibilityState === 'visible'
    if (next === foreground) return
    foreground = next
    if (intervalId !== null) timers.clearInterval(intervalId)
    intervalId = null
    resumePending = false
    if (foreground) {
      if (running) resumePending = true
      else void run()
      intervalId = timers.setInterval(run, intervalMs)
    }
  }

  documentObject.addEventListener('visibilitychange', update)
  update()
  return {
    setAppActive(value) {
      appActive = value === true
      update()
    },
    stop() {
      stopped = true
      update()
      documentObject.removeEventListener('visibilitychange', update)
    },
  }
}
