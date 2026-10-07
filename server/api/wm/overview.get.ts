// Wealth management overview: clients by country and model, assets under management, fees, metals.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const clients = (await db().query<{ id: string; name: string; kind: string; tag: string | null; country: string; model: string; status: string; kyc_status: string; email: string | null; user_id: string | null; entity: string | null }>(
    "SELECT c.id, c.name, c.kind, c.tag, c.country, c.model, c.status, c.kyc_status, c.email, c.user_id, e.name AS entity FROM wm.clients c LEFT JOIN core.entities e ON e.id = c.entity_id ORDER BY c.name")).rows
  const out = []
  for (const c of clients) { const s = await clientSummary(c.id); out.push({ ...c, totals: s.totals }) }
  const fees = (await db().query("SELECT f.id, f.kind, f.period, f.amount::float AS amount, f.currency, f.status, to_char(f.paid_on, 'YYYY-MM-DD') AS paid_on, c.name AS client, fm.name AS firm, f.note FROM wm.fees f LEFT JOIN wm.clients c ON c.id = f.client_id LEFT JOIN wm.firms fm ON fm.id = f.firm_id ORDER BY f.created_at DESC LIMIT 300")).rows
  const metals = (await db().query("SELECT h.id, h.name, h.section, h.platform, h.currency, h.cost::float AS cost, h.current_value::float AS current_value, to_char(h.as_of, 'YYYY-MM-DD') AS as_of, h.meta, c.name AS client, h.wm_client_id FROM wealth.holdings h LEFT JOIN wm.clients c ON c.id = h.wm_client_id WHERE h.category = 'precious_metals' AND h.status NOT IN ('sold','written_off') ORDER BY h.section, h.name")).rows
  const firms = (await db().query("SELECT f.*, f.terms_rate::float AS terms_rate, f.terms_amount::float AS terms_amount, (SELECT count(*)::int FROM wm.client_firms cf WHERE cf.firm_id = f.id) AS clients FROM wm.firms f ORDER BY f.name")).rows
  const rc = useRuntimeConfig() as unknown as Record<string, string>
  return { clients: out, fees, metals, firms, settings: await wmSettings(), fortress: await fortressSettings(), providers: { plaid: plaidOn(), alpaca: alpacaReady(), fincra: fincraReady(), busha: bushaReady(), prembly: !!(rc.premblyApiKey && rc.premblyAppId), stripe: stripeOn(), paystack: paystackOn() } }
})
