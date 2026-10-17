// Attach a document to a holder already on the cap table (and to one of their SAFEs / notes or share issuances):
// an uploaded file, or one already in Documents. Filed under Financing, and in the data room's Financing room by
// funding round unless "room" is off.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  await requireModule(event, 'equity')
  const parts = (await readMultipartFormData(event)) ?? []
  const val = (k: string) => parts.find((p) => p.name === k && !p.filename)?.data.toString('utf8') ?? ''
  const b = z.object({ ct: z.string().uuid().optional(), holder_id: z.string().uuid(), convertible_id: z.string().uuid().optional(), issuance_id: z.string().uuid().optional(),
    document_id: z.string().uuid().optional(), kind: z.enum(['safe', 'note', 'spa', 'certificate', 'side_letter', 'other']).default('other'), round: z.string().trim().max(60).optional(), room: z.enum(['0', '1']).default('1') })
    .safeParse(Object.fromEntries(['ct', 'holder_id', 'convertible_id', 'issuance_id', 'document_id', 'kind', 'round', 'room'].map((k) => [k, val(k) || undefined])))
  if (!b.success) throw apiError('invalid', 'Choose the holder and the document.')
  const ct = await capTableId(b.data.ct)
  const files = parts.filter((p) => p.filename && p.data?.length)
  if (!files.length && !b.data.document_id) throw apiError('invalid', 'Add the document.')
  const holder = (await db().query<{ name: string }>('SELECT name FROM equity.holders WHERE id = $1 AND captable_id = $2', [b.data.holder_id, ct])).rows[0]
  if (!holder) throw apiError('not_found', 'That holder is not on this cap table.', 404)
  const entity = await companyEntityId()
  const ids: { id: string; hint: string }[] = b.data.document_id ? [{ id: b.data.document_id, hint: '' }] : []
  for (const f of files.slice(0, 10)) ids.push({ id: await storeFinancingDoc({ name: f.filename!, data: Buffer.from(f.data) }, (HOLDER_DOC_KINDS[b.data.kind] ?? 'Document') + ' — ' + holder.name, entity), hint: f.filename ?? '' })
  const out = []
  for (const d of ids) out.push(await attachHolderDoc({ captableId: ct, holderId: b.data.holder_id, convertibleId: b.data.convertible_id, issuanceId: b.data.issuance_id, documentId: d.id, kind: b.data.kind, round: b.data.round, hint: d.hint, toRoom: b.data.room === '1', userId: user.userId }))
  await audit({ event, actorUserId: user.userId, action: 'equity.doc_attached', objectType: 'holder', objectId: b.data.holder_id, detail: { documents: ids.length, kind: b.data.kind } })
  return { ok: true, attached: out.length, round: out[0]?.round ?? null, in_room: out.some((x) => x.in_room) }
})
