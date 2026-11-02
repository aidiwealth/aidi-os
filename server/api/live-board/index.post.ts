import { z } from 'zod'
// Change the live board: its layout (which numbers and panels show, in what order, and the ticker), or the view-only
// screen link for the office TV (a new link replaces the old one; only a hash of it is kept, so it is shown once).
const Item = z.object({ key: z.string().max(40), on: z.boolean() })
const B = z.discriminatedUnion('action', [
  z.object({ action: z.literal('layout'), layout: z.object({ numbers: z.array(Item).max(30), panels: z.array(Item).max(20), ticker: z.boolean() }) }),
  z.object({ action: z.literal('screen') }), z.object({ action: z.literal('screen_off') })])
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'family')
  const b = B.safeParse(await readBody(event)); if (!b.success) throw apiError('invalid', 'Check the layout.')
  await db().query('INSERT INTO core.live_boards (updated_by) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING', [user.userId])
  if (b.data.action === 'layout') {
    const l = lbLayout(b.data.layout)
    await db().query('UPDATE core.live_boards SET layout = $1, updated_by = $2, updated_at = now()', [JSON.stringify(l), user.userId])
    return { layout: l }
  }
  if (b.data.action === 'screen_off') {
    await db().query('UPDATE core.live_boards SET screen_hash = NULL, screen_created_at = NULL, screen_seen_at = NULL, updated_at = now()')
    await audit({ event, actorUserId: user.userId, action: 'live_board.screen_off', objectType: 'organization', objectId: (await currentOrg())!.id })
    return { ok: true }
  }
  const token = randomToken()
  await db().query('UPDATE core.live_boards SET screen_hash = $1, screen_created_at = now(), screen_created_by = $2, screen_seen_at = NULL, updated_at = now()', [sha256(token), user.userId])
  await audit({ event, actorUserId: user.userId, action: 'live_board.screen_link', objectType: 'organization', objectId: (await currentOrg())!.id })
  return { url: brands().aidi.url + '/screen/' + token }
})
