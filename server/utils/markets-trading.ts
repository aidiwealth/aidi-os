// Public Markets, step 2: brokerage accounts and what they hold, trade proposals sized from the valuations, approval
// with a fresh code, manual tickets, and fills that write to holdings, cash and the books only once someone confirms
// them. The rules that size trades and the accounting for a fill are in shared/trading (tested); this file reads and
// writes the records. Wealth client accounts are tracked, but no trade is proposed for them until the compliance
// switches are on.
import { createHash, randomInt } from 'node:crypto'
import * as T from '~/shared/trading'

export interface MarketAccount { id: string; name: string; broker: string; broker_label: string | null; kind: 'taxable' | 'retirement'; owner_type: 'entity' | 'client' | 'plan'; entity_id: string | null; wm_client_id: string | null; execution: 'manual' | 'alpaca'; external_id: string | null; risk_level: string; model: Record<string, number>; cash: number; cash_as_of: string; daily_limit: number; post_journals: boolean; status: string; owner: string | null }
export const BROKERS: Record<string, string> = { alpaca: 'Alpaca', robinhood: 'Robinhood', schwab: 'Charles Schwab', fidelity: 'Fidelity', vanguard: 'Vanguard', other: 'Other' }
export const RISK_LIMITS_ALL = () => T.RISK_LIMITS
export const brokerName = (a: { broker: string; broker_label: string | null }) => a.broker_label || BROKERS[a.broker] || a.broker

export async function marketAccounts(id?: string): Promise<MarketAccount[]> {
  return (await db().query<MarketAccount & { cash: string; daily_limit: string }>(
    `SELECT a.id, a.name, a.broker, a.broker_label, a.kind, a.owner_type, a.entity_id, a.wm_client_id, a.execution, a.external_id, a.risk_level, a.model, a.cash::text, a.cash_as_of, a.daily_limit::text, a.post_journals, a.status,
            coalesce(e.name, c.name) AS owner
       FROM markets.accounts a LEFT JOIN core.entities e ON e.id = a.entity_id LEFT JOIN wm.clients c ON c.id = a.wm_client_id
      WHERE a.status = 'active' AND ($1::uuid IS NULL OR a.id = $1::uuid) ORDER BY a.owner_type = 'client', a.created_at`, [id ?? null])).rows
    .map((a) => ({ ...a, cash: Number(a.cash), daily_limit: Number(a.daily_limit) }))
}
export async function marketAccount(id: string): Promise<MarketAccount> {
  const a = /^[0-9a-f-]{36}$/.test(id) ? (await marketAccounts(id))[0] : undefined
  if (!a) throw apiError('not_found', 'Account not found.', 404)
  return a
}

// Positions with live prices, weights and the latest signal.
export interface LivePosition { symbol: string; name: string; kind: MarketKind; qty: number; cost: number; price: number | null; value: number; change_pct: number | null; weight: number; signal: string | null; signal_label: string | null; mos: number | null; fair_value: number | null; data_ok: boolean; live: boolean; as_of: string | null; ai_headline: string | null }
export async function livePositions(accountIds: string[]): Promise<Map<string, { cash: number; value: number; positions: LivePosition[] }>> {
  const rows = (await db().query<{ account_id: string; symbol: string; name: string; kind: MarketKind; qty: string; cost: string }>(
    'SELECT p.account_id, p.symbol, i.name, i.kind, p.qty::text, p.cost::text FROM markets.positions p JOIN markets.instruments i ON i.symbol = p.symbol WHERE p.account_id = ANY($1::uuid[]) AND p.qty > 0 ORDER BY p.symbol', [accountIds])).rows
  const qs = await quoteMany(rows.map((r) => ({ symbol: r.symbol, kind: r.kind })))
  const syms = [...new Set(rows.map((r) => r.symbol))]
  const vals = new Map<string, MarketValuation>()
  for (const s of syms) { const v = await valuationById(s); if (v) vals.set(s, v) }
  const heads = new Map((await db().query<{ symbol: string; h: string }>("SELECT DISTINCT ON (symbol) symbol, review->>'headline' AS h FROM markets.ai_reviews WHERE symbol = ANY($1) ORDER BY symbol, created_at DESC", [syms])).rows.map((r) => [r.symbol, r.h]))
  const horizon = (await marketAssumptions()).horizon_years.value ?? 3
  const cash = new Map((await db().query<{ id: string; cash: string }>('SELECT id, cash::text FROM markets.accounts WHERE id = ANY($1::uuid[])', [accountIds])).rows.map((r) => [r.id, Number(r.cash)]))
  const out = new Map<string, { cash: number; value: number; positions: LivePosition[] }>()
  for (const id of accountIds) out.set(id, { cash: cash.get(id) ?? 0, value: cash.get(id) ?? 0, positions: [] })
  for (const r of rows) {
    const q = qs.get(r.symbol) ?? null, qty = Number(r.qty), v = vals.get(r.symbol) ?? null
    const lv = q && v ? liveSignal(v, q.price, horizon) : null
    const p: LivePosition = { symbol: r.symbol, name: r.name, kind: r.kind, qty, cost: Number(r.cost), price: q?.price ?? null, value: q ? qty * q.price : 0, change_pct: q?.change_pct ?? null, weight: 0, signal: lv?.signal ?? null, signal_label: lv?.label ?? null, mos: lv?.mos ?? null, fair_value: v?.fair_value ?? null, data_ok: v?.result?.data_ok !== false, live: !!q?.live, as_of: q?.as_of ?? null, ai_headline: heads.get(r.symbol) ?? null }
    const a = out.get(r.account_id)!; a.positions.push(p); a.value += p.value
  }
  for (const a of out.values()) for (const p of a.positions) p.weight = a.value ? (p.value / a.value) * 100 : 0
  return out
}

