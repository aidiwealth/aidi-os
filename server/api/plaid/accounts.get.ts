import { isDebt } from '~/shared/bank'
import { z } from 'zod'
// Connected bank accounts with live balances (refreshed if older than an hour), plus a total in the reporting currency.
export default defineEventHandler(async (event): Promise<Record<string, unknown>> => {
  const user = await requireRole(event, 'admin', 'gp', 'team', 'family')
  const manage = user.roles.some((r) => r === 'admin' || r === 'gp')
  const org = (await currentOrg())!
  // Live balances come from US banks. Someone limited to companies outside the US (e.g. Nigerian ones) does not get
  // this section at all; others see only their companies' connections (row-level security).
  const scope = String(event.context.entityScope ?? '')
  if (scope && !(await db().query("SELECT 1 FROM core.entities WHERE id::text = ANY(string_to_array($1, ',')) AND jurisdiction ILIKE 'US%' LIMIT 1", [scope])).rowCount) return { available: false, enabled: false, env: '', items: [], accounts: [], total: 0, currency: 'USD' }
  // A Nigerian company or subsidiary: no US bank connections here, and no "Connect a bank" until Mono is switched on.
  const ent = z.string().uuid().safeParse(getQuery(event).entity)
  const ng = await nigerianBanking(ent.success ? ent.data : null)
  if (ng && ent.success) return { available: false, enabled: false, env: '', items: [], accounts: [], total: 0, currency: 'USD' }
  const items = await db().query<{ id: string; access_token_enc: string; institution: string | null; error: string | null; stale: boolean }>("SELECT i.id, i.access_token_enc, i.institution, i.error, coalesce((SELECT min(a.updated_at) < now() - interval '1 hour' FROM banking.plaid_accounts a WHERE a.item_id = i.id), true) AS stale FROM banking.plaid_items i WHERE i.wm_client_id IS NULL ORDER BY i.created_at")
  // Refresh asked for: wait for the banks. Balances over an hour old: shown now, refreshed after the response.
  if (plaidOn() && getQuery(event).refresh === '1') for (const it of items.rows) await refreshItem(it.id, it.access_token_enc)
  else if (plaidOn() && getQuery(event).refresh !== '0' && items.rows.some((i) => i.stale)) inBackground('plaid-balances', async () => { for (const it of items.rows) if (it.stale) await refreshItem(it.id, it.access_token_enc) })
  const accts0 = (await db().query<{ id: string; item_id: string; name: string; mask: string | null; type: string | null; subtype: string | null; currency: string; current: string | null; available: string | null; updated_at: string; institution: string | null; error: string | null }>(
    'SELECT a.id, a.item_id, a.name, a.mask, a.type, a.subtype, a.currency, a.current::text, a.available::text, a.updated_at, i.institution, i.error FROM banking.plaid_accounts a JOIN banking.plaid_items i ON i.id = a.item_id WHERE i.wm_client_id IS NULL ORDER BY i.institution, a.name')).rows
  const to = (org.settings.reporting_currency as string) || (org.settings.currency as string) || 'USD'
  // Cards and loans are money owed, not cash: shown apart and left out of the bank balance.
  const accts = accts0.map((a) => ({ ...a, debt: isDebt(a) }))
  let total = 0, owed = 0
  for (const a of accts) if (a.current !== null) { const k = await fxRate(a.currency, to); if (!k) continue; if (a.debt) owed += Math.abs(Number(a.current)) * k; else total += Number(a.current) * k }
  // How much of the company's cash these accounts are (they are US accounts only).
  const coverage = accts.length ? await bankCoverage(total, to).catch(() => null) : null
  return { available: true, manage, enabled: plaidOn() && (!ng || await monoOn()), ng, env: (useRuntimeConfig().plaidEnv as string) || 'sandbox', items: items.rows.map((i) => ({ id: i.id, institution: i.institution, error: i.error })), accounts: accts, total: Math.round(total * 100) / 100, owed: Math.round(owed * 100) / 100, currency: to, coverage }
})
