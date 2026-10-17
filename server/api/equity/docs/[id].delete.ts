// Detach a document from a holder. The file stays in Documents; it is taken out of the data room's Financing room.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const r = (await db().query<{ room_file_id: string | null }>('DELETE FROM equity.holder_docs WHERE id = $1 RETURNING room_file_id', [id])).rows[0]
  if (!r) throw apiError('not_found', 'Not found', 404)
  if (r.room_file_id) await db().query('DELETE FROM fundraise.files WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM equity.holder_docs WHERE room_file_id = $1)', [r.room_file_id])
  await audit({ event, actorUserId: user.userId, action: 'equity.doc_detached', objectType: 'holder_doc', objectId: id })
  return { ok: true }
})
