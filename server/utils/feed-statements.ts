// Aidi OS: banks connected directly (live feed) keep the same monthly statement view as uploaded statements, so
// Overview, Family Office analytics, Rentals and the Journals check read them unchanged. Each connected bank account
// gets a Bank & cash account linked to it, a statement per month tied out backwards from the live balance (opening plus
// money in, less money out, equals closing), and its transactions keyed by the feed's own reference, so rent and
// expense matches made on them survive each refresh. Feed statements never go to the ledger again (the feed is there
// already); their month-end balances are kept as the feed's.

const KIND = (sub: string | null) => (/saving/i.test(sub ?? '') ? 'savings' : /money market/i.test(sub ?? '') ? 'money_market' : /^(cd|hsa|prepaid|cash management)$/i.test(sub ?? '') ? 'other' : 'current')
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y!, mo!, 0)).toISOString().slice(0, 10) }
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y!, mo! - 2, 1)); return d.toISOString().slice(0, 7) }

// A disconnected bank taken out of Banking: its accounts, statements and transactions go too.
export async function removeFeedAccounts(itemId: string): Promise<void> {
  const ids = (await db().query<{ id: string }>('SELECT a.id FROM banking.accounts a JOIN banking.plaid_accounts pa ON pa.id = a.plaid_account_id WHERE pa.item_id = $1', [itemId])).rows.map((r) => r.id)
  if (!ids.length) return
  await db().query('DELETE FROM banking.transactions WHERE account_id = ANY($1::uuid[])', [ids])
  await db().query('DELETE FROM banking.statements WHERE account_id = ANY($1::uuid[])', [ids])
  await db().query('DELETE FROM banking.accounts WHERE id = ANY($1::uuid[])', [ids])
}

export async function syncFeedStatements(itemId?: string): Promise<number> {
  const org = await currentOrg(); if (!org || org.kind === 'company') return 0
  // Accounts whose bank was disconnected: kept as history, switched off so their last balance is not counted twice.
  await db().query("UPDATE banking.accounts a SET active = false WHERE a.plaid_account_id IS NULL AND a.active AND EXISTS (SELECT 1 FROM banking.statements s WHERE s.account_id = a.id AND s.source = 'feed') AND NOT EXISTS (SELECT 1 FROM banking.statements s WHERE s.account_id = a.id AND s.source <> 'feed')")
  const accts = (await db().query<{ id: string; name: string; mask: string | null; subtype: string | null; currency: string | null; current: number | null; institution: string | null; entity_id: string | null }>(
    `SELECT pa.id, pa.name, pa.mask, pa.subtype, pa.currency, pa.current::float AS current, i.institution, i.entity_id
       FROM banking.plaid_accounts pa JOIN banking.plaid_items i ON i.id = pa.item_id
      WHERE i.wm_client_id IS NULL AND pa.type = 'depository' AND ($1::uuid IS NULL OR i.id = $1)`, [itemId ?? null])).rows
  let n = 0
  for (const pa of accts) n += await syncOne(pa).catch((e) => { console.error('[feed statements]', pa.id, (e as Error).message); return 0 })
  return n
}

