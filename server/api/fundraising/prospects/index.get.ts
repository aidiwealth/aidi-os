// Investors and grants for this company's round, ranked by fit, plus the company's pipelines to add them to.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const q = getQuery(event)
  const s = org.settings as Record<string, unknown>
  // Defaults from the company: its country and its open pipeline's target.
  const open = (await db().query<{ id: string; name: string; target: number | null; currency: string; status: string }>("SELECT id, name, target::float, currency, status FROM crm.pipelines ORDER BY (status = 'open') DESC, created_at DESC")).rows
  const country = String(q.country ?? '') || String(s.country ?? '')
  const stage = String(q.stage ?? '') || String(s.raise_stage ?? '')
  const sectors = String(q.sectors ?? (s.sectors as string[] | undefined)?.join(',') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const amount = Number(q.amount ?? '') || (open[0]?.currency === 'USD' ? open[0]?.target : null) || null
  const kind = ['investor', 'grant'].includes(String(q.kind)) ? String(q.kind) : ''
  const ranked = rankProspects((await allProspects()).filter((p) => !kind || p.kind === kind), { country, stage, sectors, amount })
  // Mark what is already in a pipeline (same name).
  const have = new Set((await db().query<{ k: string }>('SELECT DISTINCT lower(investor) AS k FROM crm.deals')).rows.map((r) => r.k))
  return { query: { country, stage, sectors, amount, kind }, items: ranked.map((p) => ({ ...p, in_pipeline: have.has(p.name.toLowerCase()) })), pipelines: open, stages: RAISE_STAGE_LABEL, sector_labels: RAISE_SECTOR_LABEL, types: PROSPECT_TYPE_LABEL, company: org.name, currency: (s.currency as string) || 'USD' }
})
