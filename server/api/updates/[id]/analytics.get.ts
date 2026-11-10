// Who received an investor update and what they did: delivery, first and last open, opens, link clicks, reactions and
// notes, per reader and in total, with unique opens over time and the most-clicked links.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'admin', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const u = (await db().query<{ id: string; title: string; sent_at: string | null; sent_to: string[] | null; status: string; from_name: string | null }>('SELECT id, title, sent_at, sent_to, status, from_name FROM financials.updates WHERE id = $1', [id])).rows[0]
  if (!u) throw apiError('not_found', 'Not found', 404)
  const people = (await db().query<{ id: string; name: string; email: string; firm: string | null; sent_at: string; delivery: string | null; delivery_at: string | null; first_opened_at: string | null; opened_at: string | null; opens: number; clicks: number; last_clicked_at: string | null; reactions: string[]; notes: number }>(
    `SELECT s.id, i.name, i.email, i.firm, s.sent_at, s.delivery, s.delivery_at, s.first_opened_at, CASE WHEN s.opens > 0 THEN s.opened_at END AS opened_at, s.opens, s.clicks, s.last_clicked_at,
       coalesce((SELECT array_agg(r.emoji ORDER BY r.created_at) FROM financials.update_reactions r WHERE r.send_id = s.id), '{}') AS reactions,
       (SELECT count(*)::int FROM financials.update_notes n WHERE n.send_id = s.id) AS notes
     FROM financials.update_sends s JOIN financials.investors i ON i.id = s.investor_id WHERE s.update_id = $1 ORDER BY coalesce(s.opened_at, s.sent_at) DESC`, [id])).rows
  const clicks = (await db().query<{ send_id: string; url: string; created_at: string }>('SELECT send_id, url, created_at FROM financials.update_clicks WHERE update_id = $1 ORDER BY created_at DESC LIMIT 2000', [id])).rows
  const notes = (await db().query<{ send_id: string; body: string; created_at: string }>('SELECT send_id, body, created_at FROM financials.update_notes WHERE update_id = $1 ORDER BY created_at DESC LIMIT 100', [id])).rows
  const byId = new Map(people.map((p) => [p.id, p]))
  const linkMap = new Map<string, { url: string; clicks: number; people: Set<string> }>()
  for (const c of clicks) { const l = linkMap.get(c.url) ?? { url: c.url, clicks: 0, people: new Set<string>() }; l.clicks++; l.people.add(c.send_id); linkMap.set(c.url, l) }
  const reactions: Record<string, number> = {}
  for (const p of people) for (const r of p.reactions) reactions[r] = (reactions[r] ?? 0) + 1
  // Unique opens by day since sending (from each reader's first open).
  // The database hands back dates as Date objects, not text.
  const day = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : null)
  const firsts = people.map((p) => day(p.first_opened_at)).filter((d): d is string => !!d).sort()
  const start = day(u.sent_at) ?? day(people[0]?.sent_at) ?? new Date().toISOString().slice(0, 10), days: { day: string; opens: number }[] = []
  for (let d = new Date(start + 'T00:00:00Z'), n = 0, i = 0; d <= new Date() && days.length < 60; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10); while (i < firsts.length && firsts[i]! <= k) { n++; i++ } days.push({ day: k, opens: n })
  }
  const n = people.length, opened = people.filter((p) => p.opens > 0).length
  return {
    update: { id: u.id, title: u.title, sent_at: u.sent_at, sent_to: u.sent_to ?? [], from_name: u.from_name },
    totals: { sent: n, delivered: people.filter((p) => p.delivery === 'delivered' || p.opens > 0).length, bounced: people.filter((p) => p.delivery === 'bounced' || p.delivery === 'complained' || p.delivery === 'failed').length, tracked: people.some((p) => p.delivery && p.delivery !== 'sent'),
      unique_opens: opened, total_opens: people.reduce((a, p) => a + p.opens, 0), open_rate: n ? opened / n : 0, clicks: clicks.length, clickers: new Set(clicks.map((c) => c.send_id)).size, reactions: people.reduce((a, p) => a + p.reactions.length, 0), notes: notes.length },
    timeline: days, reactions,
    links: [...linkMap.values()].map((l) => ({ url: l.url, clicks: l.clicks, people: l.people.size })).sort((a, b) => b.clicks - a.clicks).slice(0, 10),
    notes: notes.map((x) => ({ name: byId.get(x.send_id)?.name ?? '', email: byId.get(x.send_id)?.email ?? '', body: x.body, at: x.created_at })),
    people: people.map((p) => ({ ...p, links: clicks.filter((c) => c.send_id === p.id).map((c) => ({ url: c.url, at: c.created_at })) })),
  }
})
