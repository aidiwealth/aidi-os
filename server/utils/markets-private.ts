// Pre-IPO secondaries in Public markets. A deal from Secondaries gets its terms (offer per share, last round, SPV fee
// and carry, lock-up), an AI value range and review, and a signal from the gap after fees. Each group account is
// sized under its pre-IPO limit; a proposal becomes a commitment that is approved with a fresh code, then signed,
// wired and confirmed with the units from the SPV statement. Confirming writes the holding (and, for a company
// account, the journal) together. After an IPO the holding becomes a listed position in the same account, locked up.
import * as T from '~/shared/trading'

export interface PrivateDeal { id: string; company: string; title: string; sector: string | null; stage: string | null; status: string; source: string; min_investment: number | null; closes_at: string | null; offer_price: number | null; last_round_price: number | null; last_round: string | null; fee_pct: number; carry_pct: number; lockup_days: number; spv_name: string | null; value_low: number | null; value_base: number | null; value_high: number | null; ai_value: Record<string, any> | null; ai_value_at: string | null; mark_price: number | null; mark_on: string | null; listed_symbol: string | null; listed_on: string | null; client_visible: boolean; effective: number | null; mos: number | null; signal: T.PrivateSignal | null; held_units: number; held_cost: number; held_value: number }
const SIG: Record<string, string> = { strong_buy: 'Strong buy', buy: 'Buy', hold: 'Hold', pass: 'Pass' }
export const privateSignalLabel = (s: string | null) => (s ? SIG[s] ?? s : null)

export async function privateDeals(id?: string): Promise<PrivateDeal[]> {
  await expireSecondaries().catch(() => {})
  const rows = (await db().query<Record<string, any>>(`SELECT s.id, coalesce(nullif(s.company, ''), s.title) AS company, s.title, s.sector, s.stage, s.status, s.source, s.min_investment::float, to_char(s.closes_at, 'YYYY-MM-DD') AS closes_at,
      s.offer_price::float, s.last_round_price::float, s.last_round, s.fee_pct::float, s.carry_pct::float, s.lockup_days, s.spv_name, s.value_low::float, s.value_base::float, s.value_high::float, s.ai_value, s.ai_value_at, s.mark_price::float, to_char(s.mark_on, 'YYYY-MM-DD') AS mark_on, s.listed_symbol, to_char(s.listed_on, 'YYYY-MM-DD') AS listed_on, s.client_visible,
      coalesce((SELECT sum(c.units) FROM markets.commitments c WHERE c.secondary_id = s.id AND c.status = 'confirmed'), 0)::float AS held_units,
      coalesce((SELECT sum(c.amount + coalesce(c.fees, 0)) FROM markets.commitments c WHERE c.secondary_id = s.id AND c.status = 'confirmed'), 0)::float AS held_cost
    FROM wm.secondaries s WHERE ${id ? 's.id = $1' : "(s.status IN ('new', 'reviewing', 'interested', 'invested', 'listed') OR EXISTS (SELECT 1 FROM markets.commitments c WHERE c.secondary_id = s.id)) AND s.fits IS NOT FALSE"}
    ORDER BY (s.status = 'listed'), s.closes_at NULLS LAST, s.received_at DESC LIMIT 100`, id ? [id] : [])).rows
  return rows.map((r) => { const sg = T.privateSignal(r.value_base, r.offer_price, r.fee_pct); return { ...r, ...sg, held_value: r.held_units * (r.mark_price ?? r.offer_price ?? 0) } as PrivateDeal })
}

