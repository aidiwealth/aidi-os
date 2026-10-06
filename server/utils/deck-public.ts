export async function deckByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{12,40}$/.test(token)) throw apiError('not_found', 'This link is not valid.', 404)
  const d = (await asPlatform(() => db().query<{ id: string; organization_id: string; title: string; require_email: boolean; allow_download: boolean }>('SELECT id, organization_id, title, require_email, allow_download FROM fundraise.decks WHERE token = $1 AND active', [token]))).rows[0]
  if (!d) throw apiError('not_found', 'This link is not valid.', 404)
  setOrgContext(d.organization_id)
  const v = (await db().query<{ id: string; document_id: string; filename: string | null; pages: number | null }>('SELECT id, document_id, filename, pages FROM fundraise.deck_versions WHERE deck_id = $1 ORDER BY created_at DESC LIMIT 1', [d.id])).rows[0]
  if (!v) throw apiError('not_found', 'This deck has no file yet.', 404)
  return { deck: d, version: v }
}
export async function visitFor(deckId: string, visit: string) {
  if (!/^[0-9a-f-]{36}$/.test(visit)) return null
  return (await db().query<{ id: string; seconds: number; slides: Record<string, number> }>('SELECT id, seconds, slides FROM fundraise.deck_visits WHERE id = $1 AND deck_id = $2', [visit, deckId])).rows[0] ?? null
}
