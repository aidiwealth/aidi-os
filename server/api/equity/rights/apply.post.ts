// Save rights the founder checked (each matched to a holder, or to none for rights all investors share), and file
// each letter with its holder: Documents (Financing) and the data room's Financing room unless room is off.
import { z } from 'zod'
const Row = z.object({ id: z.string().uuid().optional(), holder_id: z.string().uuid().nullable().default(null), party: z.string().trim().max(200).default(''), kind: z.enum(RIGHT_KINDS), summary: z.string().trim().min(1).max(600),
  impact: z.string().trim().max(600).default(''), clause: z.string().trim().max(300).default(''), document_id: z.string().uuid().nullable().default(null), terms: z.record(z.string(), z.union([z.string().max(120), z.number()])).default({}) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const b = z.object({ ct: z.string().uuid().optional(), rows: z.array(Row).min(1).max(200), room: z.boolean().default(true) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the rights: each needs a type and a summary.')
  const ct = await capTableId(b.data.ct)
  const holders = new Set((await db().query<{ id: string }>('SELECT id FROM equity.holders WHERE captable_id = $1', [ct])).rows.map((r) => r.id))
  let saved = 0; const filed = new Set<string>()
  for (const r of b.data.rows) {
    const hid = r.holder_id && holders.has(r.holder_id) ? r.holder_id : null
    const doc = r.document_id && (await db().query('SELECT 1 FROM core.documents WHERE id = $1', [r.document_id])).rowCount ? r.document_id : null
    const vals = [ct, hid, r.party || null, r.kind, r.summary, r.impact || null, JSON.stringify(r.terms), r.clause || null, doc, user.userId]
    if (r.id) {
      // Moved to another holder: the letter leaves the old holder unless another of their rights still uses it.
      const old = (await db().query<{ holder_id: string | null; document_id: string | null }>('SELECT holder_id, document_id FROM equity.rights WHERE id = $1 AND captable_id = $2', [r.id, ct])).rows[0]
      if (old?.holder_id && old.document_id && old.holder_id !== hid) await db().query("DELETE FROM equity.holder_docs WHERE holder_id = $1 AND document_id = $2 AND kind = 'side_letter' AND NOT EXISTS (SELECT 1 FROM equity.rights WHERE holder_id = $1 AND document_id = $2 AND id <> $3)", [old.holder_id, old.document_id, r.id])
    }
    if (r.id) await db().query('UPDATE equity.rights SET holder_id = $2, party = $3, kind = $4, summary = $5, impact = $6, terms = $7, clause = $8, document_id = $9 WHERE id = $11 AND captable_id = $1', [...vals, r.id])
    else await db().query('INSERT INTO equity.rights (captable_id, holder_id, party, kind, summary, impact, terms, clause, document_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', vals)
    saved++
    if (hid && doc && !filed.has(hid + doc)) { filed.add(hid + doc); await attachHolderDoc({ captableId: ct, holderId: hid, documentId: doc, kind: 'side_letter', round: 'Side letters', hint: r.clause, toRoom: b.data.room, userId: user.userId }).catch((e) => console.error('[rights] attach', (e as Error).message)) }
  }
  await audit({ event, actorUserId: user.userId, action: 'equity.rights_saved', objectType: 'captable', objectId: ct, detail: { rights: saved } })
  return { ok: true, saved }
})
