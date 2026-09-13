import dns from 'node:dns'
import { Agent } from 'node:https'
import { BlockList, isIP } from 'node:net'

// Provider-owned domains only, never arbitrary tenant/customer domains.
// Current ELVAN subscriptions use Google, Apple and Windows; retain Firefox support.
function allowedHost(host) {
  return host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
    host === 'push.services.mozilla.com' ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.push\.services\.mozilla\.com$/.test(host) ||
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.notify\.windows\.com$/.test(host)
}

function blocked(code = 'WEB_PUSH_ENDPOINT_BLOCKED') {
  const error = new Error('Web Push hedefi güvenli olarak doğrulanamadı.')
  error.code = code
  return error
}

export function safeWebPushSubscription(subscription) {
  const endpoint = subscription?.endpoint
  // Reject parser ambiguities before URL canonicalization. Never log this input.
  if (typeof endpoint !== 'string' || endpoint.length > 4096 ||
      /[\s\\#]/u.test(endpoint) || [...endpoint].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw blocked()
  let url
  try { url = new URL(endpoint) } catch { throw blocked() }
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !allowedHost(url.hostname)) throw blocked()
  // web-push uses the legacy Node URL parser; send this canonical URL, not the input.
  return { endpoint: url.href, keys: subscription.keys, expirationTime: subscription.expirationTime }
}

const nonPublic = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
]) nonPublic.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
]) nonPublic.addSubnet(address, prefix, 'ipv6')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')

export function isPublicPushAddress(address) {
  const family = isIP(address)
  if (family === 4) return !nonPublic.check(address, 'ipv4')
  // Excludes mapped IPv4, local/link-local, multicast and translation ranges.
  return family === 6 && globalV6.check(address, 'ipv6') && !nonPublic.check(address, 'ipv6')
}

export function createWebPushAgent({ lookup = dns.lookup, lookupTimeoutMs = 2000 } = {}) {
  return new Agent({
    keepAlive: true, maxSockets: 10, maxFreeSockets: 2, timeout: 10_000,
    rejectUnauthorized: true, proxyEnv: {},
    // Validate the exact addresses used by the socket, not a separate DNS preflight.
    // Reject the entire answer if any candidate is private (including mixed A/AAAA).
    lookup(hostname, options, callback) {
      if (!allowedHost(hostname)) return callback(blocked())
      let settled = false
      const timer = setTimeout(() => done(blocked('WEB_PUSH_DNS_TIMEOUT')), lookupTimeoutMs)
      function done(error, records) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) return callback(error)
        if (options?.all) callback(null, records)
        else callback(null, records[0].address, records[0].family)
      }
      try {
        lookup(hostname, { all: true, family: 0 }, (error, records) => {
          if (settled) return
          if (error || !Array.isArray(records) || !records.length) {
            return done(blocked('WEB_PUSH_DNS_UNAVAILABLE'))
          }
          if (records.some((r) => !isPublicPushAddress(r.address) || isIP(r.address) !== r.family)) {
            return done(blocked('WEB_PUSH_ADDRESS_BLOCKED'))
          }
          const family = typeof options === 'number' ? options : options?.family
          const selected = records.filter((r) => !family || r.family === family)
          if (!selected.length) return done(blocked('WEB_PUSH_DNS_UNAVAILABLE'))
          done(null, selected)
        })
      } catch { done(blocked('WEB_PUSH_DNS_UNAVAILABLE')) }
    },
  })
}

// No proxy and no redirect following: web-push uses a single https.request.
export const webPushAgent = createWebPushAgent()
