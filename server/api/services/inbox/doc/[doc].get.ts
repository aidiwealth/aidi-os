// Download an attachment from a conversation.
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const doc = String(getRouterParam(event, 'doc') ?? '')
  const d = /^[0-9a-f-]{36}$/.test(doc) ? (await db().query<{ storage_key: string; title: string }>('SELECT d.storage_key, d.title FROM core.documents d WHERE d.id = $1 AND EXISTS (SELECT 1 FROM services.messages m WHERE m.document_id = d.id)', [doc])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'Not found', 404)
  return { url: await signedGetUrl({ key: d.storage_key, filename: d.title.split(' — ').pop() ?? 'document', seconds: 120 }) }
})
