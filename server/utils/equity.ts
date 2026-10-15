// Cap tables: a company can keep several (today's, a pro forma, a what-if). Every record belongs to one.
import { table as capTableCalc } from '~/shared/captable'
export interface CapTableRow { id: string; name: string; note: string | null; is_main: boolean; updated_at: string }
export async function capTables(): Promise<CapTableRow[]> {
  return (await db().query<CapTableRow>('SELECT id, name, note, is_main, updated_at FROM equity.captables ORDER BY is_main DESC, created_at')).rows
}
// The cap table a request is about: the one asked for, else the main one (made on first use).
export async function capTableId(want?: unknown): Promise<string> {
  if (typeof want === 'string' && /^[0-9a-f-]{36}$/.test(want)) {
    const r = (await db().query<{ id: string }>('SELECT id FROM equity.captables WHERE id = $1', [want])).rows[0]
    if (r) return r.id
    throw apiError('not_found', 'That cap table was not found.', 404)
  }
  const main = (await db().query<{ id: string }>('SELECT id FROM equity.captables ORDER BY is_main DESC, created_at LIMIT 1')).rows[0]
  return main?.id ?? (await one<{ id: string }>("INSERT INTO equity.captables (name, is_main) VALUES ('Cap table', true) RETURNING id")).id
}
export async function loadCapTable(ct: string) {
  const q = (s: string) => db().query(s, [ct]).then((r) => r.rows)
  const [classes, holders, issuances, plans, grants, convertibles] = await Promise.all([
    q('SELECT id, name, kind, liq_pref::float, participating, seniority, issue_price::float FROM equity.classes WHERE captable_id = $1 ORDER BY seniority, created_at'),
    q('SELECT id, name, email, kind FROM equity.holders WHERE captable_id = $1 ORDER BY name'),
    q("SELECT id, holder_id, class_id, shares::float, price::float, to_char(issued_on, 'YYYY-MM-DD') AS issued_on, certificate, notes, certificate_doc_id, esign_doc_id, consent_doc_id FROM equity.issuances WHERE captable_id = $1 ORDER BY issued_on, created_at"),
    q('SELECT id, name, reserved::float FROM equity.plans WHERE captable_id = $1 ORDER BY created_at'),
    q("SELECT id, plan_id, holder_id, kind, shares::float, strike::float, to_char(granted_on, 'YYYY-MM-DD') AS granted_on, to_char(vest_start, 'YYYY-MM-DD') AS vest_start, vest_months, cliff_months, exercised::float, to_char(cancelled_on, 'YYYY-MM-DD') AS cancelled_on, esign_doc_id, consent_doc_id FROM equity.grants WHERE captable_id = $1 ORDER BY granted_on"),
    q("SELECT id, holder_id, kind, amount::float, currency, valuation_cap::float, discount_pct::float, post_money, mfn, interest_pct::float, to_char(issued_on, 'YYYY-MM-DD') AS issued_on, to_char(maturity_on, 'YYYY-MM-DD') AS maturity_on, status, safe_id, esign_doc_id FROM equity.convertibles WHERE captable_id = $1 ORDER BY issued_on")])
  return { classes, holders, issuances, plans, grants, convertibles } as unknown as import('~/shared/captable').Data & { holders: (import('~/shared/captable').Holder & { email: string | null })[] }
}
// Copy a cap table (to model a what-if without touching the real one).
export async function copyCapTable(from: string, name: string, by: string): Promise<string> {
  const c = await db().connect()
  try {
    await c.query('BEGIN')
    const to = (await c.query<{ id: string }>('INSERT INTO equity.captables (name, note, created_by) SELECT $2, note, $3 FROM equity.captables WHERE id = $1 RETURNING id', [from, name, by])).rows[0]?.id
    if (!to) throw apiError('not_found', 'Not found', 404)
    const map = async (t: string, cols: string, fk: string[] = []) => {
      const rows = (await c.query<Record<string, unknown> & { id: string }>('SELECT id, ' + cols + ' FROM equity.' + t + ' WHERE captable_id = $1', [from])).rows
      const out = new Map<string, string>()
      for (const r of rows) {
        const list = cols.split(',').map((x) => x.trim())
        const vals = list.map((k) => (fk.includes(k) ? ids.get(String(r[k])) ?? null : r[k]))
        out.set(r.id, (await c.query<{ id: string }>('INSERT INTO equity.' + t + ' (captable_id, ' + cols + ') VALUES ($1, ' + list.map((_, i) => '$' + (i + 2)).join(', ') + ') RETURNING id', [to, ...vals])).rows[0]!.id)
      }
      for (const [k, v] of out) ids.set(k, v)
    }
    const ids = new Map<string, string>()
    await map('holders', 'name, email, kind'); await map('classes', 'name, kind, liq_pref, participating, seniority, issue_price'); await map('plans', 'name, reserved')
    await map('issuances', 'holder_id, class_id, shares, price, issued_on, certificate, notes', ['holder_id', 'class_id'])
    await map('grants', 'plan_id, holder_id, kind, shares, strike, granted_on, vest_start, vest_months, cliff_months, exercised, cancelled_on', ['plan_id', 'holder_id'])
    await map('convertibles', 'holder_id, kind, amount, currency, valuation_cap, discount_pct, post_money, mfn, interest_pct, issued_on, maturity_on, status', ['holder_id'])
    await c.query('COMMIT'); return to
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e } finally { c.release() }
}
// Ownership by group (founders, investors, team, pool…) with no names: what an investor page shows by default.
export function capGroups(d: import('~/shared/captable').Data) {
  const t = capTableCalc(d, new Date().toISOString().slice(0, 10))
  const L: Record<string, string> = { founder: 'Founders', investor: 'Investors', employee: 'Team (shares and options)', advisor: 'Advisors', other: 'Other' }
  const m: Record<string, number> = {}
  for (const r of t.rows) m[L[r.holder.kind] ?? 'Other'] = (m[L[r.holder.kind] ?? 'Other'] ?? 0) + r.fd
  if (t.pool) m['Option pool (available)'] = t.pool
  const conv = d.convertibles.filter((c) => c.status === 'outstanding')
  return { fd: t.fd, groups: Object.entries(m).map(([label, shares]) => ({ label, shares, pct: t.fd ? Math.round(shares / t.fd * 10000) / 100 : 0 })).filter((g) => g.shares > 0).sort((a, b) => b.shares - a.shares),
    convertibles: { count: conv.length, total: conv.reduce((s, c) => s + c.amount, 0), currency: conv[0]?.currency ?? 'USD' } }
}
