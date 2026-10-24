// Download an emailed export: only the person who asked for it, signed in, within a week.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  const x = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ status: string; storage_key: string | null; file_name: string | null; expired: boolean }>('SELECT status, storage_key, file_name, expires_at < now() AS expired FROM core.exports WHERE id = $1 AND user_id = $2', [id, user.userId])).rows[0] : undefined
  if (!x) throw apiError('not_found', 'This export was not found. Sign in with the account that asked for it.', 404)
  if (x.expired) throw apiError('expired', 'This export has expired. Ask for it again.', 410)
  if (x.status !== 'done' || !x.storage_key) throw apiError('not_ready', x.status === 'failed' ? 'This export failed. Ask for it again.' : 'This export is still being prepared.', 409)
  const bytes = await getObject(x.storage_key)
  setHeader(event, 'content-type', x.file_name?.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'content-disposition', 'attachment; filename="' + (x.file_name ?? 'export') + '"'); setHeader(event, 'cache-control', 'no-store')
  return bytes
})
