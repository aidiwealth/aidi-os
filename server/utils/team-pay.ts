// Team pay history with its bank status, and bank payments that look like pay for someone (their name in the line).
import { isDate } from '~/shared/date-range'
export interface PayRow { id: string; person_id: string; person: string; kind: string; entity: string | null; entity_id: string | null; period: string; amount: number; currency: string; paid_on: string; method: string | null; reference: string | null; expense_id: string | null; voucher_id: string | null; notes: string | null
  bank: 'matched' | 'missing' | 'no_statement' | 'no_account'; bank_txn: { id: string; date: string; description: string; account: string } | null; linked: boolean }
export async function teamPayHistory(from: string, to: string) {
  if (!isDate(from) || !isDate(to)) throw apiError('invalid', 'Choose the dates.')
  const rows = (await db().query<Omit<PayRow, 'bank' | 'bank_txn' | 'linked'>>(
    `SELECT h.id, h.person_id, p.name AS person, p.kind, e.name AS entity, p.entity_id, h.period, h.amount::float AS amount, h.currency, to_char(h.paid_on, 'YYYY-MM-DD') AS paid_on, h.method, h.reference, h.expense_id, x.voucher_id, h.notes
       FROM hr.payments h JOIN hr.people p ON p.id = h.person_id LEFT JOIN core.entities e ON e.id = p.entity_id LEFT JOIN finance.expenses x ON x.id = h.expense_id
      WHERE h.paid_on BETWEEN $1 AND $2 ORDER BY h.paid_on DESC, p.name`, [from, to])).rows
  const chk = await paymentChecks()
  const accName = new Map(chk.ledger.accounts.map((a) => [a.id, a.name]))
  const out: PayRow[] = rows.map((r) => { const s = chk.hr_by_id[r.id]; return { ...r, bank: s?.bank ?? 'no_account', linked: !!s?.linked, bank_txn: s?.bank_txn ? { id: s.bank_txn.id, date: s.bank_txn.date, description: s.bank_txn.description, account: accName.get(s.bank_txn.account_id) ?? 'Bank account' } : null } })
  // Unexplained money out in the period whose description carries a team member's name: likely pay that was not logged.
  const people = (await db().query<{ id: string; name: string; entity_id: string | null; currency: string; pay_amount: number | null }>("SELECT id, name, entity_id, currency, pay_amount::float FROM hr.people WHERE status <> 'ended' OR end_date >= $1::date", [from])).rows
  const tokens = (n: string) => n.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4)
  const accById = new Map(chk.ledger.accounts.map((a) => [a.id, a]))
  const suggestions = chk.ledger.txns.filter((t) => !t.matched && t.date >= from && t.date <= to).flatMap((t) => {
    const d = t.description.toLowerCase(), acc = accById.get(t.account_id)
    const hits = people.filter((p) => { const tk = tokens(p.name); return tk.length && tk.filter((x) => d.includes(x)).length >= Math.min(2, tk.length) })
    return hits.length === 1 ? [{ txn_id: t.id, date: t.date, description: t.description, amount: -t.amount, currency: acc?.currency ?? 'USD', account: acc?.name ?? 'Bank account', person_id: hits[0]!.id, person: hits[0]!.name }] : []
  }).slice(0, 50)
  // Unmatched money out that could be linked to a team payment by hand (same currency, within 21 days).
  const open = chk.ledger.txns.filter((t) => !t.matched && t.date >= shift(from, -21) && t.date <= shift(to, 21)).map((t) => ({ id: t.id, date: t.date, description: t.description, amount: -t.amount, currency: accById.get(t.account_id)?.currency ?? 'USD', account: accById.get(t.account_id)?.name ?? 'Bank account' }))
  return { rows: out, suggestions, open }
}
const shift = (d: string, days: number) => new Date(new Date(d + 'T00:00:00Z').getTime() + days * 864e5).toISOString().slice(0, 10)