async function syncOne(pa: { id: string; name: string; mask: string | null; subtype: string | null; currency: string | null; current: number | null; institution: string | null; entity_id: string | null }): Promise<number> {
  const label = feedLabel(pa.institution, pa)
  const txns = (await db().query<{ ref: string; d: string; description: string; amt: number; entity_id: string | null; currency: string }>(
    "SELECT source_ref AS ref, txn_date::text AS d, description, (CASE WHEN direction = 'in' THEN amount ELSE -amount END)::float AS amt, entity_id, currency FROM banking.ledger WHERE source = 'bank_feed' AND account_label = $1 ORDER BY txn_date, created_at", [label])).rows
  if (pa.current === null && !txns.length) return 0
  const currency = pa.currency || txns[0]?.currency || 'USD', entity = pa.entity_id ?? txns.find((t) => t.entity_id)?.entity_id ?? null
  const last4 = /^\d{4}$/.test(pa.mask ?? '') ? pa.mask : null
  const ex = (await db().query<{ id: string }>('SELECT id FROM banking.accounts WHERE plaid_account_id = $1', [pa.id])).rows[0]
  const acct = ex
    ? (await db().query('UPDATE banking.accounts SET entity_id = coalesce($2, entity_id), bank_name = $3, account_name = $4, last4 = $5, currency = $6, kind = $7, active = true WHERE id = $1', [ex.id, entity, (pa.institution ?? 'Bank').slice(0, 120), pa.name.slice(0, 160) || 'Account', last4, currency, KIND(pa.subtype)]), ex.id)
    : (await one<{ id: string }>('INSERT INTO banking.accounts (entity_id, bank_name, account_name, last4, currency, kind, active, plaid_account_id) VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING id', [entity, (pa.institution ?? 'Bank').slice(0, 120), pa.name.slice(0, 160) || 'Account', last4, currency, KIND(pa.subtype), pa.id])).id
  // Months from the first transaction to this month, in cents; the closing balance of this month is the live balance,
  // each earlier month's is the next month's closing less that month's net.
  const cents = (v: number) => Math.round(v * 100)
  const by = new Map<string, typeof txns>()
  for (const t of txns) { const m = t.d.slice(0, 7); (by.get(m) ?? by.set(m, []).get(m)!).push(t) }
  const now = new Date().toISOString().slice(0, 7), first = txns[0]?.d.slice(0, 7) ?? now
  const months: string[] = []
  for (let m = now; m >= first && months.length < 120; m = prevMonth(m)) months.push(m)
  let closing = cents(pa.current ?? txns.reduce((s, t) => s + t.amt, 0))
  const keepStmts: string[] = [], keepRefs: string[] = [], today = new Date().toISOString().slice(0, 10)
  for (const m of months) {
    const ts = by.get(m) ?? [], credits = ts.filter((t) => t.amt > 0).reduce((s, t) => s + cents(t.amt), 0), debits = ts.filter((t) => t.amt < 0).reduce((s, t) => s - cents(t.amt), 0)
    const opening = closing - credits + debits, end = monthEnd(m)
    const st = (await one<{ id: string }>(`INSERT INTO banking.statements (account_id, period_start, period_end, opening_balance, closing_balance, credits_total, debits_total, txn_count, continuity_ok, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'feed')
      ON CONFLICT (account_id, period_start, period_end) DO UPDATE SET opening_balance = EXCLUDED.opening_balance, closing_balance = EXCLUDED.closing_balance, credits_total = EXCLUDED.credits_total, debits_total = EXCLUDED.debits_total, txn_count = EXCLUDED.txn_count, continuity_ok = true, source = 'feed' RETURNING id`,
      [acct, m + '-01', end, opening / 100, closing / 100, credits / 100, debits / 100, ts.length])).id
    keepStmts.push(st)
    let bal = opening
    const rows = ts.map((t) => { bal += cents(t.amt); return { ref: t.ref, d: t.d, description: (t.description || 'Payment').slice(0, 500), amt: t.amt, bal: bal / 100 } })
    if (rows.length) await db().query(`INSERT INTO banking.transactions (statement_id, account_id, txn_date, description, amount, balance, feed_ref)
      SELECT $1, $2, x.d, x.description, x.amt, x.bal, x.ref FROM jsonb_to_recordset($3::jsonb) AS x(ref text, d date, description text, amt numeric, bal numeric)
      ON CONFLICT (account_id, feed_ref) WHERE feed_ref IS NOT NULL DO UPDATE SET statement_id = EXCLUDED.statement_id, txn_date = EXCLUDED.txn_date, description = EXCLUDED.description, amount = EXCLUDED.amount, balance = EXCLUDED.balance`, [st, acct, JSON.stringify(rows)])
    keepRefs.push(...rows.map((r) => r.ref))
    await db().query(`INSERT INTO banking.balances (entity_id, account_label, as_of, balance, currency, source) VALUES ($1, $2, $3, $4, $5, 'bank_feed')
      ON CONFLICT (organization_id, account_label, as_of) DO UPDATE SET balance = EXCLUDED.balance, currency = EXCLUDED.currency, entity_id = EXCLUDED.entity_id, updated_at = now() WHERE banking.balances.source = 'bank_feed'`, [entity, label.slice(0, 160), end > today ? today : end, closing / 100, currency])
    closing = opening
  }
  // Payments the bank has since removed, and months no longer covered.
  await db().query('DELETE FROM banking.transactions WHERE account_id = $1 AND feed_ref IS NOT NULL AND NOT (feed_ref = ANY($2::text[]))', [acct, keepRefs])
  await db().query("DELETE FROM banking.statements s WHERE s.account_id = $1 AND s.source = 'feed' AND NOT (s.id = ANY($2::uuid[])) AND NOT EXISTS (SELECT 1 FROM banking.transactions t WHERE t.statement_id = s.id)", [acct, keepStmts])
  return txns.length
}
