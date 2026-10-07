export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const c = (await db().query("SELECT c.*, e.name AS entity FROM wm.clients c LEFT JOIN core.entities e ON e.id = c.entity_id WHERE c.id = $1", [id])).rows[0]
  if (!c) throw apiError('not_found', 'Not found', 404)
  delete c.bvn_enc; delete c.nin_enc
  const summary = await clientSummary(id)
  const members = (await db().query('SELECT id, name, relationship, email FROM wm.members WHERE client_id = $1 ORDER BY created_at', [id])).rows
  const views = (await db().query("SELECT name, email, viewed_at FROM wm.views WHERE client_id = $1 ORDER BY viewed_at DESC LIMIT 50", [id])).rows
  const firms = (await db().query("SELECT cf.id, cf.adviser_name, to_char(cf.started_on, 'YYYY-MM-DD') AS started_on, f.id AS firm_id, f.name, f.terms_type, f.terms_rate::float AS terms_rate, f.terms_amount::float AS terms_amount, f.terms_currency, f.terms_frequency FROM wm.client_firms cf JOIN wm.firms f ON f.id = cf.firm_id WHERE cf.client_id = $1", [id])).rows
  const fees = (await db().query("SELECT id, number, kind, period, amount::float AS amount, currency, status, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, note, method, invoice_doc_id, receipt_doc_id FROM wm.fees WHERE client_id = $1 ORDER BY created_at DESC", [id])).rows
  const cfg = await wmSettings()
  const usdAum = summary.totals.invested + summary.totals.cash
  return { client: c, summary, members, views, firms, fees, settings: cfg, advisory_estimate: c.model === 'managed' ? advisoryFee(usdAum, cfg.advisory_tiers) : null, entities: (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows, has_link: !!(await db().query('SELECT 1 FROM wm.view_links WHERE client_id = $1 AND NOT revoked', [id])).rowCount }
})
