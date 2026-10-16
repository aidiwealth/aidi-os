import { secondarySource, ingestSecondaries } from '~/server/utils/secondaries'
// Look through Notices for Meridian and Wefunder deal alerts (e.g. ones that arrived before this page existed) and
// add any opportunities not yet on Secondaries.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const ns = (await db().query<{ id: string; from_email: string | null; subject: string; text_body: string | null; html_body: string | null; received_at: string }>(
    "SELECT id, from_email, subject, text_body, html_body, received_at::text FROM inbox.notices WHERE from_email ILIKE '%angellist.com%' OR from_email ILIKE '%wefunder.com%' OR subject ILIKE '%meridian%' OR subject ILIKE '%wefunder%' ORDER BY received_at DESC LIMIT 500")).rows
  let added = 0, emails = 0
  for (const n of ns) {
    if (!secondarySource(n.from_email ?? '', n.subject, n.text_body ?? '')) continue
    emails++; added += await ingestSecondaries(n)
    // Deal alerts live on Secondaries now, so file them away in Notices.
    await db().query("UPDATE inbox.notices SET status = 'done', done_at = now() WHERE id = $1 AND status = 'new'", [n.id])
  }
  return { ok: true, emails, added }
})
