// Remove a file the client uploaded by mistake (before submitting).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const r = await infoFromToken(getRouterParam(event, 'token'))
  if (r.status === 'submitted') throw apiError('state', 'This information has already been submitted.', 409)
  const b = z.object({ document_id: z.string().uuid() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a file.')
  const d = await db().query<{ storage_key: string }>('DELETE FROM core.documents d USING services.request_files f WHERE f.document_id = d.id AND f.request_id = $1 AND d.id = $2 RETURNING d.storage_key', [r.id, b.data.document_id])
  if (d.rows[0]) { try { await deleteObject(d.rows[0].storage_key) } catch (err) { console.error('[intake] file not removed', err) } }
  return { ok: true }
})