// ── Investments & AUM: each position (and the account's cash) is a line there, valued live ────────────────────────
export async function syncHolding(a: MarketAccount, symbol: string | null, qty: number, cost: number, value: number, realised = 0): Promise<string> {
  const i = symbol ? await marketInstrument(symbol) : null
  const key = 'mkt:' + a.id + ':' + (symbol ?? '$CASH')
  const section = a.owner_type === 'client' ? 'client' : 'family'
  const category = a.kind === 'retirement' ? 'retirement' : !symbol ? 'cash' : i?.kind === 'crypto' ? 'crypto' : 'public_securities'
  const name = symbol ? symbol + ' · ' + (i?.name ?? symbol) : 'Cash at ' + brokerName(a)
  const client = a.wm_client_id ? (await db().query<{ name: string }>('SELECT name FROM wm.clients WHERE id = $1', [a.wm_client_id])).rows[0]?.name ?? null : null
  const meta = { market_account_id: a.id, symbol, qty, valuation: 'market', account: a.name + ' · ' + brokerName(a) }
  const status = symbol && qty <= 0 ? 'sold' : 'active'
  const have = (await db().query<{ id: string }>('SELECT id FROM wealth.holdings WHERE import_key = $1', [key])).rows[0]
  if (have) {
    await db().query("UPDATE wealth.holdings SET name = $2, category = $3, platform = $4, cost = $5, current_value = $6, realized = coalesce(realized, 0) + $7, status = $8, as_of = current_date, meta = meta || $9::jsonb, entity_id = $10, updated_at = now() WHERE id = $1",
      [have.id, name.slice(0, 200), category, brokerName(a), cost, Math.round(value * 100) / 100, realised, status, JSON.stringify(meta), a.entity_id])
    return have.id
  }
  return (await db().query<{ id: string }>("INSERT INTO wealth.holdings (entity_id, client_name, wm_client_id, section, category, name, platform, currency, cost, current_value, status, as_of, meta, import_key) VALUES ($1,$2,$3,$4,$5,$6,$7,'USD',$8,$9,$10,current_date,$11,$12) RETURNING id",
    [a.entity_id, client, a.wm_client_id, section, category, name.slice(0, 200), brokerName(a), cost, Math.round(value * 100) / 100, status, JSON.stringify(meta), key])).rows[0]!.id
}
// Live values for every market position and cash line (the scheduled run and the Accounts page call this).
export async function revalueMarketHoldings(): Promise<number> {
  const accts = await marketAccounts()
  if (!accts.length) return 0
  const live = await livePositions(accts.map((a) => a.id))
  let n = 0
  for (const a of accts) {
    const l = live.get(a.id)!
    for (const p of l.positions) if (p.price != null) { await db().query("UPDATE wealth.holdings SET current_value = $2, as_of = current_date, updated_at = now() WHERE import_key = $1 AND current_value IS DISTINCT FROM $2", ['mkt:' + a.id + ':' + p.symbol, Math.round(p.value * 100) / 100]); n++ }
    await db().query("UPDATE wealth.holdings SET current_value = $2, cost = $2, as_of = current_date, updated_at = now() WHERE import_key = $1 AND current_value IS DISTINCT FROM $2", ['mkt:' + a.id + ':$CASH', a.cash])
  }
  return n
}
// Opening positions and cash as they stand at the broker (no journals: they are already in the books, or the account
// is new to Aidi OS). Positions not listed are left as they are; a quantity of 0 removes one.
export async function setOpening(a: MarketAccount, rows: { symbol: string; qty: number; cost: number }[], cash: number | null): Promise<void> {
  for (const r of rows) {
    const i = await ensureInstrument(r.symbol)
    if (!i) throw apiError('invalid', r.symbol + ' is not a symbol we can price.')
    if (r.qty <= 0) { await db().query('DELETE FROM markets.positions WHERE account_id = $1 AND symbol = $2', [a.id, i.symbol]); await syncHolding(a, i.symbol, 0, 0, 0); continue }
    const q = await quoteOf(i)
    const hid = await syncHolding(a, i.symbol, r.qty, r.cost, q ? q.price * r.qty : r.cost)
    await db().query('INSERT INTO markets.positions (account_id, symbol, qty, cost, holding_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_id, symbol) DO UPDATE SET qty = EXCLUDED.qty, cost = EXCLUDED.cost, holding_id = EXCLUDED.holding_id, updated_at = now()', [a.id, i.symbol, r.qty, r.cost, hid])
  }
  if (cash != null) { await db().query('UPDATE markets.accounts SET cash = $2, cash_as_of = now() WHERE id = $1', [a.id, cash]); await syncHolding({ ...a, cash }, null, 0, cash, cash) }
}

