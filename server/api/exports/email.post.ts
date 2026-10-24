// A longer export (up to a year): built in the background, stored for a week, and emailed to the person as a link.
// One at a time per person, ten a day.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ kind: z.string().max(40), format: z.enum(['xlsx', 'csv']).default('xlsx'), from: z.string().optional(), to: z.string().optional() }).safeParse(await readBody(event))
  const k = b.success ? EXPORTS[b.data.kind] : undefined
  if (!b.success || !k) throw apiError('invalid', 'Choose what to export.')
  const r = exportRange(k, b.data.from, b.data.to, EMAIL_DAYS)
  await rateLimit('export_email', user.userId, 10, 24 * 60 * 60 * 1000)
  if ((await db().query("SELECT 1 FROM core.exports WHERE user_id = $1 AND status = 'running' AND created_at > now() - interval '30 minutes'", [user.userId])).rowCount) throw apiError('busy', 'Your last export is still being prepared. It will arrive by email shortly.', 429)
  const id = (await one<{ id: string }>('INSERT INTO core.exports (user_id, kind, params) VALUES ($1,$2,$3) RETURNING id', [user.userId, b.data.kind, JSON.stringify({ ...r, format: b.data.format, cust: getQuery(event).cust ?? null })])).id
  const link = getRequestURL(event).origin + '/exports/' + id
  // Old exports go: their files and rows.
  for (const o of (await db().query<{ id: string; storage_key: string | null }>('DELETE FROM core.exports WHERE expires_at < now() RETURNING id, storage_key')).rows) if (o.storage_key) await deleteObject(o.storage_key).catch(() => {})
  inBackground('export:' + id, async () => {
    // Wait for a free slot (a minute at most), so emailed exports never crowd out the site.
    let took = false
    for (let i = 0; i < 20 && !(took = exportSlotTake()); i++) await new Promise((res) => setTimeout(res, 3000))
    try {
      const f = await toFile(await k.build(event, r.from, r.to), b.data.format), key = 'exports/' + id + '.' + b.data.format
      await putObject({ key, body: f.bytes, contentType: f.mime })
      await db().query("UPDATE core.exports SET status = 'done', storage_key = $2, file_name = $3 WHERE id = $1", [id, key, f.file])
      await sendExportEmail(user.email, k.label + ', ' + r.from + ' to ' + r.to, link, 7)
    } catch (e) { await db().query("UPDATE core.exports SET status = 'failed', error = $2 WHERE id = $1", [id, String((e as Error).message).slice(0, 500)]); throw e } finally { if (took) exportSlotGive() }
  })
  await audit({ event, actorUserId: user.userId, action: 'export.email', objectType: 'export', objectId: id, detail: { kind: b.data.kind, from: r.from, to: r.to } })
  return { ok: true, email: user.email }
})
