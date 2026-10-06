// The PDF for the viewer (streamed from storage so it works under the page's security policy).
export default defineEventHandler(async (event) => {
  const { deck, version } = await deckByToken(String(getRouterParam(event, 'token') ?? ''))
  const visit = await visitFor(deck.id, String(getQuery(event).v ?? ''))
  if (!visit) throw apiError('forbidden', 'Open the deck from its link.', 403)
  const doc = (await db().query<{ storage_key: string }>('SELECT storage_key FROM core.documents WHERE id = $1', [version.document_id])).rows[0]
  if (!doc) throw apiError('not_found', 'Not found', 404)
  setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'cache-control', 'private, no-store')
  if (String(getQuery(event).download ?? '') === '1') {
    if (!deck.allow_download) throw apiError('forbidden', 'Downloads are turned off for this deck.', 403)
    await db().query('UPDATE fundraise.deck_visits SET downloads = downloads + 1, last_at = now() WHERE id = $1', [visit.id])
    setHeader(event, 'content-disposition', 'attachment; filename="' + (version.filename ?? 'deck.pdf').replace(/"/g, '') + '"')
  }
  return Buffer.from(await getObject(doc.storage_key))
})
