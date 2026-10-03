// Delete a record (see server/utils/records.ts). Refuses, with a reason, when other records still depend on it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const type = String(getRouterParam(event, 'type') ?? '')
  const def = RECORDS[type]
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!def || !id.success) throw apiError('not_found', 'Not found', 404)
  await requireModule(event, def.module)
  if (!def.roles.some((r) => user.roles.includes(r))) throw apiError('forbidden', 'You do not have permission to delete this.', 403)
  const row = (await db().query<{ name: string; storage_key?: string }>('SELECT ' + def.name + ' AS name' + (def.storage ? ', storage_key' : '') + ' FROM ' + def.table + ' WHERE id = $1', [id.data])).rows[0]
  if (!row) throw apiError('not_found', 'Not found', 404)
  if (def.guard && (await db().query(def.guard.sql, [id.data])).rowCount) throw apiError('kept', def.guard.message, 409)
  const linked: string[] = []
  for (const [sql, label] of def.blockers ?? []) {
    const n = Number((await db().query<{ count: string }>(sql, [id.data])).rows[0]?.count ?? 0)
    if (n) linked.push(n + ' ' + label + (n === 1 ? '' : 's'))
  }
  if (linked.length) throw apiError('linked', row.name + ' still has ' + linked.join(', ') + '. Delete or move those first.', 409)
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    for (const sql of def.children ?? []) await client.query(sql, [id.data])
    await client.query('DELETE FROM ' + def.table + ' WHERE id = $1', [id.data])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    if ((err as { code?: string }).code === '23503') throw apiError('linked', row.name + ' is still linked to other records, so it was not deleted.', 409)
    throw err
  } finally { client.release() }
  if (def.storage && row.storage_key) { try { await deleteObject(row.storage_key) } catch (err) { console.error('[records] stored file not removed', err) } }
  await audit({ event, actorUserId: user.userId, action: 'record.delete', objectType: type, objectId: id.data, detail: { name: row.name } })
  return { ok: true }
})
