// Save a drafted document as a PDF in Documents (filed under the company), or return the PDF to download.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const b = z.object({ title: z.string().trim().min(1).max(200), body: z.string().min(1).max(60000), download: z.boolean().default(false), entity_id: z.string().uuid().optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'The document is empty.')
  const org = (await currentOrg())!
  const bytes = await markdownPdf(b.data.title, b.data.body, org.name)
  const name = b.data.title.replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 150) || 'Document'
  if (b.data.download) { setHeader(event, 'content-type', 'application/pdf'); setHeader(event, 'content-disposition', 'attachment; filename="' + name + '.pdf"'); return Buffer.from(bytes) }
  const id = randomUUID(), key = 'documents/' + id + '.pdf'
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256, uploaded_by) VALUES ($1,$2,$3,'other','normal',$4,'application/pdf',$5,$6,$7)",
    [id, b.data.entity_id && (await db().query('SELECT 1 FROM core.entities WHERE id = $1', [b.data.entity_id])).rowCount ? b.data.entity_id : await companyEntityId(), name + '.pdf', key, bytes.length, createHash('sha256').update(bytes).digest('hex'), user.userId])
  await audit({ event, actorUserId: user.userId, action: 'docgen.save', objectType: 'document', objectId: id })
  return { ok: true, id }
})
