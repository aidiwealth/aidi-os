// The founder marks a conversation as resolved.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  await db().query("UPDATE services.threads SET status = 'closed', closed_at = now(), closed_by = 'client' WHERE id = $1 AND client_id = $2 AND status = 'open'", [id, u.clientId])
  return { ok: true }
})
