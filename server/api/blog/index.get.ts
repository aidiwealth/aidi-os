export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  return (await db().query("SELECT id, slug, title, description, tag, status, featured, sort, cover_id, author_name, to_char(published_at, 'YYYY-MM-DD') AS published_at, updated_at, length(body) AS chars FROM content.posts ORDER BY coalesce(published_at, updated_at) DESC")).rows
})
