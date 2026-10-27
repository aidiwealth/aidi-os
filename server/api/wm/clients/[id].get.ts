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
  const fees = (await db().query("SELECT id, number, kind, period, amount::float AS amount, currency, status, to_char(paid_on, 'YYYY-MM-DD') AS paid_on, note, method, invoice_doc_id, receipt_doc_id, lines FROM wm.fees WHERE client_id = $1 ORDER BY created_at DESC", [id])).rows
  const cfg = await wmSettings()
  // For the summary: the latest financial review, what happened lately, onboarding, and Public markets accounts that belong to the client.
  const rep = (await db().query<{ created_at: string; health: string | null; rate: string | null }>("SELECT created_at, content->>'health_score' AS health, content->'cash_flow'->>'savings_rate_pct' AS rate FROM wm.reports WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1", [id])).rows[0] ?? null
  const LABEL: Record<string, string> = { 'wm.client_create': 'Client added', 'wm.risk_level': 'Risk level set', 'wm.kyc_doc': 'Identity document added', 'wm.kyc_verify': 'Identity check complete', 'wm.kyc_accept_verify': 'Identity check complete', 'wm.onboarding_approve': 'Onboarding approved', 'wm.fee_paid': 'Fee paid', 'wm.invite': 'Invited to the portal' }
  const activity = [
    ...(await db().query<{ action: string; created_at: string }>("SELECT action, at AS created_at FROM core.audit_log WHERE object_type = 'wm_client' AND object_id = $1::text ORDER BY at DESC LIMIT 15", [id]).catch(() => ({ rows: [] as { action: string; created_at: string }[] }))).rows.filter((r) => LABEL[r.action]).map((r) => ({ text: LABEL[r.action]!, at: r.created_at })),
    ...(await db().query<{ text: string; created_at: string }>('SELECT text, created_at FROM wm.kyc_events WHERE client_id = $1 ORDER BY created_at DESC LIMIT 6', [id]).catch(() => ({ rows: [] as { text: string; created_at: string }[] }))).rows.map((r) => ({ text: r.text, at: r.created_at })),
    ...(await db().query<{ name: string; created_at: string }>('SELECT d.name, d.created_at FROM wm.profile_docs d WHERE d.client_id = $1 ORDER BY d.created_at DESC LIMIT 4', [id])).rows.map((r) => ({ text: 'Uploaded ' + (r.name || 'a document'), at: r.created_at }))
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6)
  const onboarding = (await db().query<{ id: string; status: string; account_status: string | null }>('SELECT id, status, account_status FROM wm.onboarding WHERE client_id = $1', [id])).rows[0] ?? null
  const markets = (await db().query<{ id: string; name: string; broker: string; kind: string; status: string; value: number; as_of: string | null }>(
    "SELECT a.id, a.name, a.broker, a.kind, a.status, (a.cash + coalesce((SELECT sum(h.current_value) FROM wealth.holdings h WHERE h.import_key LIKE 'mkt:' || a.id || ':%' AND h.import_key NOT LIKE '%:$CASH' AND h.status NOT IN ('sold','written_off')), 0))::float AS value, to_char(a.cash_as_of, 'YYYY-MM-DD') AS as_of FROM markets.accounts a WHERE a.wm_client_id = $1 ORDER BY a.name", [id]).catch(() => ({ rows: [] as never[] }))).rows
  const usdAum = summary.totals.invested + summary.totals.cash
  return { client: c, summary, plan: rep ? { at: rep.created_at, health: rep.health == null ? null : Number(rep.health), rate: rep.rate == null ? null : Number(rep.rate) } : null, activity, onboarding, markets, members, views, firms, fees, settings: cfg, advisory_estimate: c.model === 'managed' ? advisoryFee(usdAum, cfg.advisory_tiers) : null, entities: (await db().query("SELECT id, name FROM core.entities WHERE status <> 'dissolved' ORDER BY name")).rows, has_link: !!(await db().query('SELECT 1 FROM wm.view_links WHERE client_id = $1 AND NOT revoked', [id])).rowCount }
})
