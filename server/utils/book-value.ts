// Family business at book value: a holding can take its value from a company's own books (the latest balance sheet
// saved on Financials, a QuickBooks pull or an upload): the company's equity (assets less liabilities) times the share
// held. Where a holding company's books carry stakes in group companies that are themselves valued from their own
// books, those stakes come out of the parent so nothing is counted twice. Holdings that sit in no books (angel
// positions, wealth accounts, metals) keep the values entered for them and add on top.
export interface BookBasis { entity_id: string; period_end: string; source: string; currency: string; equity: number; less_subsidiaries: number; pct: number; value: number }

export async function refreshBookValues(): Promise<number> {
  const hs = (await db().query<{ id: string; currency: string; ownership_pct: string | null; current_value: string | null; book: string; basis: BookBasis | null }>(
    "SELECT id, currency, ownership_pct::text, current_value::text, meta->>'book_entity' AS book, meta->'book_basis' AS basis FROM wealth.holdings WHERE meta ? 'book_entity' AND status = 'active'")).rows
  if (!hs.length) return 0
  const valued = new Set(hs.map((h) => h.book))
  const parents = (await db().query<{ parent_id: string }>('SELECT DISTINCT parent_id FROM core.entities WHERE parent_id IS NOT NULL AND id = ANY($1::uuid[])', [[...valued]])).rows.map((r) => r.parent_id)
  let n = 0
  for (const h of hs) {
    const st = (await db().query<{ period_end: string; currency: string; source: string; lines: Record<string, unknown> }>(
      `SELECT period_end::text, currency, source, lines FROM financials.statements WHERE entity_id = $1
          AND (lines ? 'equity' OR (lines ? 'total_assets' AND lines ? 'total_liabilities')) ORDER BY period_end DESC, updated_at DESC LIMIT 1`, [h.book])).rows[0]
    if (!st) continue
    const num = (k: string) => { const v = Number(st.lines[k]); return Number.isFinite(v) ? v : null }
    const equity = num('equity') ?? (num('total_assets') ?? 0) - (num('total_liabilities') ?? 0)
    // Stakes in group companies valued on their own: out of the parent's books.
    const less = parents.includes(h.book) ? num('long_term_investments') ?? 0 : 0
    const pct = h.ownership_pct === null ? 100 : Number(h.ownership_pct)
    const k = st.currency === h.currency ? 1 : await fxRate(st.currency, h.currency)
    if (!k) continue
    const value = Math.round((equity - less) * pct / 100 * k * 100) / 100
    const basis: BookBasis = { entity_id: h.book, period_end: st.period_end, source: st.source, currency: st.currency, equity, less_subsidiaries: less, pct, value }
    if (Number(h.current_value ?? NaN) === value && h.basis?.period_end === st.period_end) continue
    await db().query("UPDATE wealth.holdings SET current_value = $2, as_of = $3::date, meta = meta || jsonb_build_object('book_basis', $4::jsonb), updated_at = now() WHERE id = $1", [h.id, value, st.period_end, JSON.stringify(basis)])
    await db().query("INSERT INTO wealth.valuations (holding_id, as_of, value, note) VALUES ($1, $2::date, $3, 'Book value from the company''s balance sheet')", [h.id, st.period_end, value])
    n++
  }
  return n
}
