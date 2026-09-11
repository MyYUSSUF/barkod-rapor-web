import assert from 'node:assert/strict'
import test from 'node:test'
import { allowDeviceWithoutApproval, requestDeviceAccess, verifyApprovedDeviceRequest } from '../api/_device-auth.js'
import { approvePendingDevice } from '../api/_device-registry.js'

const req = { headers: { 'x-device-token': 'synthetic-device-token-with-32-characters' } }
const fakeUser = (rpc) => async () => ({ ok: true, userId: 'synthetic-user', profile: { role: 'user' }, supabase: { rpc } })

test('auto approval requires a confirmed successful registration', async () => {
  for (const status of ['missing', 'pending']) {
    assert.equal(await allowDeviceWithoutApproval({ status }, async () => true), 'approved')
    assert.equal(await allowDeviceWithoutApproval({ status }, async () => false), 'unavailable')
    assert.equal(await allowDeviceWithoutApproval({ status }, async () => { throw new Error('synthetic-db-error') }), 'unavailable')
  }
})

test('revoked and unknown device states never invoke auto approval', async () => {
  let called = false
  for (const [status, expected] of [['revoked', 'revoked'], ['unknown-value', 'unavailable'], ['approved', 'approved']]) {
    assert.equal(await allowDeviceWithoutApproval({ status }, async () => { called = true; return true }), expected)
  }
  assert.equal(called, false)
})

test('device access handlers fail closed on malformed results, RPC errors and approval failures', async () => {
  for (const rpcResult of [{ data: null }, { data: [] }, { data: { status: 'unexpected' } }, { error: { message: 'PRIVATE_DB_ERROR' } }, { data: [{ status: 'missing' }] }]) {
    const deps = { verifyUser: fakeUser(async () => rpcResult), approveDevice: async () => false }
    for (const result of [await verifyApprovedDeviceRequest(req, deps), await requestDeviceAccess(req, 'synthetic', deps)]) {
      assert.equal(result.ok, false)
      assert.equal(result.statusCode, 503)
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_DB_ERROR/)
    }
  }
})

test('valid registered devices still work and revoked devices remain rejected', async () => {
  for (const status of ['approved', 'revoked']) {
    const result = await verifyApprovedDeviceRequest(req, { verifyUser: fakeUser(async () => ({ data: [{ status }] })) })
    assert.equal(result.ok, status === 'approved')
    assert.equal(result.deviceStatus, status)
  }
})

test('oversized device tokens never reach database hashing/lookup', async () => {
  let called = false
  const result = await verifyApprovedDeviceRequest({ headers: { 'x-device-token': 'a'.repeat(513) } }, { verifyUser: fakeUser(async () => { called = true }) })
  assert.equal(result.ok, false)
  assert.equal(called, false)
})

test('registry update cannot undo revocation occurring after its initial lookup', async () => {
  const filters = []
  let status = 'pending'
  let lookup = true
  const builder = {
    select() { return this }, eq() { return this },
    neq(field, value) { filters.push([field, value]); return this },
    update() { status = 'revoked'; return this },
    async maybeSingle() {
      if (lookup) { lookup = false; return { data: { id: 'synthetic-device', status } } }
      const prevented = filters.some(([field, value]) => field === 'status' && value === status)
      return { data: prevented ? null : { id: 'synthetic-device' } }
    },
  }
  assert.equal(await approvePendingDevice('synthetic-user', 'synthetic-hash', '', { from: () => builder }), false)
  assert.deepEqual(filters, [['status', 'revoked']])
  assert.equal(status, 'revoked')
})
