// Prospective LPs, with the pipelines each is in (stage and amount) and whether they are on the LP register.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const items = (await db().query(`SELECT p.id, p.name, p.kind, p.capital, p.country, p.regions, p.sectors, p.aum_usd::float AS aum_usd, p.ticket_min_usd::float AS ticket_min_usd, p.ticket_max_usd::float AS ticket_max_usd,
      p.mandate, p.backs_emerging, p.website, p.contact_name, p.contact_title, p.email, p.linkedin, p.phone, p.notes, p.sources, p.source, p.lp_id, p.priority, p.extra, to_char(p.created_at, 'YYYY-MM-DD') AS added,
      coalesce((SELECT json_agg(json_build_object('pipeline_id', t.pipeline_id, 'pipeline', pl.name, 'kind', pl.kind, 'stage', s.name, 'stage_kind', s.kind, 'amount', t.amount::float) ORDER BY pl.created_at)
        FROM funds.lp_targets t JOIN funds.lp_pipelines pl ON pl.id = t.pipeline_id JOIN funds.lp_stages s ON s.id = t.stage_id WHERE t.prospect_id = p.id), '[]') AS pipelines
    FROM funds.lp_prospects p ORDER BY p.created_at DESC, p.name LIMIT 2000`)).rows
  const pipelines = (await db().query("SELECT id, name, kind, status FROM funds.lp_pipelines ORDER BY status, created_at DESC")).rows
  return { items, pipelines, kinds: LP_KINDS, capital: LP_CAPITAL, extra: EXTRA_LABEL }
})
