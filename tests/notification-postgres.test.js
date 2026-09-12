import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import {
  claimNotificationRun, beginNotificationRun, markNotificationSending,
  finishNotificationRun, failNotificationRun, markNotificationDispatchUnknown,
} from '../api/_notification-run.js'
import { NotificationReadError } from '../api/_notification-retry.js'

// PostgreSQL/WASM enforces real SQL constraints, unlike a row-map mock.
// This intentionally has no server, port, data directory or Supabase credentials.
// It does not claim to test PostgREST or multi-connection PostgreSQL scheduling.
const AUTO = '11111111-1111-4111-8111-111111111111'
const WHEN = '2026-09-12T04:30:00Z'
const TABLE = 'notification_automation_runs'

function postgresAdapter(pg) {
  const identifier = (value) => {
    assert.match(value, /^[a-z_]+$/)
    return `"${value}"`
  }
  return {
    from(table) {
      assert.equal(table, TABLE)
      let operation = 'select', values, single = false, signal
      const filters = []
      const query = {
        select() { return query },
        abortSignal(value) { signal = value; return query },
        insert(value) { operation = 'insert'; values = value; return query },
        update(value) { operation = 'update'; values = value; return query },
        eq(column, value) { filters.push({ column, values: [value] }); return query },
        in(column, values) { filters.push({ column, values }); return query },
        single() { single = true; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            signal?.throwIfAborted()
            const params = []
            const bind = (value) => {
              params.push(value && typeof value === 'object' ? JSON.stringify(value) : value)
              return `$${params.length}`
            }
            const where = () => filters.length ? ` WHERE ${filters.map((filter) => {
              const [column, key] = filter.column.split('->>')
              if (key) assert.match(key, /^[a-zA-Z]+$/)
              const field = identifier(column) + (key ? `->>'${key}'` : '')
              return `${field} IN (${filter.values.map(bind).join(', ')})`
            }).join(' AND ')}` : ''
            let sql
            if (operation === 'insert') {
              sql = `INSERT INTO ${TABLE} (${Object.keys(values).map(identifier).join(', ')}) VALUES (${Object.values(values).map(bind).join(', ')}) RETURNING *`
            } else if (operation === 'update') {
              sql = `UPDATE ${TABLE} SET ${Object.entries(values).map(([key, value]) => `${identifier(key)} = ${bind(value)}`).join(', ')}${where()} RETURNING *`
            } else sql = `SELECT * FROM ${TABLE}${where()}`
            try {
              const { rows } = await pg.query(sql, params)
              return { data: single ? rows[0] || null : rows, error: null }
            } catch (error) {
              return { data: null, error: { code: error.code } }
            }
          }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

test('notification run lifecycle satisfies the real PostgreSQL CHECK constraint', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error('External network is forbidden') })
  const pg = new PGlite()
  t.after(() => pg.close())
  await pg.waitReady
  await pg.exec(`
    CREATE TABLE notification_automation_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      automation_id uuid NOT NULL,
      scheduled_for timestamptz NOT NULL,
      status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
      total integer NOT NULL DEFAULT 0,
      sent integer NOT NULL DEFAULT 0,
      failed integer NOT NULL DEFAULT 0,
      response jsonb,
      error text,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      UNIQUE (automation_id, scheduled_for),
      CONSTRAINT notification_automation_runs_counts_check
        CHECK (total >= 0 AND sent >= 0 AND failed >= 0 AND sent + failed = total)
    );
  `)
  const db = postgresAdapter(pg)
  const begin = (claim) => beginNotificationRun(db, {
    automationId: AUTO, automationRunId: claim.id, automationAttemptToken: claim.token,
  })
  const read = async (id) => (await pg.query(`SELECT * FROM ${TABLE} WHERE id=$1`, [id])).rows[0]
  let minute = 0
  const occurrence = () => new Date(Date.parse(WHEN) + minute++ * 60_000).toISOString()
  t.diagnostic((await pg.query('SELECT version() AS version')).rows[0].version)

  await t.test('old sending write fails with 23514; fixed gate and partial completion succeed', async () => {
    const run = await begin(await claimNotificationRun(db, AUTO, occurrence()))
    await assert.rejects(pg.query(`UPDATE ${TABLE} SET total=3, sent=0, failed=0 WHERE id=$1`, [run.id]), { code: '23514' })
    await markNotificationSending(db, run, 3)
    const pending = await read(run.id)
    assert.deepEqual([pending.total, pending.sent, pending.failed], [0, 0, 0])
    assert.equal(pending.response.plannedTotal, 3)
    assert.equal(pending.response.sendingStarted, true)
    await finishNotificationRun(db, run, { total: 3, sent: 2, failed: 1 })
    const finished = await read(run.id)
    assert.equal(finished.status, 'completed')
    assert.deepEqual([finished.total, finished.sent, finished.failed], [3, 2, 1])
  })

  await t.test('zero-target and all-failed results remain valid and are never retried', async () => {
    for (const total of [0, 2]) {
      const when = occurrence()
      const run = await begin(await claimNotificationRun(db, AUTO, when))
      if (total) await markNotificationSending(db, run, total)
      await finishNotificationRun(db, run, { total, sent: 0, failed: total })
      assert.equal((await read(run.id)).status, total ? 'failed' : 'completed')
      assert.equal(await claimNotificationRun(db, AUTO, when), null)
    }
  })

  await t.test('SQL uniqueness and JSON predicates admit one claim and reject stale tokens', async () => {
    const when = occurrence()
    const claims = await Promise.all(Array.from({ length: 4 }, () => claimNotificationRun(db, AUTO, when)))
    assert.equal(claims.filter(Boolean).length, 1)
    const first = await begin(claims.find(Boolean))
    await failNotificationRun(db, first, new NotificationReadError('READ_UNAVAILABLE', true))
    const reclaimed = await claimNotificationRun(db, AUTO, when)
    assert.equal(reclaimed.attempt, 2)
    await assert.rejects(markNotificationSending(db, first, 1), { code: 'RUN_CONFLICT' })
    const current = await begin(reclaimed)
    await markNotificationSending(db, current, 1)
    await markNotificationDispatchUnknown(db, reclaimed)
    assert.equal((await read(current.id)).response.sendingStarted, true)
    assert.equal(await claimNotificationRun(db, AUTO, when), null)
    await finishNotificationRun(db, current, { total: 1, sent: 1, failed: 0 })
    assert.equal((await read(current.id)).status, 'completed')
  })

  await t.test('invalid terminal totals preserve PostgreSQL code and leave the row unchanged', async () => {
    const run = await begin(await claimNotificationRun(db, AUTO, occurrence()))
    await markNotificationSending(db, run, 2)
    const before = await read(run.id)
    await assert.rejects(finishNotificationRun(db, run, { total: 2, sent: 1, failed: 0 }), {
      code: 'RUN_WRITE_UNCERTAIN', databaseCode: '23514',
    })
    assert.deepEqual(await read(run.id), before)
    await failNotificationRun(db, run, new Error('synthetic unconfirmed result'))
    assert.equal((await read(run.id)).response.retryable, false)
  })
})
