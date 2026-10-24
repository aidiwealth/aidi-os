// Accounts that come in by statement (banks the live feed does not reach, such as Nigerian banks): one card each, like
// a live account, with its latest balance from the statements, the statements uploaded, and ways to delete a statement
// or clear the account. A newer statement goes to the same account (overlaps are skipped).
import type { ForecastScope } from '~/server/utils/forecast-scope'
export interface UpAccount { key: string; label: string; entity_id: string | null; entity: string | null; currency: string; balance: number | null; as_of: string | null; count: number; from: string | null; to: string | null; sheet: boolean
  kind: 'bank' | 'brokerage'; cash: number | null; holdings: number | null; accrued: number | null; include_holdings: boolean; valuation_as_of: string | null; recon: { months: number; off: { month: string; why: string }[] } | null
  uploads: { id: string; file_name: string | null; file_kind: string; period_start: string | null; period_end: string | null; added: number; read: number; created_at: string }[] }
export const accountKey = (entity: string | null, label: string) => (entity ?? '') + '|' + label

export async function uploadedAccounts(sc: ForecastScope) {
  const main = await companyEntityId(), ent = sc.group ? null : sc.entity
  const ids = sc.companies.map((c) => c.id), names = new Map(sc.companies.map((c) => [c.id, c.name]))
  const acc = (await db().query<{ entity_id: string | null; label: string; currency: string; n: number; d0: string; d1: string; tagged: number }>(
    `SELECT coalesce(entity_id, $2::uuid) AS entity_id, account_label AS label, mode() WITHIN GROUP (ORDER BY currency) AS currency, count(*)::int AS n,
            to_char(min(txn_date), 'YYYY-MM-DD') AS d0, to_char(max(txn_date), 'YYYY-MM-DD') AS d1, count(upload_id)::int AS tagged
       FROM banking.ledger WHERE source = 'upload' AND account_label IS NOT NULL AND ($1::uuid IS NULL OR coalesce(entity_id, $2::uuid) = $1) AND coalesce(entity_id, $2::uuid) = ANY($3::uuid[])
      GROUP BY 1, 2 ORDER BY max(txn_date) DESC`, [ent, main, ids])).rows
  // Brokerage accounts: their settings and latest month-end valuation (an account can have a valuation before any
  // transactions are uploaded).
  const sets = (await db().query<{ entity_id: string; label: string; kind: 'bank' | 'brokerage'; currency: string | null; include_holdings: boolean }>(
    'SELECT entity_id, account_label AS label, kind, currency, include_holdings FROM banking.account_settings WHERE ($1::uuid IS NULL OR entity_id = $1) AND entity_id = ANY($2::uuid[])', [ent, ids]).catch(() => ({ rows: [] }))).rows
  for (const s of sets) if (s.kind === 'brokerage' && !acc.some((a) => a.entity_id === s.entity_id && a.label === s.label)) acc.push({ entity_id: s.entity_id, label: s.label, currency: s.currency ?? sc.currency, n: 0, d0: null as unknown as string, d1: null as unknown as string, tagged: 0 })
  if (!acc.length) return { currency: sc.currency, total: 0, holdings_total: 0, accounts: [] as UpAccount[] }
  const vals = (await db().query<{ entity_id: string; label: string; month_end: string; cash: number; holdings: number; accrued: number | null }>(
    `SELECT DISTINCT ON (entity_id, account_label) entity_id, account_label AS label, month_end::text, cash::float, holdings::float, accrued::float FROM banking.valuations
      WHERE ($1::uuid IS NULL OR entity_id = $1) AND entity_id = ANY($2::uuid[]) ORDER BY entity_id, account_label, month_end DESC`, [ent, ids]).catch(() => ({ rows: [] }))).rows
  const labels = acc.map((a) => a.label)
  const bal = (await db().query<{ entity_id: string | null; label: string; balance: number; as_of: string }>(
    `SELECT DISTINCT ON (coalesce(entity_id, $2::uuid), account_label) coalesce(entity_id, $2::uuid) AS entity_id, account_label AS label, balance::float, to_char(as_of, 'YYYY-MM-DD') AS as_of
       FROM banking.balances WHERE source IN ('statement', 'sheet') AND account_label = ANY($1::text[]) ORDER BY coalesce(entity_id, $2::uuid), account_label, as_of DESC`, [labels, main])).rows
  const ups = (await db().query<{ id: string; entity_id: string | null; label: string; file_name: string | null; file_kind: string; period_start: string | null; period_end: string | null; added: number; read: number; created_at: string }>(
    `SELECT id, coalesce(entity_id, $2::uuid) AS entity_id, account_label AS label, file_name, file_kind, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end,
            added_count AS added, read_count AS read, created_at FROM banking.uploads WHERE account_label = ANY($1::text[]) ORDER BY period_end DESC NULLS LAST, created_at DESC`, [labels, main])).rows
  const rate = await rateTo(sc.currency)
  let total = 0, holdingsTotal = 0
  const accounts: UpAccount[] = []
  for (const a of acc) {
    const k = accountKey(a.entity_id, a.label), b = bal.find((x) => accountKey(x.entity_id, x.label) === k), u = ups.filter((x) => accountKey(x.entity_id, x.label) === k)
    const st = sets.find((x) => accountKey(x.entity_id, x.label) === k), v = vals.find((x) => accountKey(x.entity_id, x.label) === k), broker = st?.kind === 'brokerage'
    // A brokerage account is worth its cash plus its holdings: cash from the newer of the statement and the valuation.
    const cash = broker && v && (!b || v.month_end >= b.as_of) ? v.cash : b?.balance ?? null
    const holdings = broker && v ? v.holdings : null, incl = st?.include_holdings ?? true
    const balance = cash === null && holdings === null ? null : Math.round(((cash ?? 0) + (incl ? holdings ?? 0 : 0)) * 100) / 100
    const asOf = [b?.as_of ?? null, broker ? v?.month_end ?? null : null].filter(Boolean).sort().pop() ?? null
    const r = await rate(a.currency)
    if (balance) total += balance * r
    if (incl && holdings) holdingsTotal += holdings * r
    accounts.push({ key: k, label: a.label, entity_id: a.entity_id, entity: a.entity_id ? names.get(a.entity_id) ?? null : null, currency: a.currency, balance, as_of: asOf, count: a.n, from: a.d0, to: a.d1,
      sheet: !u.length && !a.tagged && a.n > 0, uploads: u.map(({ entity_id: _e, label: _l, ...x }) => x),
      kind: broker ? 'brokerage' : 'bank', cash, holdings, accrued: broker ? v?.accrued ?? null : null, include_holdings: incl, valuation_as_of: broker ? v?.month_end ?? null : null,
      recon: broker && a.entity_id ? await valuationCheck(a.entity_id, a.label) : null })
  }
  return { currency: sc.currency, total: Math.round(total * 100) / 100, holdings_total: Math.round(holdingsTotal * 100) / 100, accounts }
}

