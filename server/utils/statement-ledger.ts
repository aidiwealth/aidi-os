// Aidi OS: the statements imported on Bank & cash (each one tied out: opening plus money in, less money out, equals the
// closing balance) feed the same ledger and month-end balances as Finvry's Banking. Spend, the cut list, the
// reconciliation with Financials, cash, burn and runway then all read one set of numbers. Each statement transaction
// is one ledger row (source 'statement', its id as the reference); a statement removed takes its rows and balance with
// it. Statements made from a live bank feed (source 'feed') are left out: the feed is in the ledger already.
// Categories follow the same rules as Finvry (your rules, AI rules, transfers between the group's own companies).
export const STMT_LABEL_SQL = "left(a.bank_name || ' · ' || a.account_name || coalesce(' ··' || a.last4, ''), 160)"
export const stmtLabel = (a: { bank_name: string; account_name: string; last4: string | null }) => (a.bank_name + ' · ' + a.account_name + (a.last4 ? ' ··' + a.last4 : '')).slice(0, 160)
// The payee: the statement's own words before " · " (combined statements put the bank in brackets first), and for
// person-to-person payments ("Zelle payment to Maria Cleaning Services") the person or business paid.
export function stmtPayee(desc: string): { description: string; vendor: string | null } {
  const d = desc.replace(/^\[[^\]]*\]\s*/, '').trim(), head = d.split(' · ')[0]!.trim()
  const m = head.match(/^(?:zelle|venmo|cash app|paypal|wise|remitly)?\s*(?:payment|transfer|pmt|sent)?\s*(?:to|from)\s+(.+)$/i)
  const who = m ? m[1]!.replace(/\([^)]*\)/g, '').replace(/\s+(?:jpm|conf|ref|transaction)\S*.*$/i, '').trim() : ''
  return { description: d || desc, vendor: who.length >= 2 ? who.slice(0, 120) : d.includes(' · ') && head.length >= 2 ? head.slice(0, 120) : null }
}
export async function syncStatementLedger(): Promise<number> {
  const org = await currentOrg(); if (!org || org.kind === 'company') return 0
  // Gone or switched-off accounts and removed statements: their rows and balances go too.
  await db().query(`DELETE FROM banking.ledger l WHERE l.source = 'statement' AND NOT EXISTS (
    SELECT 1 FROM banking.transactions t JOIN banking.accounts a ON a.id = t.account_id WHERE a.active AND t.feed_ref IS NULL AND t.id::text = l.source_ref)`)
  await db().query(`DELETE FROM banking.balances b WHERE b.source = 'statement' AND NOT EXISTS (
    SELECT 1 FROM banking.statements s JOIN banking.accounts a ON a.id = s.account_id WHERE a.active AND s.source <> 'feed' AND ${STMT_LABEL_SQL} = b.account_label AND s.period_end = b.as_of)`)
  // Month-end (statement-end) balances: the closing balance of each statement.
  await db().query(`INSERT INTO banking.balances (entity_id, account_label, as_of, balance, currency, source)
    SELECT DISTINCT ON (${STMT_LABEL_SQL}, s.period_end) a.entity_id, ${STMT_LABEL_SQL}, s.period_end, s.closing_balance, a.currency, 'statement'
      FROM banking.statements s JOIN banking.accounts a ON a.id = s.account_id WHERE a.active AND s.source <> 'feed' AND s.closing_balance IS NOT NULL ORDER BY ${STMT_LABEL_SQL}, s.period_end, s.created_at DESC
    ON CONFLICT (organization_id, account_label, as_of) DO UPDATE SET balance = EXCLUDED.balance, currency = EXCLUDED.currency, entity_id = EXCLUDED.entity_id, source = 'statement', updated_at = now()`)
  // New transactions, a company at a time.
  const rows = (await db().query<{ id: string; d: string; description: string; amount: number; entity_id: string | null; currency: string; bank_name: string; account_name: string; last4: string | null }>(
    `SELECT t.id, t.txn_date::text AS d, t.description, t.amount::float AS amount, a.entity_id, a.currency, a.bank_name, a.account_name, a.last4
       FROM banking.transactions t JOIN banking.accounts a ON a.id = t.account_id
      WHERE a.active AND t.feed_ref IS NULL AND NOT EXISTS (SELECT 1 FROM banking.ledger l WHERE l.source = 'statement' AND l.source_ref = t.id::text) ORDER BY t.txn_date LIMIT 20000`)).rows
  if (!rows.length) return 0
  const by = new Map<string, RailTxn[]>()
  for (const r of rows) (by.get(r.entity_id ?? '') ?? by.set(r.entity_id ?? '', []).get(r.entity_id ?? '')!).push({ ref: r.id, date: r.d, ...stmtPayee(r.description || 'Payment'), amount: r.amount, currency: r.currency, account: stmtLabel(r), entity: r.entity_id })
  let n = 0
  for (const [e, txns] of by) n += await addToLedger('statement', txns, e || null)
  await fixOwnTransfers().catch(() => 0); await pairTransfers().catch(() => 0)
  return n
}
