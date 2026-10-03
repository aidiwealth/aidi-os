// The pipeline: every lead with its weighted value, and totals.
import { OPEN_STAGES, STAGE_PROB } from '~/server/utils/sales'
export default defineEventHandler(async (event) => {
  await requirePlatform(event)
  return await asPlatform(async () => {
    const r = await db().query<{ id: string; company: string; contact_name: string | null; kind: string; country: string | null; source: string; stage: string; plan: string | null; value_monthly_usd: string | null; billing: string; owner: string | null; expected_close: string | null; stage_changed_at: string; stage_day: string; organization_id: string | null; updated_at: string }>(
      `SELECT l.id, l.company, l.contact_name, l.kind, l.country, l.source, l.stage, pl.name AS plan, l.value_monthly_usd::text, l.billing, p.full_name AS owner,
              to_char(l.expected_close, 'YYYY-MM-DD') AS expected_close, l.stage_changed_at, to_char(l.stage_changed_at, 'YYYY-MM-DD') AS stage_day, l.organization_id, l.updated_at
         FROM platform.leads l LEFT JOIN core.plans pl ON pl.code = l.plan_code LEFT JOIN core.users u ON u.id = l.owner_id LEFT JOIN core.people p ON p.id = u.person_id
        ORDER BY l.updated_at DESC`)
    const open = r.rows.filter((l) => OPEN_STAGES.includes(l.stage))
    const v = (l: { value_monthly_usd: string | null }) => Number(l.value_monthly_usd ?? 0)
    const monthStart = new Date().toISOString().slice(0, 8) + '01'
    return {
      leads: r.rows,
      kpis: {
        open: open.length, pipeline: open.reduce((s, l) => s + v(l), 0), weighted: open.reduce((s, l) => s + v(l) * (STAGE_PROB[l.stage] ?? 0), 0),
        wonMonth: r.rows.filter((l) => l.stage === 'won' && l.stage_day >= monthStart).length,
        wonMonthValue: r.rows.filter((l) => l.stage === 'won' && l.stage_day >= monthStart).reduce((s, l) => s + v(l), 0)
      }
    }
  })
})
