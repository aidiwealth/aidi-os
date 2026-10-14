// New deck (upload a PDF, or use one already in Documents), or a new version of an existing deck. A deck can belong
// to one company: people limited to some companies see only their companies' decks (new decks default to theirs).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const parts = (await readMultipartFormData(event)) ?? []
  const field = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8') ?? ''
  const file = parts.find((p) => p.name === 'file' && p.filename && p.data.length)
  const deckId = field('deck_id'), docField = field('document_id')
  let docId: string, filename: string
  if (file) { filename = file.filename ?? 'deck.pdf'; docId = await storeDeckPdf(new Uint8Array(file.data), filename) }
  else if (/^[0-9a-f-]{36}$/.test(docField)) { const d = (await db().query<{ title: string; mime_type: string }>('SELECT title, mime_type FROM core.documents WHERE id = $1', [docField])).rows[0]; if (!d || d.mime_type !== 'application/pdf') throw apiError('bad_type', 'Choose a PDF.'); docId = docField; filename = d.title }
  else throw apiError('invalid', 'Upload a PDF or choose one from Documents.')
  let id = deckId
  if (id) { if (!(await db().query('SELECT 1 FROM fundraise.decks WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404) }
  else {
    const first = !(await db().query('SELECT 1 FROM fundraise.decks WHERE active AND primary_deck')).rowCount
    const scope = String(event.context.entityScope ?? '').split(',').filter(Boolean)
    let ent: string | null = /^[0-9a-f-]{36}$/.test(field('entity_id')) ? field('entity_id') : null
    if (ent && scope.length && !scope.includes(ent)) throw apiError('invalid', 'Choose one of your companies.')
    if (!ent && scope.length) ent = scope[0]!
    id = (await one<{ id: string }>('INSERT INTO fundraise.decks (title, token, primary_deck, created_by, description, entity_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [(field('title').trim() || filename.replace(/\.pdf$/i, '')).slice(0, 200), newDeckToken(), first || field('primary') === '1', user.userId, field('description').trim().slice(0, 500) || null, ent])).id
  }
  if (!deckId && field('primary') === '1') await db().query('UPDATE fundraise.decks SET primary_deck = (id = $1)', [id])
  // All or nothing: a new deck whose file cannot be saved is removed again, so no link points at an empty deck.
  try { await db().query('INSERT INTO fundraise.deck_versions (deck_id, document_id, filename) VALUES ($1,$2,$3)', [id, docId, filename]) }
  catch (err) { if (!deckId) await db().query('DELETE FROM fundraise.decks WHERE id = $1', [id]).catch(() => {}); console.error('[decks] version failed', err); throw apiError('upload_failed', 'The deck could not be saved. Upload the PDF again.', 500) }
  await db().query('UPDATE fundraise.decks SET updated_at = now() WHERE id = $1', [id])
  await db().query('UPDATE fundraise.files SET document_id = $2 WHERE deck_id = $1', [id, docId])
  await audit({ event, actorUserId: user.userId, action: deckId ? 'deck.version' : 'deck.create', objectType: 'deck', objectId: id })
  return { ok: true, id }
})
