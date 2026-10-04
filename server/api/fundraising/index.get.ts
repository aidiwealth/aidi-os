// Everything on the fundraising page: data room files, links and recent activity, pipelines (the first open one in
// detail), memos, SAFEs.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const files = await db().query('SELECT f.id, f.title, f.folder, f.is_deck, f.created_at, d.size_bytes, d.mime_type FROM fundraise.files f JOIN core.documents d ON d.id = f.document_id ORDER BY f.is_deck DESC, f.folder, f.sort, f.created_at')
  const links = await db().query(`SELECT l.id, l.slug, l.name, l.file_ids, l.require_email, l.allow_download, to_char(l.expires_at, 'YYYY-MM-DD') AS expires, l.revoked, l.views, l.last_viewed_at, l.created_at,
      (SELECT coalesce(sum(v.seconds), 0)::int FROM fundraise.views v WHERE v.link_id = l.id) AS seconds, (SELECT count(DISTINCT v.viewer_email)::int FROM fundraise.views v WHERE v.link_id = l.id AND v.viewer_email IS NOT NULL) AS viewers
    FROM fundraise.links l ORDER BY l.created_at DESC`)
  const activity = await db().query(`SELECT v.viewer_email, v.seconds, v.started_at, l.name AS link, f.title AS file FROM fundraise.views v JOIN fundraise.links l ON l.id = v.link_id LEFT JOIN fundraise.files f ON f.id = v.file_id ORDER BY v.started_at DESC LIMIT 40`)
  const pipelines = await db().query(`SELECT p.id, p.name, p.currency, p.target::float, p.instrument, p.valuation_cap::float, p.discount::float, p.status, to_char(p.target_close, 'YYYY-MM-DD') AS target_close,
      coalesce((SELECT sum(d.amount) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id AND s.kind IN ('committed','won')), 0)::float AS committed,
      coalesce((SELECT sum(d.amount) FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id AND s.kind = 'won'), 0)::float AS closed,
      (SELECT count(*)::int FROM crm.deals d JOIN crm.stages s ON s.id = d.stage_id WHERE d.pipeline_id = p.id AND s.kind IN ('open','committed')) AS in_play
    FROM crm.pipelines p ORDER BY (p.status = 'open') DESC, p.created_at DESC`)
  const memos = await db().query('SELECT id, title, updated_at FROM fundraise.memos ORDER BY updated_at DESC')
  const safes = await db().query("SELECT id, investor_name, amount::float, currency, valuation_cap::float, discount::float, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes ORDER BY created_at DESC")
  const handle = (await db().query<{ slug: string }>('SELECT slug FROM financials.public_pages LIMIT 1')).rows[0]?.slug ?? null
  const ndas = await db().query('SELECT id, scope, name, email, company, signature, nda_text, signed_at FROM fundraise.nda_signatures ORDER BY signed_at DESC LIMIT 500')
  return { handle, ndas: ndas.rows, company: org.name, currency: (org.settings.currency as string) || 'USD', state: (org.settings.state as string) || '', files: files.rows, links: links.rows, activity: activity.rows, pipelines: pipelines.rows, memos: memos.rows, safes: safes.rows, base: brands().finvry.url + '/d/' }
})
