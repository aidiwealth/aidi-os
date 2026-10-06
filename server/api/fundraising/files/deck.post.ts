// Put a deck from Decks into the data room (its latest version). Optionally make it the pitch deck.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const b = z.object({ deck_id: z.string().uuid(), folder: z.string().trim().max(60).default('General'), is_deck: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a deck.')
  const d = (await db().query<{ title: string; document_id: string }>('SELECT k.title, v.document_id FROM fundraise.decks k JOIN LATERAL (SELECT document_id FROM fundraise.deck_versions WHERE deck_id = k.id ORDER BY created_at DESC LIMIT 1) v ON true WHERE k.id = $1 AND k.active', [b.data.deck_id])).rows[0]
  if (!d) throw apiError('not_found', 'That deck has no file yet.', 404)
  if (b.data.is_deck) await db().query('UPDATE fundraise.files SET is_deck = false')
  const ex = (await db().query<{ id: string }>('SELECT id FROM fundraise.files WHERE deck_id = $1', [b.data.deck_id])).rows[0]
  if (ex) await db().query('UPDATE fundraise.files SET document_id = $2, title = $3, is_deck = $4 WHERE id = $1', [ex.id, d.document_id, d.title, b.data.is_deck])
  else await db().query('INSERT INTO fundraise.files (document_id, title, folder, is_deck, deck_id) VALUES ($1,$2,$3,$4,$5)', [d.document_id, d.title, b.data.is_deck ? 'Pitch deck' : (b.data.folder || 'General'), b.data.is_deck, b.data.deck_id])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.room_add_deck', objectType: 'deck', objectId: b.data.deck_id })
  return { ok: true }
})
