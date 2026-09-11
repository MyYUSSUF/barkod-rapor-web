import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { advanceSessionLifecycle, isAuthSessionUser, isSessionLifecycleCurrent } from '../src/lib/sessionLifecycle.js'

// Gerçek App auth/reset/login/restore fonksiyonları; ağ ve React sınırları sentetiktir.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, 'App function markers must exist')
  return source.slice(start, end)
}
const compile = new Function('env', `with (env) {
  ${section('  const cancelReportRequest = () => {', '  const makeAuthorizedHeaders =')}
  ${section('  const resetUserState = () => {', '  const makeDisplayName =')}
  ${section('  async function cleanupAndSignOutCurrentUser({', '  const handleLogin =')}
  ${section('  const handleLogin = async (e) => {', '  const performLogout =')}
  ${section('    const restoreSession = async () => {', '\n    restoreSession()')}
  ${section('    const { data } = supabase.auth.onAuthStateChange', '    return () => {')}
  return { handleLogin, restoreSession };
}`)
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const profile = (id) => ({ data: { id, role: 'user', is_active: true } })
const session = (id) => id ? { user: { id }, access_token: `synthetic-token-${id}` } : null

function harness() {
  const effects = []
  const signedOut = []
  const audits = []
  const profileCalls = []
  let authCallback
  const env = {
    advanceSessionLifecycle, isAuthSessionUser, isSessionLifecycleCurrent,
    notificationSessionRef: { current: { generation: 0, userId: '' } },
    reportRequestRef: { current: null }, loginRequestRef: { current: null },
    restoreRequestRef: { current: null }, logoutInProgressRef: { current: false },
    isSupabaseConfigured: true, activeSession: null,
    username: 'user-a', password: 'synthetic', screen: 'desktop-admin',
    loading: false, restoringSession: true, userProfile: null,
    window: { location: { pathname: '/yonetim' } }, DESKTOP_ADMIN_PATH: '/yonetim',
    t: new Proxy({}, { get: (_, name) => String(name) }),
    stopScanner() {}, clearUserMessage: () => effects.push(['clear']),
    showUserMessage: (...args) => effects.push(['message', ...args]),
    fetchProfileById: async (id) => profile(id),
    checkDeviceAccess: async () => ({ approved: true }),
    writeAuditLog: async (_payload, token) => { audits.push(token) },
    getDeviceName: () => 'Synthetic browser', APP_LOG_VERSION: 'synthetic',
    getDeviceAccessMessage: () => 'device denied', makeDisplayName: () => 'Synthetic user',
    localStorage: {}, readBarcodeHistory: () => [],
    requestNotificationPermissionOnce: async () => 'denied', registerPushSubscription: async () => {},
    unregisterCurrentNotificationSubscription: async () => {},
  }
  for (const [, name] of source.matchAll(/\b(set[A-Z]\w*)\(/g)) {
    env[name] ??= (value) => {
      env[name[3].toLowerCase() + name.slice(4)] = value
      effects.push([name, value])
    }
  }
  const emit = (event, id) => {
    env.activeSession = session(id)
    authCallback(event, env.activeSession)
  }
  env.supabase = { auth: {
    onAuthStateChange(callback) {
      authCallback = callback
      return { data: { subscription: { unsubscribe() {} } } }
    },
    async signInWithPassword({ email }) {
      // Supabase gerçek sırası: SIGNED_IN callback'i auth yanıtından önce çalışır.
      emit('SIGNED_IN', email.split('@')[0])
      return { data: { user: env.activeSession.user, session: env.activeSession } }
    },
    async getSession() { return { data: { session: env.activeSession } } },
    async signOut() {
      signedOut.push(env.activeSession?.user.id)
      emit('SIGNED_OUT', null)
      return {}
    },
  } }
  const methods = compile(env)
  const login = (id) => {
    env.username = id
    env.password = 'synthetic'
    return methods.handleLogin({ preventDefault() {} })
  }
  const deferProfile = (id) => {
    const pending = deferred()
    env.fetchProfileById = (userId) => {
      profileCalls.push(userId)
      return userId === id ? pending.promise : Promise.resolve(profile(userId))
    }
    return pending
  }
  return { env, effects, signedOut, audits, profileCalls, emit, login, deferProfile, ...methods }
}

async function flushUntil(predicate) {
  for (let index = 0; index < 40 && !predicate(); index++) await Promise.resolve()
  assert.ok(predicate(), 'expected async checkpoint was reached')
}

test('/yonetim login keeps its route and busy state until profile validation completes', async () => {
  const h = harness()
  const pending = h.deferProfile('user-a')
  const login = h.login('user-a')
  await flushUntil(() => h.profileCalls.length === 1)
  assert.equal(h.env.screen, 'desktop-admin')
  assert.equal(h.env.loading, true)
  assert.equal(h.env.userProfile, null)
  pending.resolve(profile('user-a'))
  await login
  assert.equal(h.env.screen, 'desktop-admin')
  assert.equal(h.env.userProfile.id, 'user-a')
  assert.equal(h.env.loading, false)
})

test('/yonetim initial session keeps the restore screen and route through validation', async () => {
  const h = harness()
  const pending = h.deferProfile('user-a')
  h.emit('INITIAL_SESSION', 'user-a')
  assert.equal(h.env.restoringSession, true)
  const restore = h.restoreSession()
  await flushUntil(() => h.profileCalls.length === 1)
  assert.equal(h.env.restoringSession, true)
  assert.equal(h.env.screen, 'desktop-admin')
  pending.resolve(profile('user-a'))
  await restore
  assert.equal(h.env.userProfile.id, 'user-a')
  assert.equal(h.env.screen, 'desktop-admin')
  assert.equal(h.env.restoringSession, false)
})

for (const kind of ['login', 'restore']) {
  for (const outcome of ['profile-error', 'rejection', 'success']) {
    test(`stale ${kind} ${outcome} cannot change or sign out a newer login`, async () => {
      const h = harness()
      const pending = h.deferProfile('user-a')
      if (kind === 'restore') h.emit('INITIAL_SESSION', 'user-a')
      const first = kind === 'restore' ? h.restoreSession() : h.login('user-a')
      await flushUntil(() => h.profileCalls.length === 1)
      await h.login('user-b')
      assert.equal(h.env.userProfile.id, 'user-b')
      const baseline = h.effects.length
      if (outcome === 'rejection') pending.reject(new Error('stale failure'))
      else pending.resolve(outcome === 'success' ? profile('user-a') : { data: null, error: new Error('stale profile error') })
      await first
      assert.equal(h.env.activeSession.user.id, 'user-b')
      assert.equal(h.env.userProfile.id, 'user-b')
      assert.equal(h.effects.length, baseline, 'stale completion must not change current UI')
      assert.deepEqual(h.signedOut, [])
      assert.deepEqual(h.audits, ['synthetic-token-user-b'])
    })
  }
}

test('stale login completion cannot clear a newer login busy state', async () => {
  const h = harness()
  const a = deferred()
  const b = deferred()
  h.env.fetchProfileById = (id) => { h.profileCalls.push(id); return id === 'user-a' ? a.promise : b.promise }
  const first = h.login('user-a')
  await flushUntil(() => h.profileCalls.length === 1)
  const second = h.login('user-b')
  await flushUntil(() => h.profileCalls.length === 2)
  a.resolve({ data: null, error: new Error('stale profile error') })
  await first
  assert.equal(h.env.loading, true)
  assert.deepEqual(h.signedOut, [])
  b.resolve(profile('user-b'))
  await second
  assert.equal(h.env.loading, false)
  assert.equal(h.env.userProfile.id, 'user-b')
})

for (const kind of ['login', 'restore']) {
  test(`${kind} cannot reuse a same-account session after external logout and relogin`, async () => {
    const h = harness()
    const pending = h.deferProfile('user-a')
    if (kind === 'restore') h.emit('INITIAL_SESSION', 'user-a')
    const first = kind === 'restore' ? h.restoreSession() : h.login('user-a')
    await flushUntil(() => h.profileCalls.length === 1)
    h.emit('SIGNED_OUT', null)
    h.emit('SIGNED_IN', 'user-a')
    pending.resolve({ data: null, error: new Error('old session profile error') })
    await first
    assert.equal(h.env.activeSession.user.id, 'user-a')
    assert.equal(h.env.userProfile, null)
    assert.deepEqual(h.signedOut, [])
    assert.deepEqual(h.audits, [])
    assert.equal(h.effects.filter(([effect]) => effect === 'message').length, 0)
  })
}

test('current login profile rejection still signs out and explains the failure', async () => {
  const h = harness()
  h.env.fetchProfileById = async () => ({ data: null, error: new Error('profile unavailable') })
  await h.login('user-a')
  assert.deepEqual(h.signedOut, ['user-a'])
  assert.equal(h.env.activeSession, null)
  assert.equal(h.env.loading, false)
  assert.ok(h.effects.some(([effect, message]) => effect === 'message' && message === 'profileNotFound'))
})
