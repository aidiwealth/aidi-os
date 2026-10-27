// Pre-IPO deals in Public markets (terms, value range, signal, what we hold) and the commitments in progress.
export default defineEventHandler(async (event) => {
  await requireMarkets(event)
  const deals = (await privateDeals()).map((d) => ({ ...d, signal_label: privateSignalLabel(d.signal) }))
  const commitments = (await db().query(`SELECT c.id, c.account_id, a.name AS account, c.secondary_id, coalesce(nullif(s.company, ''), s.title) AS company, c.amount::float, c.status, c.reason, c.checks, c.units::float, c.price::float, c.fees::float, c.note, c.created_at, c.approved_at, c.signed_at, c.wired_at, c.confirmed_at, s.spv_name,
      CASE a.owner_type WHEN 'entity' THEN (SELECT name FROM core.entities WHERE id = a.entity_id) WHEN 'client' THEN (SELECT name FROM wm.clients WHERE id = a.wm_client_id) ELSE 'Retirement plan' END AS owner
    FROM markets.commitments c JOIN markets.accounts a ON a.id = c.account_id JOIN wm.secondaries s ON s.id = c.secondary_id
    WHERE c.status IN ('waiting', 'approved', 'signed', 'wired') OR c.created_at > now() - interval '120 days' ORDER BY c.created_at DESC LIMIT 200`)).rows
  return { deals, commitments }
})