// Month-end balances for an account, from statements, that no remaining statement covers any more.
async function dropBalances(entity: string | null, label: string, from: string | null, to: string | null) {
  const main = await companyEntityId()
  await db().query(`DELETE FROM banking.balances b WHERE b.source = 'statement' AND b.account_label = $1 AND coalesce(b.entity_id, $2::uuid) = coalesce($3::uuid, $2::uuid)
      AND ($4::date IS NULL OR b.as_of >= $4) AND ($5::date IS NULL OR b.as_of <= date_trunc('month', $5::date) + interval '1 month' - interval '1 day')
      AND NOT EXISTS (SELECT 1 FROM banking.uploads u WHERE u.account_label = b.account_label AND coalesce(u.entity_id, $2::uuid) = coalesce(b.entity_id, $2::uuid) AND b.as_of BETWEEN u.period_start AND u.period_end)`,
  [label, main, entity, from, to])
}
async function dropFile(docId: string | null) {
  if (!docId) return
  const d = (await db().query<{ storage_key: string }>('DELETE FROM core.documents WHERE id = $1 RETURNING storage_key', [docId])).rows[0]
  if (d) await deleteObject(d.storage_key).catch((e) => console.error('[treasury] delete file', (e as Error).message))
}

// Delete one statement: the transactions it brought in, its balances (unless another statement covers them) and the file.
export async function deleteUpload(id: string, allowed: string[]) {
  const main = await companyEntityId()
  const u = (await db().query<{ entity_id: string | null; account_label: string; period_start: string | null; period_end: string | null; doc_id: string | null }>(
    "SELECT entity_id, account_label, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, doc_id FROM banking.uploads WHERE id = $1", [id])).rows[0]
  if (!u || !allowed.includes(u.entity_id ?? main ?? '')) return null
  const removed = (await db().query("DELETE FROM banking.ledger WHERE source = 'upload' AND upload_id = $1", [id])).rowCount ?? 0
  await db().query('DELETE FROM banking.uploads WHERE id = $1', [id])
  await dropBalances(u.entity_id, u.account_label, u.period_start, u.period_end)
  await dropFile(u.doc_id)
  return { removed, account: u.account_label }
}

// Clear an uploaded account: every transaction it has (statements and linked-sheet rows), its balances and statements.
export async function clearAccount(entity: string | null, label: string, allowed: string[]) {
  const main = await companyEntityId(), e = entity ?? main
  if (!e || !allowed.includes(e)) return null
  const removed = (await db().query("DELETE FROM banking.ledger WHERE source = 'upload' AND account_label = $1 AND coalesce(entity_id, $2::uuid) = $3", [label, main, e])).rowCount ?? 0
  await db().query("DELETE FROM banking.balances WHERE source IN ('statement', 'sheet') AND account_label = $1 AND coalesce(entity_id, $2::uuid) = $3", [label, main, e])
  await db().query('DELETE FROM banking.valuations WHERE account_label = $1 AND entity_id = $2', [label, e])
  await db().query('DELETE FROM banking.account_settings WHERE account_label = $1 AND entity_id = $2', [label, e])
  const docs = (await db().query<{ doc_id: string | null }>('DELETE FROM banking.uploads WHERE account_label = $1 AND coalesce(entity_id, $2::uuid) = $3 RETURNING doc_id', [label, main, e])).rows
  for (const d of docs) await dropFile(d.doc_id)
  return { removed }
}
