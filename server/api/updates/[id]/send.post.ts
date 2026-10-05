// Send the update. mode: test (to you only), email, email_publish (email + investor page), publish (investor page only).
// Each reader gets their own link (opens tracked) and an unsubscribe link.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('update_send', user.userId, 20, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ mode: z.enum(['test', 'email', 'email_publish', 'publish']) }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const u = (await db().query<{ title: string; blocks: Block[]; cover_id: string | null; from_name: string | null; recipients: Recipients; subject: string | null }>('SELECT title, blocks, cover_id, from_name, recipients, subject FROM financials.updates WHERE id = $1', [id.data])).rows[0]
  if (!u) throw apiError('not_found', 'Not found', 404)
  if (!u.blocks?.length) throw apiError('invalid', 'Add some content before sending.')
  const org = (await currentOrg())!, base = brands().finvry.url, text = blocksText(u.blocks)
  const br = await brandingOf(org.id), look = { logoUrl: br.logo_url, hideFinvry: br.hide_finvry }
  if (b.data.mode === 'test') {
    const html = await renderUpdateDoc(u, { company: org.name, base, email: true, greeting: 'there', viewUrl: base + '/updates/' + id.data, ...look })
    await sendEmail({ to: user.email, subject: '[Test] ' + u.title, text, html })
    return { ok: true, sent: 1 }
  }
  if (b.data.mode === 'publish' || b.data.mode === 'email_publish') await db().query("UPDATE financials.updates SET status = 'published', published_at = coalesce(published_at, now()) WHERE id = $1", [id.data])
  if (b.data.mode === 'publish') return { ok: true, sent: 0 }
  const people = await resolveRecipients(u.recipients ?? { lists: [], stages: [], contacts: [], emails: [] })
  if (!people.length) throw apiError('invalid', 'Choose who to send it to in step 2.')
  let sent = 0
  for (const p of people) {
    await db().query('INSERT INTO crm.contacts (name, email) VALUES ($1,$2) ON CONFLICT (organization_id, email) DO NOTHING', [p.name, p.email])
    const inv = (await db().query<{ id: string }>('SELECT id FROM financials.investors WHERE email = $1', [p.email])).rows[0]
    if (!inv) continue
    const token = randomToken()
    await db().query('INSERT INTO financials.update_sends (update_id, investor_id, token_hash) VALUES ($1,$2,$3) ON CONFLICT (update_id, investor_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, sent_at = now()', [id.data, inv.id, sha256(token)])
    const html = await renderUpdateDoc(u, { company: org.name, base, email: true, greeting: p.name.split(' ')[0], viewUrl: base + '/u/' + token, unsubUrl: base + '/unsub/' + token, pixelUrl: base + '/api/public/u/' + token + '/o', ...look })
    try { await sendEmail({ to: p.email, subject: u.title, text: text + '\n\nRead online: ' + base + '/u/' + token + '\nUnsubscribe: ' + base + '/unsub/' + token, html }); sent++; await logActivity(org.id, p.email, 'update_sent', 'Sent ' + u.title, id.data) }
    catch (err) { console.error('[updates] email failed', err) }
  }
  const r = u.recipients
  const labels = [...(await db().query<{ name: string }>('SELECT name FROM crm.lists WHERE id = ANY($1::uuid[])', [r.lists])).rows.map((x) => x.name), ...(await db().query<{ name: string }>('SELECT name FROM crm.stages WHERE id = ANY($1::uuid[])', [r.stages])).rows.map((x) => x.name)]
  await db().query('UPDATE financials.updates SET sent_at = coalesce(sent_at, now()), sent_count = (SELECT count(*) FROM financials.update_sends WHERE update_id = $1), sent_to = $2 WHERE id = $1', [id.data, labels])
  await audit({ event, actorUserId: user.userId, action: 'updates.send', objectType: 'update', objectId: id.data, detail: { sent } })
  return { ok: true, sent }
})
