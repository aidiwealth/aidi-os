// Save all SAFE documents (one PDF) to Documents.
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const s = (await db().query("SELECT *, amount::float AS amount, valuation_cap::float AS valuation_cap, discount::float AS discount, to_char(safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes WHERE id = $1", [id.data])).rows[0] as SafeRow | undefined
  if (!s) throw apiError('not_found', 'Not found', 404)
  const bytes = await legalPdf(s.company_name, safeDocs(s))
  const doc = randomUUID(), key = 'documents/' + doc + '.pdf', title = ('SAFE - ' + s.investor_name + ' - ' + s.safe_date + '.pdf').replace(/[^A-Za-z0-9 ._()-]/g, '').slice(0, 200)
  await putObject({ key, body: bytes, contentType: 'application/pdf' })
  await db().query("INSERT INTO core.documents (id, entity_id, title, kind, sensitivity, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,'other','normal',$4,'application/pdf',$5,$6)", [doc, await companyEntityId().catch(() => null), title, key, bytes.length, createHash('sha256').update(bytes).digest('hex')])
  await audit({ event, actorUserId: user.userId, action: 'fundraising.safe_saved', objectType: 'safe', objectId: id.data })
  return { ok: true, id: doc }
})
