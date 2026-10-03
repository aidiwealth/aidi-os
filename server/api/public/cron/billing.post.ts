// Daily billing: on each subscription's renewal date create the period's invoice; card subscriptions are charged on
// the saved card (a failure marks the customer past due and emails the pay link); invoice subscriptions are emailed.
// Overdue invoices get a reminder at most weekly.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const today = new Date().toISOString().slice(0, 10)
  const s = await billingSettings()
  const subs = await asPlatform(() => db().query<{ id: string; organization_id: string; plan: string; billing: string; method: string; currency: string; amount_usd: string; start_date: string }>(
    "SELECT s.id, s.organization_id, p.name AS plan, s.billing, s.method, s.currency, s.amount_usd::text, to_char(s.start_date, 'YYYY-MM-DD') AS start_date FROM platform.subscriptions s JOIN core.plans p ON p.code = s.plan_code WHERE s.status <> 'ended' AND s.start_date <= current_date"))
  let created = 0, charged = 0, failed = 0, reminded = 0
  for (const sub of subs.rows) {
    const due = sub.start_date === today || nextRenewal(sub.start_date, sub.billing, today) === today
    if (!due) continue
    const months = sub.billing === 'annual' ? 12 : 1
    const end = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 + months, +today.slice(8, 10) - 1)).toISOString().slice(0, 10)
    const admin = (await asPlatform(() => db().query<{ name: string; email: string }>(
      `SELECT p.full_name AS name, u.email FROM core.memberships m JOIN core.users u ON u.id = m.user_id JOIN core.people p ON p.id = u.person_id
         JOIN core.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id AND r.role_code = 'admin' WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY m.created_at LIMIT 1`, [sub.organization_id]))).rows[0]
    const last = (await asPlatform(() => db().query<{ bill_to: { name: string; email: string; address?: string } }>('SELECT bill_to FROM platform.invoices WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1', [sub.organization_id]))).rows[0]
    const billTo = last?.bill_to ?? (admin ? { name: admin.name, email: admin.email } : null)
    if (!billTo) continue
    const card = sub.method !== 'invoice'
    const ins = await asPlatform(() => db().query<{ id: string }>(
      `INSERT INTO platform.invoices (number, organization_id, subscription_id, issue_date, due_date, period_start, period_end, currency, lines, amount, bill_to, status)
       VALUES ($1 || '-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('platform.invoice_number_seq')::text, 4, '0'), $2, $3, current_date, current_date + $4::int, current_date, $5, $6, $7, $8, $9, 'sent')
       ON CONFLICT (subscription_id, period_start) WHERE subscription_id IS NOT NULL AND period_start IS NOT NULL AND status <> 'void' DO NOTHING RETURNING id`,
      [s.invoice_prefix || 'FIN', sub.organization_id, sub.id, card ? 0 : s.payment_terms_days, end, sub.currency,
        JSON.stringify([{ description: 'Finvry ' + sub.plan + ' plan (' + (months === 12 ? 'annual' : 'monthly') + ')', quantity: 1, unit_amount: Number(sub.amount_usd), amount: Number(sub.amount_usd) }]), sub.amount_usd, JSON.stringify(billTo)]))
    const invId = ins.rows[0]?.id
    if (!invId) continue
    created++
    const inv = (await loadInvoice(invId))!
    let paid = false, declined = false
    if (card) {
      const r = await chargeSaved(inv, sub.method as Provider)
      if (r.ok) { paid = true; charged++ }
      else if (!r.noCard && r.reason !== 'Payment processing') {
        declined = true
        failed++
        await asPlatform(async () => {
          await db().query("UPDATE platform.subscriptions SET status = 'past_due' WHERE id = $1", [sub.id])
          await db().query("UPDATE core.organizations SET status = 'past_due' WHERE id = $1 AND status = 'active'", [sub.organization_id])
        })
      }
    }
    if (!paid) {
      setOrgContext(inv.organization_id)
      try { await sendInvoiceEmail(inv, s, { payUrl: providersFor(inv.currency).length ? await payUrl(inv.id, inv.organization_id) : undefined, failedCharge: declined }) } catch (err) { console.error('[billing] email failed ' + inv.number, err) }
      setOrgContext(null)
    }
  }
  const overdue = await asPlatform(() => db().query<{ id: string }>(
    "SELECT id FROM platform.invoices WHERE status = 'sent' AND due_date < current_date AND (reminder_sent_at IS NULL OR reminder_sent_at < now() - interval '7 days')"))
  for (const o of overdue.rows) {
    const inv = (await loadInvoice(o.id))!
    setOrgContext(inv.organization_id)
    try { await sendInvoiceEmail(inv, s, { payUrl: providersFor(inv.currency).length ? await payUrl(inv.id, inv.organization_id) : undefined, reminder: true }); reminded++ } catch (err) { console.error('[billing] reminder failed ' + inv.number, err) }
    setOrgContext(null)
    await asPlatform(() => db().query('UPDATE platform.invoices SET reminder_sent_at = now() WHERE id = $1', [o.id]))
  }
  return { ok: true, created, charged, failed, reminded }
})
