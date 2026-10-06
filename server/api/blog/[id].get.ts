export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const p = (await db().query("SELECT id, slug, title, description, tag, body, cover_id, author_name, status, featured, sort, to_char(published_at, 'YYYY-MM-DD') AS published_at, seo_title, seo_description FROM content.posts WHERE id = $1", [id])).rows[0]
  if (!p) throw apiError('not_found', 'Not found', 404)
  return p
})
