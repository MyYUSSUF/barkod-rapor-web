import test from 'node:test'
import assert from 'node:assert/strict'

import handler from '../api/app-version.js'

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.body = value
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

test('Android WebView kaynagina surum politikasi CORS izni verir', () => {
  const previousForceUpdate = process.env.ANDROID_FORCE_UPDATE
  const previousMinimumVersionCode = process.env.ANDROID_MIN_VERSION_CODE

  process.env.ANDROID_FORCE_UPDATE = 'true'
  process.env.ANDROID_MIN_VERSION_CODE = '16'

  try {
    const req = {
      method: 'GET',
      headers: { origin: 'https://localhost' },
    }
    const res = createResponse()

    handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://localhost')
    assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0')
    assert.deepEqual(res.body, {
      forceUpdate: true,
      minimumVersionCode: 16,
    })
  } finally {
    if (previousForceUpdate === undefined) {
      delete process.env.ANDROID_FORCE_UPDATE
    } else {
      process.env.ANDROID_FORCE_UPDATE = previousForceUpdate
    }

    if (previousMinimumVersionCode === undefined) {
      delete process.env.ANDROID_MIN_VERSION_CODE
    } else {
      process.env.ANDROID_MIN_VERSION_CODE = previousMinimumVersionCode
    }
  }
})

test('Surum politikasi desteklenmeyen metodu reddeder', () => {
  const req = {
    method: 'POST',
    headers: { origin: 'https://localhost' },
  }
  const res = createResponse()

  handler(req, res)

  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.Allow, 'GET, OPTIONS')
})

test('iOS icin ayri zorunlu guncelleme politikasini dondurur', () => {
  const previousForceUpdate = process.env.IOS_FORCE_UPDATE
  const previousMinimumBuild = process.env.IOS_MIN_BUILD_NUMBER
  process.env.IOS_FORCE_UPDATE = 'true'
  process.env.IOS_MIN_BUILD_NUMBER = '2'

  try {
    const req = {
      method: 'GET',
      headers: { origin: 'capacitor://localhost' },
      query: { platform: 'ios' },
    }
    const res = createResponse()

    handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      forceUpdate: true,
      minimumVersionCode: 2,
    })
  } finally {
    if (previousForceUpdate === undefined) delete process.env.IOS_FORCE_UPDATE
    else process.env.IOS_FORCE_UPDATE = previousForceUpdate

    if (previousMinimumBuild === undefined) delete process.env.IOS_MIN_BUILD_NUMBER
    else process.env.IOS_MIN_BUILD_NUMBER = previousMinimumBuild
  }
})

test('bilinmeyen uygulama platformunu reddeder', () => {
  const req = {
    method: 'GET',
    headers: {},
    query: { platform: 'windows' },
  }
  const res = createResponse()

  handler(req, res)

  assert.equal(res.statusCode, 400)
})

test('Surum kodu yalnizca tam pozitif sayi olarak kabul edilir', () => {
  const previousMinimumVersionCode = process.env.ANDROID_MIN_VERSION_CODE
  process.env.ANDROID_MIN_VERSION_CODE = '16-invalid'

  try {
    const req = { method: 'GET', headers: {} }
    const res = createResponse()

    handler(req, res)

    assert.equal(res.body.minimumVersionCode, 0)
  } finally {
    if (previousMinimumVersionCode === undefined) {
      delete process.env.ANDROID_MIN_VERSION_CODE
    } else {
      process.env.ANDROID_MIN_VERSION_CODE = previousMinimumVersionCode
    }
  }
})

test('Surum politikasi OPTIONS istegini govdesiz tamamlar', () => {
  const req = {
    method: 'OPTIONS',
    headers: { origin: 'https://localhost' },
  }
  const res = createResponse()

  handler(req, res)

  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://localhost')
})
