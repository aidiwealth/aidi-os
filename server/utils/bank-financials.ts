// Financials from the bank, for a company that has bank transactions but no accounts yet (or months missing): each
// full month's receipts, costs by line and month-end cash, cash basis, drafted from Banking. The founder reviews and
// accepts; the months are kept as "from the bank" and the company's own figures replace them whenever they come in.
// Until then, Banking and the Stage Monitor use the bank's month-end cash when Financials has none.
export interface DraftMonth { period_end: string; lines: Record<string, number>; status: 'new' | 'update' | 'current' | 'has_figures'; complete_cash: boolean; txns: boolean }
const lastDay = (m: string) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10) }

export async function bankDraft(entityId: string, monthsBack = 24): Promise<{ currency: string; months: DraftMonth[] }> {
  // The company's own currency (Naira for a Nigerian subsidiary), as its Financials are kept.
  const currency = (await custEntities()).find((e) => e.id === entityId)?.currency || (await db().query<{ currency: string | null }>('SELECT currency FROM core.entities WHERE id = $1', [entityId])).rows[0]?.currency || await subjectCurrency('entity:' + entityId)
  const v = await reconView({ group: false, entity: entityId, currency }, monthsBack)
  const have = new Map((await db().query<{ m: string; source: string; lines: Record<string, number> }>("SELECT to_char(period_end, 'YYYY-MM') AS m, source, lines FROM financials.statements WHERE entity_id = $1 AND period_type = 'month'", [entityId])).rows.map((r) => [r.m, r]))
  const same = (a: Record<string, number>, b: Record<string, number>) => { const k = new Set([...Object.keys(a), ...Object.keys(b)]); return [...k].every((x) => Math.round(a[x] ?? 0) === Math.round(b[x] ?? 0)) }
  const months: DraftMonth[] = []
  for (const r of v.rows) {
    const txns = !!(r.receipts.bank || r.spend_total.bank || r.other.other_in || r.other.financing)
    if (!txns && r.cash.bank === null) continue
    const lines: Record<string, number> = {}
    if (r.receipts.bank) lines.revenue = r.receipts.bank
    if (r.other.other_in) lines.other_income = r.other.other_in
    for (const x of r.spend) if (x.bank) lines[x.key] = x.bank
    const full = r.cash.bank !== null && r.cash.accounts === r.cash.of
    if (full) lines.cash = r.cash.bank!
    const ex = have.get(r.month)
    // Drafted from the bank before: offered again only when the bank now says something different.
    months.push({ period_end: lastDay(r.month), lines, status: !ex ? 'new' : ex.source !== 'bank' ? 'has_figures' : same(ex.lines, lines) ? 'current' : 'update', complete_cash: full, txns })
  }
  return { currency, months: months.sort((a, b) => a.period_end.localeCompare(b.period_end)) }
}

// Write accepted months: only months with no figures of the company's own (new, or drafted from the bank before).
export async function writeBankDraft(entityId: string, ends: string[], userId: string | null) {
  const d = await bankDraft(entityId), pick = new Set(ends)
  let written = 0
  for (const m of d.months) {
    if (!pick.has(m.period_end) || m.status === 'has_figures' || m.status === 'current' || !Object.keys(m.lines).length) continue
    const ex = (await db().query<{ id: string }>("SELECT id FROM financials.statements WHERE entity_id = $1 AND period_type = 'month' AND period_end = $2 AND source = 'bank'", [entityId, m.period_end])).rows[0]
    const note = 'Drafted from bank transactions (cash basis). Replace with your accounts when you have them.'
    if (ex) await db().query("UPDATE financials.statements SET lines = $2, currency = $3, notes = $4, updated_at = now() WHERE id = $1", [ex.id, JSON.stringify(m.lines), d.currency, note])
    else await db().query("INSERT INTO financials.statements (entity_id, period_type, period_end, currency, lines, kpis, detail, notes, source, created_by) VALUES ($1,'month',$2,$3,$4,'{}','{}',$5,'bank',$6)", [entityId, m.period_end, d.currency, JSON.stringify(m.lines), note, userId])
    written++
  }
  return { written }
}

// The bank's latest full-month cash for the company (or the group), when every account has a balance for it.
export async function bankCash(sc: { group: boolean; entity: string | null; currency: string }): Promise<{ cash: number; month: string } | null> {
  const v = await reconView(sc, 3).catch(() => null)
  const r = v?.rows.find((x) => x.cash.bank !== null && x.cash.accounts === x.cash.of)
  return r ? { cash: r.cash.bank!, month: r.month } : null
}
