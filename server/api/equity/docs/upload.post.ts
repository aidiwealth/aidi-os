// Store a letter (side letter, pro rata letter, rights agreement) in Documents under Financing and return its id, for
// a right to point to. Filing it with the holder and in the data room happens when the right is saved.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const parts = (await readMultipartFormData(event)) ?? []
  const f = parts.find((p) => p.filename && p.data?.length)
  if (!f) throw apiError('invalid', 'Add the document.')
  const title = (parts.find((p) => p.name === 'title' && !p.filename)?.data.toString('utf8') ?? '').trim().slice(0, 160) || (f.filename ?? 'Letter').replace(/\.[a-z0-9]+$/i, '')
  const id = await storeFinancingDoc({ name: f.filename!, data: Buffer.from(f.data) }, title, await companyEntityId())
  return { document_id: id, title }
})
