// New deck (upload a PDF, or use one already in Documents), or a new version of an existing deck.
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
    id = (await one<{ id: string }>('INSERT INTO fundraise.decks (title, token, primary_deck, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [(field('title') || filename.replace(/\.pdf$/i, '')).slice(0, 200), newDeckToken(), first, user.userId])).id
  }
  await db().query('INSERT INTO fundraise.deck_versions (deck_id, document_id, filename) VALUES ($1,$2,$3)', [id, docId, filename])
  await db().query('UPDATE fundraise.decks SET updated_at = now() WHERE id = $1', [id])
  await db().query('UPDATE fundraise.files SET document_id = $2 WHERE deck_id = $1', [id, docId])
  await audit({ event, actorUserId: user.userId, action: deckId ? 'deck.version' : 'deck.create', objectType: 'deck', objectId: id })
  return { ok: true, id }
})
