// Open a payment voucher or its supporting document.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  const d = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ storage_key: string; title: string }>('SELECT d.storage_key, d.title FROM core.documents d WHERE d.id = $1 AND EXISTS (SELECT 1 FROM finance.expenses x WHERE x.voucher_id = d.id OR x.attachment_id = d.id)', [id])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'Not found', 404)
  return sendRedirect(event, await signedGetUrl({ key: d.storage_key, filename: d.title, seconds: 300, inline: true }))
})
