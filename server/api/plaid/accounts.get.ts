// Connected bank accounts with live balances (refreshed if older than an hour), plus a total in the reporting currency.
export default defineEventHandler(async (event): Promise<Record<string, unknown>> => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  const org = (await currentOrg())!
  const items = await db().query<{ id: string; access_token_enc: string; institution: string | null; error: string | null; stale: boolean }>("SELECT i.id, i.access_token_enc, i.institution, i.error, coalesce((SELECT min(a.updated_at) < now() - interval '1 hour' FROM banking.plaid_accounts a WHERE a.item_id = i.id), true) AS stale FROM banking.plaid_items i ORDER BY i.created_at")
  if (plaidOn() && getQuery(event).refresh !== '0') for (const it of items.rows) if (it.stale || getQuery(event).refresh === '1') await refreshItem(it.id, it.access_token_enc)
  const accts = (await db().query<{ id: string; item_id: string; name: string; mask: string | null; subtype: string | null; currency: string; current: string | null; available: string | null; updated_at: string; institution: string | null; error: string | null }>(
    'SELECT a.id, a.item_id, a.name, a.mask, a.subtype, a.currency, a.current::text, a.available::text, a.updated_at, i.institution, i.error FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id ORDER BY i.institution, a.name')).rows
  const to = (org.settings.reporting_currency as string) || (org.settings.currency as string) || 'USD'
  let total = 0
  for (const a of accts) if (a.current !== null && !['credit', 'loan'].includes(a.subtype ?? '')) { const k = await fxRate(a.currency, to); if (k) total += Number(a.current) * k }
  return { enabled: plaidOn(), env: (useRuntimeConfig().plaidEnv as string) || 'sandbox', items: items.rows.map((i) => ({ id: i.id, institution: i.institution, error: i.error })), accounts: accts, total: Math.round(total * 100) / 100, currency: to }
})
