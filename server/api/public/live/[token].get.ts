// The office TV: the live board through its view-only screen link (no sign-in). The link opens this board only, read
// only, and stops working the moment it is revoked or replaced.
export default defineEventHandler(async (event) => {
  await rateLimit('live_screen', clientIp(event), 240, 60 * 60 * 1000)
  const token = getRouterParam(event, 'token') ?? ''
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw apiError('not_found', 'This screen link is not valid.', 404)
  const row = await asPlatform(async () => (await db().query<{ org: string; seen: string | null }>('SELECT organization_id AS org, screen_seen_at::text AS seen FROM core.live_boards WHERE screen_hash = $1', [sha256(token)])).rows[0])
  if (!row) throw apiError('not_found', 'This screen link was turned off. Ask a GP for a new one.', 404)
  setOrgContext(row.org)
  if (!row.seen || Date.now() - Date.parse(row.seen) > 10 * 60e3) await db().query('UPDATE core.live_boards SET screen_seen_at = now()')
  const l = (await db().query<{ layout: unknown }>('SELECT layout FROM core.live_boards')).rows[0]
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'x-robots-tag', 'noindex')
  return { data: await liveBoard(row.org), layout: lbLayout(l?.layout), name: (await currentOrg())?.name ?? 'The Aidi Group' }
})
