// The group live board for GPs and family members: the figures, the layout and whether a screen link is on.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'family')
  const org = (await currentOrg())!
  const row = (await db().query<{ layout: unknown; on: boolean; created: string | null; seen: string | null }>('SELECT layout, screen_hash IS NOT NULL AS on, screen_created_at AS created, screen_seen_at AS seen FROM core.live_boards')).rows[0]
  return { data: await liveBoard(org.id), layout: lbLayout(row?.layout), numbers: LB_NUMBERS, panels: LB_PANELS, screen: { on: !!row?.on, created_at: row?.created ?? null, seen_at: row?.seen ?? null } }
})