// The value of each account's pre-IPO holdings (from the Investments & AUM lines they wrote).
async function privateValue(accountIds: string[]) {
  const rows = (await db().query<{ acct: string; v: string }>("SELECT split_part(import_key, ':', 2) AS acct, sum(current_value)::text AS v FROM wealth.holdings WHERE import_key LIKE 'pvt:%' AND status = 'active' AND split_part(import_key, ':', 2) = ANY($1) GROUP BY 1", [accountIds])).rows
  return new Map(rows.map((r) => [r.acct, Number(r.v)]))
}
export async function privateSizing(d: PrivateDeal) {
  const accts = (await marketAccounts()).filter((a) => a.status === 'active')
  const live = await livePositions(accts.map((a) => a.id)), pv = await privateValue(accts.map((a) => a.id))
  const open = new Set((await db().query<{ account_id: string }>("SELECT account_id FROM markets.commitments WHERE secondary_id = $1 AND status IN ('waiting', 'approved', 'signed', 'wired')", [d.id])).rows.map((r) => r.account_id))
  return accts.map((a) => {
    const priv = pv.get(a.id) ?? 0, value = (live.get(a.id)?.value ?? a.cash) + priv
    const s = T.sizePrivate({ value, privateNow: priv, risk: a.risk_level, signal: d.signal, min: d.min_investment ?? 0, retirement: a.kind === 'retirement' || a.owner_type === 'plan', client: a.owner_type === 'client', open: open.has(a.id) })
    return { account_id: a.id, name: a.name, broker: brokerName(a), owner: a.owner, owner_type: a.owner_type, risk: a.risk_level, value: Math.round(value), private_now: Math.round(priv), private_pct: value ? Math.round((priv / value) * 1000) / 10 : 0, cap: T.limitsFor(a.risk_level).private, ...s }
  })
}

