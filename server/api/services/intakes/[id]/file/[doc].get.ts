export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const id = String(getRouterParam(event, 'id') ?? ''), doc = String(getRouterParam(event, 'doc') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(doc)) throw apiError('not_found', 'Not found', 404)
  const ok = (await db().query("SELECT 1 FROM services.intakes WHERE id = $1 AND files @> jsonb_build_array(jsonb_build_object('doc_id', $2::text))", [id, doc])).rowCount
  const d = ok ? (await db().query<{ storage_key: string; title: string; mime_type: string }>('SELECT storage_key, title, mime_type FROM core.documents WHERE id = $1', [doc])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'Not found', 404)
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title.replace('Intake — ', ''), seconds: 300, inline: d.mime_type.startsWith('image/') || d.mime_type === 'application/pdf' }), 302)
})
