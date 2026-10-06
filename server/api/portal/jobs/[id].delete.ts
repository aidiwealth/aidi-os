// Client: delete one of their own requests (not completed, not paid). The desk is told.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  const j = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ title: string; status: string }>('SELECT title, status FROM services.jobs WHERE id = $1 AND client_id = $2', [id, u.clientId])).rows[0] : undefined
  if (!j) throw apiError('not_found', 'Not found', 404)
  if (j.status === 'completed') throw apiError('completed', 'This request is completed, so it stays on your record.', 409)
  if ((await db().query("SELECT 1 FROM services.invoices WHERE job_id = $1 AND status = 'paid'", [id])).rowCount) throw apiError('paid', 'This request has a paid invoice. Message us from Inbox and we will cancel it and sort out a refund or credit.', 409)
  await db().query('DELETE FROM services.job_events WHERE job_id = $1', [id])
  await db().query('DELETE FROM services.jobs WHERE id = $1', [id])
  await audit({ event, actorUserId: u.userId ?? null, action: 'portal.job_delete', objectType: 'job', objectId: id, detail: { title: j.title, by: u.email } })
  for (const to of await orgNotifyEmails().catch(() => [] as string[])) { try { await sendEmail({ to, subject: u.client + ' deleted a request: ' + j.title, text: u.name + ' (' + u.email + ') deleted the request "' + j.title + '" in Finvry.', html: '<p>' + u.name.replace(/</g, '&lt;') + ' deleted the request <b>' + j.title.replace(/</g, '&lt;') + '</b> in Finvry.</p>' }) } catch { /* best effort */ } }
  return { ok: true }
})
