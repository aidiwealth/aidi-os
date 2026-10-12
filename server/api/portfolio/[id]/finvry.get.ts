// The Finvry workspace linked to a portfolio company and its sent investor updates (with what was already imported).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const c = (await db().query<{ finvry_org_id: string | null; finvry_new_update: string | null }>('SELECT finvry_org_id, finvry_new_update FROM portfolio.companies WHERE id = $1', [id.data])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  if (!c.finvry_org_id) return { linked: null, updates: [] }
  const ws = (await asPlatform(() => db().query<{ id: string; name: string }>('SELECT id, name FROM core.organizations WHERE id = $1', [c.finvry_org_id]))).rows[0] ?? null
  const done = new Map((await db().query<{ update_id: string; imported_at: string }>('SELECT update_id, imported_at FROM portfolio.finvry_imports WHERE company_id = $1', [id.data])).rows.map((r) => [r.update_id, r.imported_at]))
  const ups = await sentUpdates(c.finvry_org_id)
  return { linked: ws, updates: ups.map((u) => ({ ...u, label: updateLabel(u.period_type, u.period_end), imported_at: done.get(u.id) ?? null, new: u.id === c.finvry_new_update })) }
})
