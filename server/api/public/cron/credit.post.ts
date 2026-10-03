// Daily credit reminders to the partners: instalments due in the next 7 days, loans newly in arrears (once per instalment),
// and covenants due in 14 days or overdue. Each item is sent once.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  let total = 0, sentTotal = 0
  for (const org of await liveOrgs()) {
    setOrgContext(org.id)
    if (!(await enabledModules()).has('credit')) continue
    const today = new Date().toISOString().slice(0, 10)
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const items: { key: string; line: string; link: string }[] = []
    const base = await appUrl()
    const loans = await db().query<{ id: string; borrower: string; principal: string; currency: string }>(
      "SELECT l.id, b.name AS borrower, l.principal::text, l.currency FROM credit.loans l JOIN credit.borrowers b ON b.id = l.borrower_id WHERE l.status = 'active'")
    const fmt = (v: number, c: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: c }).format(v)
    for (const l of loans.rows) {
      const pos = await loadPosition(l.id, Number(l.principal))
      if (pos.next && pos.next.due_date <= soon) items.push({ key: 'due:' + l.id + ':' + pos.next.due_date, line: l.borrower + ': ' + fmt(pos.next.amount, l.currency) + ' due ' + pos.next.due_date, link: base + '/credit/' + l.id })
      const late = pos.rows.find((r) => r.status === 'overdue' || r.status === 'partial' && r.due_date < today)
      if (late) items.push({ key: 'late:' + l.id + ':' + late.due_date, line: l.borrower + ': in arrears ' + fmt(pos.arrears, l.currency) + ', ' + pos.dpd + ' days past due', link: base + '/credit/' + l.id })
    }
    const cov = await db().query<{ id: string; title: string; borrower: string; next_due: string; loan_id: string }>(
      `SELECT c.id, c.title, b.name AS borrower, to_char(c.next_due, 'YYYY-MM-DD') AS next_due, c.loan_id FROM credit.covenants c
         JOIN credit.loans l ON l.id = c.loan_id JOIN credit.borrowers b ON b.id = l.borrower_id
        WHERE c.active AND l.status = 'active' AND c.next_due <= current_date + 14`)
    for (const c of cov.rows) items.push({ key: 'cov:' + c.id + ':' + c.next_due + (c.next_due < today ? ':late' : ''), line: c.borrower + ': covenant "' + c.title + '" ' + (c.next_due < today ? 'overdue since ' : 'due ') + c.next_due, link: base + '/credit/' + c.loan_id })
    const seen = new Set((await db().query<{ key: string }>('SELECT key FROM credit.reminders_sent WHERE key = ANY($1::text[])', [items.map((i) => i.key)])).rows.map((r) => r.key))
    const fresh = items.filter((i) => !seen.has(i.key))
    const to = await orgNotifyEmails()
    if (fresh.length && to.length) {
      for (const addr of to) await sendCreditDigest(addr, fresh)
      for (const i of fresh) await db().query('INSERT INTO credit.reminders_sent (key) VALUES ($1) ON CONFLICT DO NOTHING', [i.key])
    }
    total += items.length; sentTotal += fresh.length
  }
  return { ok: true, items: total, sent: sentTotal }
})
