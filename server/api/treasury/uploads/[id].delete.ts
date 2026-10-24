// Delete an uploaded statement and the transactions it brought in.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const sc = await forecastScope(event), r = await deleteUpload(id, sc.group ? sc.companies.map((c) => c.id) : [sc.entity ?? ''])
  if (!r) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'treasury.upload_delete', objectType: 'bank_upload', objectId: id, detail: { removed: r.removed } })
  return { ok: true, removed: r.removed }
})
