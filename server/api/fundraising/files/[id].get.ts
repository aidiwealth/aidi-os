// A written data room document, for editing.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const f = (await db().query('SELECT id, title, folder, body, room_id FROM fundraise.files WHERE id = $1 AND written', [getRouterParam(event, 'id')])).rows[0]
  if (!f) throw apiError('not_found', 'Not found', 404)
  return f
})
