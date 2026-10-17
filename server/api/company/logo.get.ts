// The company logo set in Settings (used on the investor page, data room, shared links, updates and statements).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = await companyLogoId()
  const mime = id ? (await db().query<{ mime_type: string }>('SELECT mime_type FROM core.documents WHERE id = $1', [id])).rows[0]?.mime_type ?? null : null
  return { id, url: id ? '/api/public/media/' + id : null, pdf_ok: !!mime && /png|jpe?g/.test(mime) }
})
