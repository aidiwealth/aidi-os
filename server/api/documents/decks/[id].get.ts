// One deck: versions, visitors and per-slide engagement.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  const id = String(getRouterParam(event, 'id') ?? '')
  const d = /^[0-9a-f-]{36}$/.test(id) ? (await db().query<{ id: string; title: string; description: string | null; token: string; primary_deck: boolean; require_email: boolean; allow_download: boolean; created_at: string }>('SELECT id, title, description, token, primary_deck, require_email, allow_download, created_at FROM fundraise.decks WHERE id = $1 AND active', [id])).rows[0] : undefined
  if (!d) throw apiError('not_found', 'Not found', 404)
  const versions = (await db().query('SELECT id, filename, pages, document_id, created_at FROM fundraise.deck_versions WHERE deck_id = $1 ORDER BY created_at DESC', [id])).rows
  const visits = (await db().query<{ id: string; email: string | null; name: string | null; visitor_key: string | null; started_at: string; last_at: string; seconds: number; slides: Record<string, number>; pages: number | null; downloads: number }>(
    'SELECT id, email, name, visitor_key, started_at, last_at, seconds, slides, pages, downloads FROM fundraise.deck_visits WHERE deck_id = $1 ORDER BY last_at DESC LIMIT 500', [id])).rows
  return { deck: { ...d, url: await deckUrl(d.token) }, versions, visits, stats: deckStats(visits) }
})
