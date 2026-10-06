// One published article, as Markdown and HTML.
import { mdRender } from '~/shared/markdown'
export default defineEventHandler(async (event) => {
  blogCors(event)
  const slug = String(getRouterParam(event, 'slug') ?? '')
  if (!/^[a-z0-9][a-z0-9-]{0,118}$/.test(slug)) throw apiError('not_found', 'Not found', 404)
  const org = await aidiOrgId()
  const p = (await asPlatform(() => db().query<{ slug: string; title: string; description: string | null; tag: string | null; body: string; cover_id: string | null; author_name: string | null; published_at: string; seo_title: string | null; seo_description: string | null }>(
    "SELECT slug, title, description, tag, body, cover_id, author_name, to_char(published_at, 'YYYY-MM-DD') AS published_at, seo_title, seo_description FROM content.posts WHERE organization_id = $1 AND slug = $2 AND status = 'published' AND published_at <= now()", [org, slug]))).rows[0]
  if (!p) throw apiError('not_found', 'Not found', 404)
  return { ...p, html: mdRender(p.body), readingTime: readingMinutes(p.body), cover: p.cover_id ? brands().aidi.url + '/api/public/media/' + p.cover_id : null }
})