// ── Proposals ────────────────────────────────────────────────────────────────────────────────────────────────────
// Trades for one account from today's valuations: what it holds, plus watchlist stocks it could start. Proposals still
// waiting for the same symbol are not repeated. Wealth client accounts get none until the compliance switches are on.
export async function proposeFor(a: MarketAccount, userId: string | null): Promise<number> {
  if (a.owner_type === 'client') throw apiError('compliance', 'Trades are not proposed for client accounts until the compliance switches are on.', 409)
  await db().query("UPDATE markets.proposals SET status = 'expired' WHERE account_id = $1 AND status = 'waiting' AND expires_at < now()", [a.id])
  const live = (await livePositions([a.id])).get(a.id)!
  const watch = (await db().query<{ symbol: string; name: string; kind: MarketKind }>("SELECT w.symbol, i.name, i.kind FROM markets.watchlist w JOIN markets.instruments i ON i.symbol = w.symbol WHERE i.kind = 'stock'")).rows
  const horizon = (await marketAssumptions()).horizon_years.value ?? 3
  const cq = await quoteMany(watch)
  const cand: T.Holding[] = []
  for (const w of watch) {
    if (live.positions.some((p) => p.symbol === w.symbol)) continue
    const q = cq.get(w.symbol), v = await valuationById(w.symbol), lv = q && v ? liveSignal(v, q.price, horizon) : null
    if (q && lv) cand.push({ symbol: w.symbol, kind: 'stock', qty: 0, price: q.price, signal: lv.signal, mos: lv.mos, dataOk: v!.result?.data_ok !== false, priceFresh: q.live || Date.now() - Date.parse(q.as_of) < 4 * 86400e3, label: (await latestReview(w.symbol))?.review.headline ?? null })
  }
  const open = (await db().query<{ symbol: string }>("SELECT symbol FROM markets.proposals WHERE account_id = $1 AND status IN ('waiting', 'approved', 'ticket')", [a.id])).rows.map((r) => r.symbol)
  // Shares from a pre-IPO holding stay put until the lock-up ends.
  open.push(...(await db().query<{ symbol: string }>('SELECT symbol FROM markets.positions WHERE account_id = $1 AND lockup_until > current_date', [a.id])).rows.map((r) => r.symbol))
  const used = Number((await db().query<{ s: string }>("SELECT coalesce(sum(notional), 0)::text AS s FROM markets.proposals WHERE account_id = $1 AND status IN ('approved', 'ticket', 'filled') AND decided_at > now() - interval '1 day'", [a.id])).rows[0]!.s)
  const drafts = T.sizeTrades({ cash: live.cash, risk: a.risk_level, fractional: a.execution === 'alpaca', open, dailyUsed: used, dailyLimit: a.daily_limit,
    holdings: live.positions.filter((p) => p.price != null).map((p) => ({ symbol: p.symbol, kind: p.kind, qty: p.qty, price: p.price!, signal: p.signal as T.Holding['signal'], mos: p.mos, dataOk: p.data_ok, priceFresh: p.live || (p.as_of ? Date.now() - Date.parse(p.as_of) < 4 * 86400e3 : false), label: p.ai_headline })),
    candidates: cand })
  let n = 0
  for (const d of drafts) {
    if (open.includes(d.symbol)) continue
    const v = await valuationById(d.symbol)
    await db().query("INSERT INTO markets.proposals (account_id, symbol, side, qty, limit_price, notional, reason, checks, valuation_id, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + interval '1 day', $10)",
      [a.id, d.symbol, d.side, d.qty, d.limit, d.notional, d.reason, JSON.stringify([...d.checks, { name: 'Weight', ok: true, detail: d.weight_now.toFixed(1) + '% → ' + d.weight_after.toFixed(1) + '%' }]), v?.id ?? null, userId])
    n++
  }
  return n
}

