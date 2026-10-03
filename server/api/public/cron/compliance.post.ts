// Daily reminders, called by a scheduled GitHub Action with the shared secret. Each reminder is sent once per due date:
// "upcoming" when within the obligation's reminder window, "overdue" the first day after it passes.
import { timingSafeEqual } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig().cronSecret
  const given = getRequestHeader(event, 'x-cron-secret') ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw apiError('forbidden', 'Forbidden', 403)
  const due = await db().query<{ id: string; title: string; entity: string; next_due: string; days_left: number; owner_email: string | null; kind: 'upcoming' | 'overdue' }>(
    `SELECT o.id, o.title, e.name AS entity, to_char(o.next_due, 'YYYY-MM-DD') AS next_due, (o.next_due - current_date)::int AS days_left, u.email AS owner_email,
            CASE WHEN o.next_due < current_date THEN 'overdue' ELSE 'upcoming' END AS kind
       FROM compliance.obligations o JOIN core.entities e ON e.id = o.entity_id LEFT JOIN core.users u ON u.id = o.owner_id AND u.status = 'active'
      WHERE o.active AND o.next_due <= current_date + o.reminder_days
        AND NOT EXISTS (SELECT 1 FROM compliance.reminders_sent r WHERE r.obligation_id = o.id AND r.due_date = o.next_due
                          AND r.kind = CASE WHEN o.next_due < current_date THEN 'overdue' ELSE 'upcoming' END)`)
  const fallback = useRuntimeConfig().pitchNotifyTo.split(',').map((s) => s.trim()).filter(Boolean)
  const byRecipient = new Map<string, typeof due.rows>()
  for (const r of due.rows) for (const to of r.owner_email ? [r.owner_email] : fallback) byRecipient.set(to, [...(byRecipient.get(to) ?? []), r])
  let sent = 0
  for (const [to, items] of byRecipient) {
    try { await sendComplianceDigest(to, items); sent++ } catch (err) { console.error('[compliance] reminder failed for ' + to, err); continue }
  }
  for (const r of due.rows) await db().query('INSERT INTO compliance.reminders_sent (obligation_id, due_date, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [r.id, r.next_due, r.kind])
  return { ok: true, obligations: due.rows.length, emails: sent }
})
