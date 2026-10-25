// Family business at book value: a holding can take its value from a company's own books (the latest balance sheet
// saved on Financials, a QuickBooks pull or an upload): the company's equity (assets less liabilities) times the share
// held. Where a holding company's books carry stakes in group companies that are themselves valued from their own
// books, those stakes come out of the parent so nothing is counted twice. Holdings that sit in no books (angel
// positions, wealth accounts, metals) keep the values entered for them and add on top.
// A strategic holding can do the same from a portfolio company's own figures (added on its Financials page): its
// equity times our interest, which is the share entered on the holding or, left blank, the share the Aidi Angel Fund's
// investment gives us (the stake recorded on the fund's positions, our shares over fully diluted shares, or a SAFE's
// amount over its cap, as converted).
export interface BookBasis { entity_id?: string; company_id?: string; period_end: string; source: string; currency: string; equity: number; less_subsidiaries: number; pct: number; pct_how: string; value: number }

// Our interest in a portfolio company from the Aidi Angel Fund's investment in it.
export async function fundInterest(companyId: string): Promise<{ pct: number; how: string } | null> {
  const hs = await holdingsFor(companyId)
  const stakes = hs.filter((h) => h.ownership_pct)
  if (stakes.length) { const p = stakes.reduce((a, h) => a + (h.ownership_pct ?? 0), 0); return { pct: Math.round(p * 1000) / 1000, how: stakes.map((h) => h.ownership_pct + '% ' + (h.entity ?? 'fund') + ' stake').join(' + ') } }
  const m = (await db().query<{ our_shares: number; fd_shares: number; period: string }>("SELECT our_shares::float, fd_shares::float, to_char(period, 'YYYY-MM') AS period FROM portfolio.cap_updates WHERE company_id = $1 AND our_shares > 0 AND fd_shares > 0 ORDER BY period DESC, created_at DESC LIMIT 1", [companyId])).rows[0]
  if (m) { const p = m.our_shares / m.fd_shares * 100; return { pct: Math.round(p * 1000) / 1000, how: Math.round(m.our_shares).toLocaleString('en-US') + ' of ' + Math.round(m.fd_shares).toLocaleString('en-US') + ' fully diluted shares (' + m.period + ')' } }
  const safes = hs.filter((h) => h.cap && h.cost > 0)
  if (safes.length) { const p = safes.reduce((a, h) => a + h.cost / h.cap! * 100, 0); return { pct: Math.round(p * 1000) / 1000, how: safes.map((h) => (h.entity ?? 'Fund') + ' ' + h.currency + ' ' + Math.round(h.cost).toLocaleString('en-US') + ' at a ' + Math.round(h.cap! / 1e6 * 100) / 100 + 'M cap, as converted').join(' + ') } }
  return null
}

export async function refreshBookValues(): Promise<number> {
  const hs = (await db().query<{ id: string; currency: string; ownership_pct: string | null; current_value: string | null; book: string | null; company: string | null; basis: BookBasis | null }>(
    "SELECT id, currency, ownership_pct::text, current_value::text, meta->>'book_entity' AS book, meta->>'book_company' AS company, meta->'book_basis' AS basis FROM wealth.holdings WHERE (meta ? 'book_entity' OR meta ? 'book_company') AND status = 'active'")).rows
  if (!hs.length) return 0
  const valued = new Set(hs.map((h) => h.book).filter((x): x is string => !!x))
  const parents = (await db().query<{ parent_id: string }>('SELECT DISTINCT parent_id FROM core.entities WHERE parent_id IS NOT NULL AND id = ANY($1::uuid[])', [[...valued]])).rows.map((r) => r.parent_id)
  let n = 0
  for (const h of hs) {
    const st = (await db().query<{ period_end: string; currency: string; source: string; lines: Record<string, unknown> }>(
      `SELECT period_end::text, currency, source, lines FROM financials.statements WHERE ${h.company ? 'company_id' : 'entity_id'} = $1
          AND (lines ? 'equity' OR (lines ? 'total_assets' AND lines ? 'total_liabilities')) ORDER BY period_end DESC, updated_at DESC LIMIT 1`, [h.company ?? h.book])).rows[0]
    if (!st) continue
    const num = (k: string) => { const v = Number(st.lines[k]); return Number.isFinite(v) ? v : null }
    const equity = num('equity') ?? (num('total_assets') ?? 0) - (num('total_liabilities') ?? 0)
    // Stakes in group companies valued on their own: out of the parent's books.
    const less = h.book && parents.includes(h.book) ? num('long_term_investments') ?? 0 : 0
    // Our share: as entered; else, for a portfolio company, what the fund's investment gives us; else all of it.
    const fi = h.ownership_pct === null && h.company ? await fundInterest(h.company) : null
    if (h.ownership_pct === null && h.company && !fi) continue
    const pct = h.ownership_pct !== null ? Number(h.ownership_pct) : fi ? fi.pct : 100
    const pct_how = h.ownership_pct !== null ? 'as entered' : fi ? 'from the Aidi Angel Fund\'s investment: ' + fi.how : 'all of it'
    const k = st.currency === h.currency ? 1 : await fxRate(st.currency, h.currency)
    if (!k) continue
    const value = Math.round((equity - less) * pct / 100 * k * 100) / 100
    const basis: BookBasis = { ...(h.company ? { company_id: h.company } : { entity_id: h.book! }), pct_how, period_end: st.period_end, source: st.source, currency: st.currency, equity, less_subsidiaries: less, pct, value }
    if (Number(h.current_value ?? NaN) === value && h.basis?.period_end === st.period_end && h.basis?.pct === pct) { if (h.basis?.pct_how !== pct_how) await db().query("UPDATE wealth.holdings SET meta = meta || jsonb_build_object('book_basis', $2::jsonb) WHERE id = $1", [h.id, JSON.stringify(basis)]); continue }
    await db().query("UPDATE wealth.holdings SET current_value = $2, as_of = $3::date, meta = meta || jsonb_build_object('book_basis', $4::jsonb), updated_at = now() WHERE id = $1", [h.id, value, st.period_end, JSON.stringify(basis)])
    await db().query("INSERT INTO wealth.valuations (holding_id, as_of, value, note) VALUES ($1, $2::date, $3, 'Book value from the company''s balance sheet')", [h.id, st.period_end, value])
    n++
  }
  return n
}
