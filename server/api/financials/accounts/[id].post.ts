// Rename a category, move it to another line, or mark it intercompany: saved figures and linked sheets follow.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const id = String(getRouterParam(event, 'id') ?? '')
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), parent: z.string().max(40).optional(), intercompany: z.boolean().optional() }).safeParse(await readBody(event))
  if (!b.success || !/^[0-9a-f-]{36}$/.test(id) || (b.data.parent && !LINE_KEYS.includes(b.data.parent))) throw apiError('invalid', 'Check the category.')
  const a = (await db().query<{ name: string; parent: string }>('SELECT name, parent FROM financials.accounts WHERE id = $1', [id])).rows[0]
  if (!a) throw apiError('not_found', 'Not found', 404)
  const name = (b.data.name ?? a.name).replace(/\s+/g, ' '), parent = b.data.parent ?? a.parent
  if (name.toLowerCase() !== a.name.toLowerCase() && (await db().query('SELECT 1 FROM financials.accounts WHERE lower(name) = lower($1)', [name])).rowCount) throw apiError('taken', 'You already have a category with that name.', 409)
  await db().query('UPDATE financials.accounts SET name = $2, parent = $3, updated_at = now() WHERE id = $1', [id, name, parent])
  // Intercompany: amounts the group companies owe or bill each other, taken out of the group view.
  if (b.data.intercompany !== undefined) await db().query('UPDATE financials.accounts SET intercompany = $2 WHERE id = $1', [id, b.data.intercompany])
  const oldK = a.parent + '|' + a.name, newK = parent + '|' + name
  if (oldK !== newK) {
    // Figures keep their category; the line it rolls into is worked out again when sheets next sync.
    await db().query(`UPDATE financials.statements SET detail = (detail - $1::text) || jsonb_build_object($2::text, detail->$1::text) WHERE detail ? $1::text`, [oldK, newK])
    await db().query(`UPDATE financials.sheet_links SET mapping = replace(mapping::text, $1, $2)::jsonb, ai_map = CASE WHEN ai_map IS NULL THEN NULL ELSE replace(ai_map::text, $1, $2)::jsonb END WHERE mapping::text LIKE '%' || $1 || '%' OR coalesce(ai_map::text, '') LIKE '%' || $1 || '%'`, [JSON.stringify('cat:' + a.parent + ':' + a.name), JSON.stringify('cat:' + parent + ':' + name)])
  }
  await audit({ event, actorUserId: user.userId, action: 'financials.account_edit', objectType: 'account', objectId: id, detail: { from: oldK, to: newK, ...(b.data.intercompany !== undefined ? { intercompany: b.data.intercompany } : {}) } })
  return { ok: true }
})
