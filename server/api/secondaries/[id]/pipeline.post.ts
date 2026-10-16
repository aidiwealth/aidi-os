import { stageOf } from '~/server/utils/secondaries'
// Move a secondary into the venture Pipeline (Screening), once; returns the pipeline deal.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  await requireModule(event, 'pipeline')
  const id = getRouterParam(event, 'id')
  const s = (await db().query<{ title: string; company: string | null; stage: string | null; url: string | null; min_investment: number | null; pipeline_deal_id: string | null; lead: string | null; co_investors: string | null; sector: string | null; valuation: string | null }>(
    'SELECT title, company, stage, url, min_investment::float, pipeline_deal_id, lead, co_investors, sector, valuation FROM wm.secondaries WHERE id = $1', [id])).rows[0]
  if (!s) throw apiError('not_found', 'Not found', 404)
  if (s.pipeline_deal_id && (await db().query('SELECT 1 FROM deals.deals WHERE id = $1', [s.pipeline_deal_id])).rowCount) return { ok: true, id: s.pipeline_deal_id, existing: true }
  const st = stageOf(s.stage), round = st === 'Pre-seed' ? 'pre_seed' : st === 'Seed' ? 'seed' : st === 'Series A' ? 'series_a' : st === 'Series B' ? 'series_b' : st ? 'later' : null
  const row = await one<{ id: string }>(`INSERT INTO deals.deals (company, one_liner, website, round, source, stage, owner_id, created_by, vehicle_entity_id)
    VALUES ($1,$2,$3,$4,'network','screening',$5,$5, core.default_vehicle()) RETURNING id`,
    [(s.company || s.title).slice(0, 200), s.title.slice(0, 300), s.url && s.url.length <= 500 ? s.url : null, round, user.userId])
  await db().query("UPDATE wm.secondaries SET pipeline_deal_id = $2, status = CASE WHEN status = 'new' THEN 'reviewing' ELSE status END, updated_at = now() WHERE id = $1", [id, row.id])
  await audit({ event, actorUserId: user.userId, action: 'pipeline.create', objectType: 'deal', objectId: row.id, detail: { from: 'secondaries', secondary: id } })
  return { ok: true, id: row.id }
})
