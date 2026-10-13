// Upload the signed lease (PDF or image) (admins).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const l = (await db().query<{ tenant_name: string }>('SELECT tenant_name FROM rentals.leases WHERE id = $1', [/^[0-9a-f-]{36}$/.test(id) ? id : '00000000-0000-0000-0000-000000000000'])).rows[0]
  if (!l) throw apiError('not_found', 'Lease not found', 404)
  const f = (await readMultipartFormData(event))?.find((p) => p.name === 'file' && p.filename)
  if (!f || !f.data.length) throw apiError('invalid', 'Choose a file.')
  if (f.data.length > 25 * 1024 * 1024) throw apiError('too_large', 'Up to 25 MB.', 413)
  const doc = await storeFile(event, await havenEntityId(), 'Lease — ' + l.tenant_name, f.filename!, f.data, f.type || 'application/pdf', user.userId)
  await db().query('UPDATE rentals.leases SET document_id = $2 WHERE id = $1', [id, doc])
  return { ok: true, document_id: doc }
})