export async function proposePrivate(dealId: string, rows: { account_id: string; amount: number }[], userId: string) {
  const d = (await privateDeals(dealId))[0]
  if (!d) throw apiError('not_found', 'Deal not found.', 404)
  if (!d.offer_price) throw apiError('invalid', 'Add the offer price per share first.', 400)
  const sized = await privateSizing(d)
  let n = 0
  for (const r of rows) {
    const s = sized.find((x) => x.account_id === r.account_id)
    if (!s || !(r.amount > 0)) continue
    // The checks are worked out again for the amount actually proposed.
    const again = T.sizePrivate({ value: s.value, privateNow: s.private_now, risk: s.risk, signal: 'strong_buy', min: d.min_investment ?? 0, retirement: s.owner_type === 'plan' || s.reason.startsWith('Retirement'), client: s.owner_type === 'client', open: s.checks.some((c) => c.name === 'No open commitment in it' && !c.ok) })
    const after = s.value ? ((s.private_now + r.amount) / s.value) * 100 : 0
    const checks = again.checks.map((c) => (c.name === 'Pre-IPO limit' ? { ...c, ok: after <= s.cap + 0.01, detail: s.private_pct.toFixed(1) + '% → ' + after.toFixed(1) + '% of ' + s.cap + '%' } : c.name === 'Deal minimum' ? { ...c, ok: r.amount >= (d.min_investment ?? 0) } : c))
    await db().query('INSERT INTO markets.commitments (account_id, secondary_id, amount, reason, checks, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [r.account_id, d.id, Math.round(r.amount * 100) / 100, s.reason, JSON.stringify([...checks, { name: 'Signal', ok: d.signal === 'buy' || d.signal === 'strong_buy', detail: (privateSignalLabel(d.signal) ?? 'not set') + (d.mos != null ? ' · ' + d.mos + '% below value after fees' : '') }]), userId])
    n++
  }
  if (n) await db().query("UPDATE wm.secondaries SET status = CASE WHEN status IN ('new', 'reviewing') THEN 'interested' ELSE status END, updated_at = now() WHERE id = $1", [d.id])
  return n
}

// The Investments & AUM line for one account's stake in one deal.
async function syncPrivateHolding(a: Awaited<ReturnType<typeof marketAccount>>, d: PrivateDeal, units: number, cost: number) {
  const key = 'pvt:' + a.id + ':' + d.id, value = Math.round(units * (d.mark_price ?? d.offer_price ?? cost / Math.max(units, 1)) * 100) / 100
  const client = a.wm_client_id ? (await db().query<{ name: string }>('SELECT name FROM wm.clients WHERE id = $1', [a.wm_client_id])).rows[0]?.name ?? null : null
  const meta = { market_account_id: a.id, secondary_id: d.id, units, valuation: d.mark_price ? 'mark' : 'offer', lockup_days: d.lockup_days, account: a.name }
  const have = (await db().query<{ id: string }>('SELECT id FROM wealth.holdings WHERE import_key = $1', [key])).rows[0]
  if (have) { await db().query("UPDATE wealth.holdings SET cost = $2, current_value = $3, meta = meta || $4::jsonb, status = 'active', as_of = current_date, updated_at = now() WHERE id = $1", [have.id, cost, value, JSON.stringify(meta)]); return have.id }
  return (await db().query<{ id: string }>("INSERT INTO wealth.holdings (entity_id, client_name, wm_client_id, section, category, name, platform, currency, cost, current_value, status, as_of, meta, import_key) VALUES ($1,$2,$3,$4,'secondaries',$5,$6,'USD',$7,$8,'active',current_date,$9,$10) RETURNING id",
    [a.entity_id, client, a.wm_client_id, a.owner_type === 'client' ? 'client' : 'family', (d.company + ' (pre-IPO)').slice(0, 200), d.spv_name || 'SPV', cost, value, JSON.stringify(meta), key])).rows[0]!.id
}

// Steps of a commitment: approve (fresh code, every check passing), signed, wired, confirm (units and price), or stop.
export async function commitmentAct(id: string, userId: string, a: { action: string; code?: string; units?: number; price?: number; fees?: number; date?: string; note?: string }) {
  const c = (await db().query<{ id: string; account_id: string; secondary_id: string; amount: string; status: string; checks: { ok: boolean }[] }>('SELECT id, account_id, secondary_id, amount::text, status, checks FROM markets.commitments WHERE id = $1', [id])).rows[0]
  if (!c) throw apiError('not_found', 'Not found.', 404)
  const need = (from: string[]) => { if (!from.includes(c.status)) throw apiError('state', 'This commitment is ' + c.status + '.', 409) }
  if (a.action === 'approve') {
    need(['waiting'])
    if (c.checks.some((x) => !x.ok)) throw apiError('checks', 'Every check must pass before approving.', 409)
    await checkFreshCode(userId, a.code ?? '')
    await db().query("UPDATE markets.commitments SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1 AND status = 'waiting'", [id, userId])
  } else if (a.action === 'signed') { need(['approved']); await db().query("UPDATE markets.commitments SET status = 'signed', signed_at = now() WHERE id = $1", [id]) }
  else if (a.action === 'wired') { need(['approved', 'signed']); await db().query("UPDATE markets.commitments SET status = 'wired', wired_at = now() WHERE id = $1", [id]) }
  else if (a.action === 'reject' || a.action === 'cancel') { need(['waiting', 'approved', 'signed']); await db().query('UPDATE markets.commitments SET status = $2, note = $3 WHERE id = $1', [id, a.action === 'reject' ? 'rejected' : 'cancelled', (a.note ?? '').slice(0, 500) || null]) }
  else if (a.action === 'confirm') {
    need(['wired', 'signed', 'approved'])
    const units = Number(a.units), price = Number(a.price), fees = Number(a.fees ?? 0), amount = Number(c.amount)
    if (!(units > 0) || !(price > 0) || fees < 0) throw apiError('invalid', 'Enter the units and the price per unit from the SPV statement.')
    const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date ?? '') ? a.date! : new Date().toISOString().slice(0, 10)
    const acct = await marketAccount(c.account_id), d = (await privateDeals(c.secondary_id))[0]!
    const books = acct.post_journals && acct.owner_type === 'entity' && !!acct.entity_id
    const lines = books ? T.privateJournal(amount, fees) : null
    const prev = (await db().query<{ u: string; k: string }>("SELECT coalesce(sum(units), 0)::text AS u, coalesce(sum(amount + coalesce(fees, 0)), 0)::text AS k FROM markets.commitments WHERE account_id = $1 AND secondary_id = $2 AND status = 'confirmed'", [acct.id, d.id])).rows[0]!
    const cx = await db().connect()
    try {
      await cx.query('BEGIN')
      const lock = await cx.query("UPDATE markets.commitments SET status = 'confirmed', units = $2, price = $3, fees = $4, confirmed_by = $5, confirmed_at = now(), effects = $6 WHERE id = $1 AND status IN ('approved', 'signed', 'wired') RETURNING id", [id, units, price, fees, userId, JSON.stringify({ journal: lines, date })])
      if (!lock.rowCount) throw apiError('state', 'Someone else just decided this commitment.', 409)
      if (lines && acct.entity_id) for (const l of lines) await cx.query("INSERT INTO finance.journal (entity_id, entry_date, account, debit, credit, currency, memo, market_commitment_id) VALUES ($1, $2::date, $3, $4, $5, 'USD', $6, $7)", [acct.entity_id, date, l.account, l.debit, l.credit, 'Pre-IPO: ' + units + ' units of ' + d.company + (d.spv_name ? ' via ' + d.spv_name : ''), id])
      await cx.query('COMMIT')
    } catch (e) { await cx.query('ROLLBACK').catch(() => {}); throw e } finally { cx.release() }
    const hid = await syncPrivateHolding(acct, { ...d, offer_price: d.offer_price ?? price }, Number(prev.u) + units, Number(prev.k) + amount + fees)
    await db().query('UPDATE markets.commitments SET holding_id = $2 WHERE id = $1', [id, hid])
    await db().query("UPDATE wm.secondaries SET status = 'invested', updated_at = now() WHERE id = $1 AND status <> 'listed'", [d.id])
  } else throw apiError('invalid', 'Unknown action.')
}

