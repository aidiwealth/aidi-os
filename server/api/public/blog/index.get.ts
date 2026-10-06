// Published articles for theaidigroup.com Insights (newest first, featured first).
export default defineEventHandler(async (event) => {
  blogCors(event)
  const org = await aidiOrgId()
  const base = brands().aidi.url
  const r = (await asPlatform(() => db().query<{ slug: string; title: string; description: string | null; tag: string | null; cover_id: string | null; author_name: string | null; published_at: string; featured: boolean; body: string }>(
    "SELECT slug, title, description, tag, cover_id, author_name, to_char(published_at, 'YYYY-MM-DD') AS published_at, featured, body FROM content.posts WHERE organization_id = $1 AND status = 'published' AND published_at <= now() ORDER BY featured DESC, sort, published_at DESC", [org]))).rows
  return { posts: r.map((p) => ({ slug: p.slug, path: '/insights/' + p.slug, title: p.title, description: p.description, tag: p.tag, author: p.author_name, published_at: p.published_at, featured: p.featured, readingTime: readingMinutes(p.body), cover: p.cover_id ? base + '/api/public/media/' + p.cover_id : null })) }
})