// ── A fresh code before approving ────────────────────────────────────────────────────────────────────────────────
// Authenticator code (or a recovery code) for people with two-step on; otherwise a 6-digit code sent by email, valid
// for 10 minutes and five tries.
export async function hasAuthenticator(userId: string) { return !!(await mfaRow(userId))?.enabled_at }
export async function sendFreshCode(userId: string, what: string): Promise<void> {
  const u = (await db().query<{ email: string }>('SELECT email FROM core.users WHERE id = $1', [userId])).rows[0]
  if (!u) throw apiError('forbidden', 'No email for this account.', 403)
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db().query('UPDATE markets.confirm_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL', [userId])
  await db().query("INSERT INTO markets.confirm_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')", [userId, createHash('sha256').update(code).digest('hex')])
  try { await sendApprovalCode(u.email, code, what) }
  catch (e) { await db().query('UPDATE markets.confirm_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL', [userId]); console.error('[markets] code email', (e as Error).message); throw apiError('email_failed', 'The code could not be emailed just now. Try again, or set up an authenticator app in your account.', 502) }
}
export async function checkFreshCode(userId: string, code: string): Promise<void> {
  const c = String(code ?? '').trim()
  if (!c) throw apiError('code_required', 'Enter the code to approve.', 400)
  if (await hasAuthenticator(userId)) { if (!(await verifySecondFactor(userId, c))) throw apiError('wrong_code', 'That code is not right.', 400); return }
  const row = (await db().query<{ id: string; code_hash: string }>('SELECT id, code_hash FROM markets.confirm_codes WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [userId])).rows[0]
  if (!row) throw apiError('no_code', 'Ask for a code first; it is emailed to you.', 400)
  const n = (await db().query<{ attempts: number }>('UPDATE markets.confirm_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [row.id])).rows[0]!.attempts
  if (n > 5) { await db().query('UPDATE markets.confirm_codes SET consumed_at = now() WHERE id = $1', [row.id]); throw apiError('too_many_attempts', 'Too many tries. Ask for a new code.', 429) }
  if (createHash('sha256').update(c).digest('hex') !== row.code_hash) throw apiError('wrong_code', 'That code is not right.', 400)
  await db().query('UPDATE markets.confirm_codes SET consumed_at = now() WHERE id = $1', [row.id])
}

// ── Fills ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface FillPreview { position_before: { qty: number; cost: number }; position_after: { qty: number; cost: number }; cash_before: number; cash_after: number; realised: number; journal: { entity: string | null; lines: { account: string; debit: number; credit: number }[] } | null; journal_why: string | null }
export async function previewFill(f: { account_id: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number; fees: number }): Promise<FillPreview> {
  const a = await marketAccount(f.account_id), i = await marketInstrument(f.symbol)
  const p = (await db().query<{ qty: string; cost: string }>('SELECT qty::text, cost::text FROM markets.positions WHERE account_id = $1 AND symbol = $2', [a.id, f.symbol])).rows[0]
  const before = { qty: Number(p?.qty ?? 0), cost: Number(p?.cost ?? 0) }
  const e = T.applyFill(before, f)
  const books = a.post_journals && a.owner_type === 'entity' && !!a.entity_id
  return { position_before: before, position_after: { qty: e.qty, cost: e.cost }, cash_before: a.cash, cash_after: Math.round((a.cash + e.cash_change) * 100) / 100, realised: e.realised,
    journal: books ? { entity: a.owner, lines: T.fillJournal(e, f.side, i?.kind ?? 'stock', brokerName(a)) } : null,
    journal_why: books ? null : a.owner_type === 'plan' ? 'The retirement plan holds its own assets: holdings and cash only.' : a.owner_type === 'client' ? 'A client account: recorded on the client, not in the group\'s books.' : 'Journals are off for this account.' }
}
// Confirm: the position, the account's cash, the Investments & AUM lines and (for a company account) the journal are
// written in one database transaction, with what was written kept on the fill.
export async function confirmFill(id: string, userId: string): Promise<FillPreview> {
  const f = (await db().query<{ id: string; account_id: string; proposal_id: string | null; symbol: string; side: 'buy' | 'sell'; qty: string; price: string; fees: string; filled_at: string; status: string }>('SELECT id, account_id, proposal_id, symbol, side, qty::text, price::text, fees::text, filled_at::text, status FROM markets.fills WHERE id = $1', [id])).rows[0]
  if (!f) throw apiError('not_found', 'Fill not found.', 404)
  if (f.status !== 'pending') throw apiError('invalid', 'This fill was already ' + f.status + '.', 409)
  const fill = { account_id: f.account_id, symbol: f.symbol, side: f.side, qty: Number(f.qty), price: Number(f.price), fees: Number(f.fees) }
  let pv: FillPreview
  try { pv = await previewFill(fill) } catch (e) { throw apiError('invalid', (e as Error).message, 409) }
  const a = await marketAccount(f.account_id)
  const c = await db().connect()
  try {
    await c.query('BEGIN')
    // Only one person can confirm it.
    const lock = await c.query("UPDATE markets.fills SET status = 'confirmed', decided_by = $2, decided_at = now(), effects = $3 WHERE id = $1 AND status = 'pending' RETURNING id", [id, userId, JSON.stringify(pv)])
    if (!lock.rowCount) throw apiError('invalid', 'Someone else just decided this fill.', 409)
    await c.query("INSERT INTO markets.positions (account_id, symbol, qty, cost) VALUES ($1,$2,$3,$4) ON CONFLICT (account_id, symbol) DO UPDATE SET qty = EXCLUDED.qty, cost = EXCLUDED.cost, updated_at = now()", [a.id, f.symbol, pv.position_after.qty, pv.position_after.cost])
    await c.query('UPDATE markets.accounts SET cash = $2, cash_as_of = now() WHERE id = $1', [a.id, pv.cash_after])
    if (pv.journal && a.entity_id) for (const l of pv.journal.lines) await c.query('INSERT INTO finance.journal (entity_id, entry_date, account, debit, credit, currency, memo, market_fill_id) VALUES ($1, $2::date, $3, $4, $5, \'USD\', $6, $7)', [a.entity_id, f.filled_at.slice(0, 10), l.account, l.debit, l.credit, (f.side === 'buy' ? 'Bought ' : 'Sold ') + Number(f.qty) + ' ' + f.symbol + ' at ' + Number(f.price) + ' (' + a.name + ', ' + brokerName(a) + ')', id])
    if (f.proposal_id) await c.query("UPDATE markets.proposals SET status = 'filled' WHERE id = $1", [f.proposal_id])
    await c.query('COMMIT')
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e } finally { c.release() }
  // Investments & AUM lines (after the commit, from the confirmed figures).
  const q = await quoteOf((await marketInstrument(f.symbol))!)
  const hid = await syncHolding({ ...a, cash: pv.cash_after }, f.symbol, pv.position_after.qty, pv.position_after.cost, (q?.price ?? fill.price) * pv.position_after.qty, pv.realised)
  await db().query('UPDATE markets.positions SET holding_id = $3 WHERE account_id = $1 AND symbol = $2', [a.id, f.symbol, hid])
  await syncHolding({ ...a, cash: pv.cash_after }, null, 0, pv.cash_after, pv.cash_after)
  return pv
}
