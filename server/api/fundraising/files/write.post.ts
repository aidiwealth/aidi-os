// Write a document inside a data room (or edit one): the text is kept for editing and the room shares it as a PDF,
// so watermarks, view tracking and downloads work as for any file.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ id: z.string().uuid().optional(), room_id: z.string().uuid().optional(), title: z.string().trim().min(1).max(160), folder: z.string().trim().max(60).default('General'), body: z.string().max(200000) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give the document a title.')
  const d = b.data
  if (d.body.trim().length < 2) throw apiError('invalid', 'Write something first.')
  const org = (await currentOrg())!
  const old = d.id ? (await db().query<{ document_id: string; room_id: string }>('SELECT document_id, room_id FROM fundraise.files WHERE id = $1 AND written', [d.id])).rows[0] : undefined
  if (d.id && !old) throw apiError('not_found', 'Not found', 404)
  const room = old?.room_id ?? await roomId(d.room_id)
  const bytes = await legalPdf(org.name, [{ title: d.title, md: '# ' + d.title + '\n\n' + d.body }])
  const docId = randomUUID(), key = 'documents/' + docId + '.pdf', name = (d.title.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 180) || 'document') + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,'other','normal',$3,'application/pdf',$4,$5)", [docId, 'Data room — ' + name, key, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  let id = d.id
  if (old) {
    await db().query('UPDATE fundraise.files SET document_id = $2, title = $3, folder = $4, body = $5 WHERE id = $1', [d.id, docId, name, d.folder || 'General', d.body])
    await db().query('DELETE FROM core.documents WHERE id = $1', [old.document_id]).catch(() => {})
  } else id = (await one<{ id: string }>('INSERT INTO fundraise.files (document_id, title, folder, room_id, body, written) VALUES ($1,$2,$3,$4,$5,true) RETURNING id', [docId, name, d.folder || 'General', room, d.body])).id
  await audit({ event, actorUserId: user.userId, action: old ? 'fundraising.room_doc_edited' : 'fundraising.room_doc_written', objectType: 'dr_file', objectId: id })
  return { ok: true, id, title: name }
})
