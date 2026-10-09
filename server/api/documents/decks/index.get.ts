// Decks with headline numbers.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  const decks = (await db().query<{ id: string; title: string; description: string | null; token: string; primary_deck: boolean; created_at: string; updated_at: string; versions: number; current: string | null }>(
    "SELECT d.id, d.title, d.description, d.token, d.primary_deck, d.created_at, d.updated_at, (SELECT count(*)::int FROM fundraise.deck_versions v WHERE v.deck_id = d.id) AS versions, (SELECT v.filename FROM fundraise.deck_versions v WHERE v.deck_id = d.id ORDER BY v.created_at DESC LIMIT 1) AS current FROM fundraise.decks d WHERE d.active ORDER BY d.primary_deck DESC, d.created_at DESC")).rows
  const out = []
  for (const d of decks) {
    const v = (await db().query<{ email: string | null; visitor_key: string | null; seconds: number; downloads: number; slides: Record<string, number>; pages: number | null; last_at: string }>('SELECT email, visitor_key, seconds, downloads, slides, pages, last_at FROM fundraise.deck_visits WHERE deck_id = $1', [d.id])).rows
    const s = deckStats(v)
    out.push({ ...d, url: await deckUrl(d.token), stats: { total: s.total, unique: s.unique, avg_seconds: s.avg_seconds, downloads: s.downloads, last_view: v.reduce<string | null>((a, x) => (!a || x.last_at > a ? x.last_at : a), null) } })
  }
  const pdfs = (await db().query("SELECT id, title, created_at FROM core.documents WHERE mime_type = 'application/pdf' AND title NOT LIKE 'Update media — %' AND title NOT LIKE 'Intake — %' ORDER BY created_at DESC LIMIT 50")).rows
  return { decks: out, pdfs }
})
