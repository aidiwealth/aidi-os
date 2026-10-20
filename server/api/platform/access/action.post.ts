// Act on access requests: approve (one or a batch; each gets a single-use invitation valid for 14 days, within the
// weekly cap), reject (an email only if asked), flag for a demo, reopen, or keep a note.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const staff = await requirePlatform(event, true)
  const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), action: z.enum(['approve', 'reject', 'demo', 'reopen', 'note']), notes: z.string().max(5000).optional(), email: z.boolean().default(false) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the requests and what to do.')
  const d = b.data
  const rows = (await asPlatform(() => db().query<{ id: string; name: string; email: string; company: string; status: string; want_demo: boolean; signed_up_org: string | null }>('SELECT id, name, email, company, status, want_demo, signed_up_org FROM platform.access_requests WHERE id = ANY($1::uuid[])', [d.ids]))).rows
  if (!rows.length) throw apiError('not_found', 'Not found', 404)
  if (d.action === 'note') { await asPlatform(() => db().query('UPDATE platform.access_requests SET notes = $2, updated_at = now() WHERE id = ANY($1::uuid[])', [d.ids, d.notes?.trim() || null])); return { ok: true } }
  if (d.action === 'demo' || d.action === 'reopen') {
    await asPlatform(() => db().query('UPDATE platform.access_requests SET status = $2, decided_by = $3, updated_at = now() WHERE id = ANY($1::uuid[]) AND signed_up_org IS NULL', [d.ids, d.action === 'demo' ? 'demo' : 'pending', staff.userId]))
    return { ok: true }
  }
  if (d.action === 'reject') {
    await asPlatform(() => db().query("UPDATE platform.access_requests SET status = 'rejected', invite_hash = NULL, decided_by = $2, updated_at = now() WHERE id = ANY($1::uuid[]) AND signed_up_org IS NULL", [d.ids, staff.userId]))
    if (d.email) for (const r of rows.filter((x) => !x.signed_up_org)) { try { await sendAccessDeclined(r.email, r.name) } catch (err) { console.error('[access] decline email', err) } }
    await platformAudit(event, staff.userId, 'access_reject', null, { ids: d.ids, emailed: d.email })
    return { ok: true }
  }
  // Approve: within this week's cap (0 = no cap). Approving again resends a fresh invitation.
  const todo = rows.filter((r) => !r.signed_up_org)
  const acc = await accessSettings()
  if (acc.weekly_cap) {
    const used = await approvedThisWeek(), fresh = todo.filter((r) => r.status !== 'approved').length
    if (used + fresh > acc.weekly_cap) throw apiError('cap', 'This week\'s cap is ' + acc.weekly_cap + ' and ' + used + ' are used: you can approve ' + Math.max(0, acc.weekly_cap - used) + ' more. Raise the cap to approve these.', 409)
  }
  let sent = 0
  for (const r of todo) {
    const { token, hash } = newInvite()
    await asPlatform(() => db().query("UPDATE platform.access_requests SET status = 'approved', invite_hash = $2, invite_expires = now() + make_interval(days => $3), invited_at = CASE WHEN status = 'approved' THEN invited_at ELSE now() END, decided_by = $4, updated_at = now() WHERE id = $1", [r.id, hash, INVITE_DAYS, staff.userId]))
    try { await sendAccessInvite(r.email, r.name, brands().finvry.url + '/start?invite=' + token, INVITE_DAYS, (r.want_demo || r.status === 'demo') && acc.demo_url ? acc.demo_url : null); sent++ } catch (err) { console.error('[access] invite email', err) }
  }
  await platformAudit(event, staff.userId, 'access_approve', null, { ids: todo.map((r) => r.id), sent })
  if (acc.weekly_cap && (await approvedThisWeek()) >= acc.weekly_cap) slack('critical.capacity', 'This week\'s sign-up cap (' + acc.weekly_cap + ') is reached', [['Approved by', staff.email]])
  return { ok: true, sent, failed: todo.length - sent, skipped: rows.length - todo.length }
})
