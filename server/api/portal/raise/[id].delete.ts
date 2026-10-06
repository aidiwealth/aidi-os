// Founder: delete one of their raises (not once money is committed or closed). The desk job is cancelled.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  const p = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ id: string; job_id: string | null }>('SELECT id, job_id FROM services.raise_programs WHERE id = $1 AND client_id = $2', [id, u.clientId])).rows[0] : undefined
  if (!p) throw apiError('not_found', 'Not found', 404)
  if ((await db().query("SELECT 1 FROM services.raise_investors WHERE program_id = $1 AND status IN ('committed', 'closed')", [id])).rowCount) throw apiError('committed', 'Investors have committed to this raise, so it cannot be deleted. Message us from Inbox and we will close it.', 409)
  await db().query('DELETE FROM services.raise_programs WHERE id = $1', [id])
  if (p.job_id) { await db().query("UPDATE services.jobs SET status = 'cancelled', updated_at = now() WHERE id = $1", [p.job_id]); await db().query("INSERT INTO services.job_events (job_id, kind, body, visible_to_client) VALUES ($1, 'client_message', 'Deleted this fundraise.', true)", [p.job_id]) }
  await audit({ event, actorUserId: u.userId ?? null, action: 'portal.raise_delete', objectType: 'raise_program', objectId: id })
  return { ok: true }
})
