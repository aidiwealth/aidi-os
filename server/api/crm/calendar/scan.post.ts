// Read your own calendar (past 30 days, next 90) and suggest investor meetings to add, matched to pipeline investors.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  rateLimit('cal_scan', user.userId, 20, 60 * 60 * 1000)
  const c = (await db().query<{ source_url: string | null }>('SELECT source_url FROM crm.calendar LIMIT 1')).rows[0]
  const url = c?.source_url ? calendarUrlOk(c.source_url) : null
  if (!url) throw apiError('invalid', 'Add your calendar address first.')
  let text = ''
  try { const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Finvry calendar sync' } }); if (!r.ok) throw new Error(String(r.status)); text = (await r.text()).slice(0, 15_000_000) }
  catch { throw apiError('fetch_failed', 'Could not read your calendar. Check that the address is the private (secret) iCal link and try again.', 502) }
  const from = Date.now() - 30 * 86400e3, to = Date.now() + 90 * 86400e3
  const evs = parseIcs(text, 20000).filter((e) => { const t = new Date(e.starts_at).getTime(); return t >= from && t <= to })
  const deals = (await db().query<{ id: string; investor: string; contact_email: string | null; contact_name: string | null; pipeline: string }>('SELECT d.id, d.investor, c.email AS contact_email, c.name AS contact_name, p.name AS pipeline FROM crm.deals d JOIN crm.pipelines p ON p.id = d.pipeline_id LEFT JOIN crm.contacts c ON c.id = d.contact_id')).rows
  const known = new Set((await db().query<{ uid: string }>('SELECT uid FROM crm.meetings WHERE uid IS NOT NULL')).rows.map((r) => r.uid))
  await db().query('UPDATE crm.calendar SET scanned_at = now()')
  const out = evs.map((e) => { const m = matchDeal(e, deals); const d = m ? deals.find((x) => x.id === m.id) : null; return m ? { ...e, deal_id: m.id, investor: d?.investor, pipeline: d?.pipeline, why: m.why, added: !!e.uid && known.has(e.uid) } : null }).filter(Boolean)
  return { scanned: evs.length, matches: out.slice(0, 100) }
})