// A new mark (a later round, a tender offer or the SPV's own report) re-values every holding in the deal.
export async function markPrivate(dealId: string, price: number, note: string) {
  if (!(price > 0)) throw apiError('invalid', 'Enter the price per share.')
  await db().query('UPDATE wm.secondaries SET mark_price = $2, mark_on = current_date, mark_note = $3, updated_at = now() WHERE id = $1', [dealId, price, note.slice(0, 300) || null])
  await db().query("UPDATE wealth.holdings SET current_value = round((meta->>'units')::numeric * $2, 2), as_of = current_date, meta = meta || '{\"valuation\": \"mark\"}'::jsonb, updated_at = now() WHERE import_key LIKE 'pvt:%:' || $1 AND status = 'active'", [dealId, price])
}

// The company listed: each account's units become shares of the listed symbol in the same account, at the same cost,
// locked up for the deal's lock-up; the pre-IPO line closes and the Public markets line takes over.
export async function listPrivate(dealId: string, symbol: string, date: string) {
  const sym = symbol.trim().toUpperCase()
  if (!/^[A-Z0-9.\-]{1,12}$/.test(sym) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw apiError('invalid', 'Enter the ticker and the listing date.')
  const i = await ensureInstrument(sym)
  if (!i) throw apiError('invalid', 'We could not find ' + sym + ' as a listed US symbol yet.', 400)
  const d = (await privateDeals(dealId))[0]
  if (!d) throw apiError('not_found', 'Deal not found.', 404)
  await db().query("UPDATE wm.secondaries SET listed_symbol = $2, listed_on = $3, status = 'listed', updated_at = now() WHERE id = $1", [dealId, sym, date])
  const held = (await db().query<{ account_id: string; units: string; cost: string }>("SELECT account_id, sum(units)::text AS units, sum(amount + coalesce(fees, 0))::text AS cost FROM markets.commitments WHERE secondary_id = $1 AND status = 'confirmed' GROUP BY account_id", [dealId])).rows
  for (const h of held) {
    const a = await marketAccount(h.account_id)
    await db().query("INSERT INTO markets.positions (account_id, symbol, qty, cost, lockup_until) VALUES ($1,$2,$3,$4,$5::date + $6::int) ON CONFLICT (account_id, symbol) DO UPDATE SET qty = markets.positions.qty + EXCLUDED.qty, cost = markets.positions.cost + EXCLUDED.cost, lockup_until = greatest(markets.positions.lockup_until, EXCLUDED.lockup_until), updated_at = now()", [a.id, sym, Number(h.units), Number(h.cost), date, d.lockup_days])
    await db().query("UPDATE wealth.holdings SET status = 'sold', notes = coalesce(notes || ' ', '') || $2, updated_at = now() WHERE import_key = $1", ['pvt:' + a.id + ':' + dealId, 'Listed as ' + sym + ' on ' + date + '.'])
    const p = (await db().query<{ qty: string; cost: string }>('SELECT qty::text, cost::text FROM markets.positions WHERE account_id = $1 AND symbol = $2', [a.id, sym])).rows[0]!
    const q = await quoteOf(i).catch(() => null)
    const hid = await syncHolding(a, sym, Number(p.qty), Number(p.cost), (q?.price ?? Number(p.cost) / Number(p.qty)) * Number(p.qty))
    await db().query('UPDATE markets.positions SET holding_id = $3 WHERE account_id = $1 AND symbol = $2', [a.id, sym, hid])
  }
  return held.length
}

// The AI's value range and review for a deal, from the web (rounds, tenders, revenue, listed peers). The model gives
// the inputs and its reasoning; the signal is worked out from the numbers, not by the AI.
export async function aiPrivateValue(dealId: string) {
  const d = (await privateDeals(dealId))[0]
  if (!d) throw apiError('not_found', 'Deal not found.', 404)
  const { output } = await aiWithWeb<{ last_round_price: number | null; last_round: string | null; value_low: number | null; value_base: number | null; value_high: number | null; method: string; headline: string; thesis: string; risks: string[]; catalysts: string[]; thesis_break: string; exit: string; sources: { title: string; url: string }[] }>({
    task: 'markets_private_value', web: true, maxUses: 6, maxTokens: 1800, model: (useRuntimeConfig() as unknown as Record<string, string>).aiModelMarkets || undefined,
    system: 'You value private (pre-IPO) companies for an investment team buying secondary shares through SPVs. Find the latest priced round (price per share and series), any tender or secondary prices, revenue and growth, and listed peers\' revenue multiples. Give a per-share value range (low, base, high) and how you got there. Be conservative: private marks lag and SPV shares are illiquid. Plain, short sentences. Leave a number empty if you cannot support it.',
    user: 'Company: ' + d.company + '\nDeal: ' + d.title + '\nSector: ' + (d.sector ?? '') + ' · Stage: ' + (d.stage ?? '') + '\nOffer per share: ' + (d.offer_price ?? 'not given') + (d.last_round_price ? '\nLast round we have: ' + d.last_round_price + ' (' + (d.last_round ?? '') + ')' : ''),
    tool: { name: 'record_private_value', description: 'The value range and review.', input_schema: { type: 'object', properties: { last_round_price: { type: ['number', 'null'] }, last_round: { type: ['string', 'null'] }, value_low: { type: ['number', 'null'] }, value_base: { type: ['number', 'null'] }, value_high: { type: ['number', 'null'] }, method: { type: 'string' }, headline: { type: 'string' }, thesis: { type: 'string' }, risks: { type: 'array', items: { type: 'string' } }, catalysts: { type: 'array', items: { type: 'string' } }, thesis_break: { type: 'string' }, exit: { type: 'string' }, sources: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } } } } }, required: ['method', 'headline', 'thesis', 'risks', 'catalysts', 'thesis_break', 'exit', 'sources'] } } })
  const pos = (x: number | null | undefined) => (typeof x === 'number' && x > 0 ? x : null)
  await db().query('UPDATE wm.secondaries SET ai_value = $2, ai_value_at = now(), value_low = coalesce($3, value_low), value_base = coalesce($4, value_base), value_high = coalesce($5, value_high), last_round_price = coalesce(last_round_price, $6), last_round = coalesce(last_round, $7), updated_at = now() WHERE id = $1',
    [dealId, JSON.stringify(output), pos(output.value_low), pos(output.value_base), pos(output.value_high), pos(output.last_round_price), output.last_round?.slice(0, 80) || null])
}

// A wealth client's room for pre-IPO deals: accredited (confirmed by an adviser), and up to their level's pre-IPO
// limit of what they own, less what they already hold in private companies.
export async function clientPrivateRoom(clientId: string) {
  const c = (await db().query<{ accredited: boolean; risk_profile: string | null }>('SELECT accredited, risk_profile FROM wm.clients WHERE id = $1', [clientId])).rows[0]
  const s = await clientSummary(clientId)
  const value = Math.max(0, s.totals.net_worth), now = s.holdings.filter((h) => h.category === 'secondaries' && h.currency === 'USD').reduce((a, h) => a + Number(h.current_value ?? h.cost ?? 0), 0)
  const cap = c?.risk_profile ? T.limitsFor(c.risk_profile).private : 0
  return { accredited: !!c?.accredited, level: c?.risk_profile ?? null, cap, value: Math.round(value), now: Math.round(now), now_pct: value ? Math.round((now / value) * 1000) / 10 : 0, room: Math.max(0, Math.floor(((cap / 100) * value - now) / 1000) * 1000) }
}
