import { randomUUID } from 'node:crypto'

// Executes each write atomically, including every PostgREST WHERE predicate.
// This is a deterministic race simulator, not a live PostgreSQL integration test.
export function notificationMemoryDb(automations = []) {
  const rows = new Map()
  const writes = []
  const db = {
    rows, writes, failure: null,
    from(table) {
      let operation = 'select', values, single = false
      const filters = []
      const valueAt = (row, column) => {
        const [key, jsonKey] = column.split('->>')
        return jsonKey ? row[key]?.[jsonKey] == null ? null : String(row[key][jsonKey]) : row[key]
      }
      const query = {
        select() { return query },
        abortSignal() { return query },
        insert(value) { operation = 'insert'; values = structuredClone(value); return query },
        update(value) { operation = 'update'; values = structuredClone(value); return query },
        eq(column, value) { filters.push((row) => valueAt(row, column) === value); return query },
        in(column, value) { filters.push((row) => value.includes(valueAt(row, column))); return query },
        single() { single = true; return query },
        maybeSingle() { single = true; return query },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const forced = db.failure?.({ table, operation, values })
            if (forced) return forced
            if (table === 'notification_automations') return { data: automations.filter((row) => filters.every((f) => f(row))), error: null }
            if (table !== 'notification_automation_runs') throw Error(`Unexpected table ${table}`)
            let result
            if (operation === 'insert') {
              if ([...rows.values()].some((row) => row.automation_id === values.automation_id && row.scheduled_for === values.scheduled_for)) {
                return { data: null, error: { code: '23505' } }
              }
              const row = { id: randomUUID(), total: 0, sent: 0, failed: 0, ...values }
              rows.set(row.id, row)
              result = [row]
              writes.push(structuredClone(row))
            } else {
              result = [...rows.values()].filter((row) => filters.every((f) => f(row)))
              if (operation === 'update') result.forEach((row) => {
                Object.assign(row, values)
                writes.push(structuredClone(row))
              })
            }
            return { data: structuredClone(single ? result[0] || null : result), error: null }
          }).then(resolve, reject)
        },
      }
      return query
    },
  }
  return db
}
